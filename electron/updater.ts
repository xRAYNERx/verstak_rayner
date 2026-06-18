import { autoUpdater } from 'electron-updater'
import { app, BrowserWindow, ipcMain } from 'electron'
import {
  fetchAllReleaseNotesMerged,
  fetchReleaseArtifactMeta,
  fetchReleaseNoteMerged,
  fetchReleaseNotesSince,
  fetchRemoteVersion,
  rateLimitWaitMinutes,
  isBenignUpdaterError,
  type GithubRateLimitInfo,
  releaseArtifactsReady,
  releaseFeedBase,
  resolveInstallableUpdate,
  semverGt,
} from './update-remote'
import {
  clearAllUpdaterCache,
  clearBrokenDifferentialCache,
  clearPendingIfWrongVersion,
  clearPendingUpdateCache,
  reconcileCachedDownload,
} from './updater-cache'

autoUpdater.logger = null
autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = false
autoUpdater.disableDifferentialDownload = true

const PERIODIC_CHECK_MS = 4 * 60 * 60 * 1000
const DOWNLOAD_STALL_MS = 3 * 60 * 1000
const CHECK_TIMEOUT_MS = 45_000
const UPDATER_RPC_TIMEOUT_MS = 25_000

export type UpdatePhase = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'

export type UpdateErrorCode = 'network' | 'github-rate-limit'

export type UpdateSnapshot = {
  phase: UpdatePhase
  version?: string
  percent?: number
  error?: string
  errorCode?: UpdateErrorCode
  rateLimitMinutes?: number
  pendingRelease?: boolean
}

let snapshot: UpdateSnapshot = { phase: 'idle' }
let lastProbeVersion: string | null = null
let lastProbePending = false
let checkInFlight = false
let downloadInFlight = false
let downloadForVersion: string | null = null
let usedGenericFeed = false
let lastProgressAt = 0
let stallTimer: ReturnType<typeof setTimeout> | null = null
let releaseNotesIpcRegistered = false
let updaterIpcRegistered = false
let quitCleanupRegistered = false
let quittingForInstall = false
let shuttingDown = false
let periodicCheckTimer: ReturnType<typeof setInterval> | null = null
let checkPromise: Promise<void> | null = null
const NETWORK_CHECK_ERROR = 'Не удалось проверить обновления. Проверьте интернет и попробуйте снова.'

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timeout`)), ms)
    promise.then(
      (v) => { clearTimeout(timer); resolve(v) },
      (e) => { clearTimeout(timer); reject(e) },
    )
  })
}

function isNewerThanInstalled(target: string | null | undefined): boolean {
  if (!target) return false
  return semverGt(target, app.getVersion())
}

function probeSaysNewer(): boolean {
  return !!lastProbeVersion && isNewerThanInstalled(lastProbeVersion)
}

function shutdownUpdater(): void {
  if (shuttingDown) return
  shuttingDown = true
  if (periodicCheckTimer) {
    clearInterval(periodicCheckTimer)
    periodicCheckTimer = null
  }
  clearStallTimer()
  checkInFlight = false
  downloadInFlight = false
  try {
    autoUpdater.removeAllListeners()
  } catch (err) {
    console.warn('[updater] removeAllListeners failed:', err)
  }
  if (app.isPackaged && !quittingForInstall) {
    clearAllUpdaterCache()
  }
}

export function registerUpdaterQuitCleanup(): void {
  if (quitCleanupRegistered) return
  quitCleanupRegistered = true
  app.on('before-quit', () => shutdownUpdater())
}

function clearStallTimer(): void {
  if (stallTimer) {
    clearTimeout(stallTimer)
    stallTimer = null
  }
}

function reconcileStaleDownloadedUpdate(target?: string | null): boolean {
  const remote = target ?? lastProbeVersion
  if (remote && isNewerThanInstalled(remote)) return false
  clearPendingUpdateCache()
  return true
}

export function registerReleaseNotesIpc(): void {
  if (releaseNotesIpcRegistered) return
  releaseNotesIpcRegistered = true

  ipcMain.handle('update:get-release-notes', async (_e, opts?: {
    sinceVersion?: string
    upToVersion?: string
    version?: string
    all?: boolean
  }) => {
    try {
      if (opts?.all) return fetchAllReleaseNotesMerged()
      if (opts?.version) {
        const note = await fetchReleaseNoteMerged(opts.version)
        return note ? [note] : []
      }
      if (opts?.sinceVersion && opts?.upToVersion) {
        return fetchReleaseNotesSince(opts.sinceVersion, opts.upToVersion)
      }
      const note = await fetchReleaseNoteMerged(app.getVersion())
      return note ? [note] : []
    } catch (err) {
      console.warn('[updater] get-release-notes failed:', err)
      return []
    }
  })
}

function sendToRenderer(win: BrowserWindow, channel: string, data?: unknown): void {
  if (shuttingDown) return
  try {
    if (!win.isDestroyed()) win.webContents.send(channel, data)
  } catch { /* window might be closing */ }
}

export function initAutoUpdater(mainWindow: BrowserWindow): void {
  registerReleaseNotesIpc()
  registerUpdaterQuitCleanup()
  if (!app.isPackaged) return

  const pushSnapshot = () => {
    if (shuttingDown) return
    sendToRenderer(mainWindow, 'update:state', snapshot)
  }
  const setSnapshot = (next: UpdateSnapshot) => {
    snapshot = next
    pushSnapshot()
  }

  const announceAvailable = (version: string, pendingRelease = false) => {
    if (!pendingRelease && !isNewerThanInstalled(version)) {
      reconcileStaleDownloadedUpdate(version)
      announceNotAvailable()
      return
    }
    setSnapshot({ phase: 'available', version, pendingRelease })
    sendToRenderer(mainWindow, 'update:available', { version, pendingRelease })
  }

  const announceNotAvailable = () => {
    clearStallTimer()
    downloadInFlight = false
    downloadForVersion = null
    setSnapshot({ phase: 'not-available', version: lastProbeVersion ?? undefined })
    sendToRenderer(mainWindow, 'update:not-available')
  }

  const announceDownloaded = (version: string) => {
    clearStallTimer()
    downloadInFlight = false
    downloadForVersion = null
    setSnapshot({ phase: 'downloaded', version, percent: 100, pendingRelease: false })
    sendToRenderer(mainWindow, 'update:downloaded', { version })
  }

  const announceDownloadError = (
    version: string | undefined,
    message: string,
    opts?: { errorCode?: UpdateErrorCode; rateLimitMinutes?: number },
  ) => {
    clearStallTimer()
    downloadInFlight = false
    downloadForVersion = null
    setSnapshot({
      phase: 'error',
      version: version ?? lastProbeVersion ?? undefined,
      error: message,
      errorCode: opts?.errorCode,
      rateLimitMinutes: opts?.rateLimitMinutes,
    })
    sendToRenderer(mainWindow, 'update:error', {
      error: message,
      errorCode: opts?.errorCode,
      rateLimitMinutes: opts?.rateLimitMinutes,
    })
  }

  const announceRateLimitError = (info: GithubRateLimitInfo) => {
    announceDownloadError(undefined, '', {
      errorCode: 'github-rate-limit',
      rateLimitMinutes: rateLimitWaitMinutes(info),
    })
  }

  const announceNetworkError = () => {
    announceDownloadError(undefined, NETWORK_CHECK_ERROR, { errorCode: 'network' })
  }

  const armStallTimer = (version: string) => {
    clearStallTimer()
    lastProgressAt = Date.now()
    stallTimer = setTimeout(() => {
      if (snapshot.phase !== 'downloading') return
      if (Date.now() - lastProgressAt < DOWNLOAD_STALL_MS) return
      console.warn('[updater] download stalled, clearing broken cache')
      clearBrokenDifferentialCache()
      clearPendingUpdateCache()
      announceDownloadError(
        version,
        'Скачивание зависло. Проверьте интернет или скачайте установщик с GitHub Releases.',
      )
    }, DOWNLOAD_STALL_MS)
  }

  const resetFeedToGithub = () => {
    if (!usedGenericFeed) return
    usedGenericFeed = false
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'frolofpavel',
      repo: 'verstak',
    })
  }

  const tryUseReleaseFeed = async (version: string): Promise<boolean> => {
    if (!(await releaseArtifactsReady(version))) return false
    autoUpdater.setFeedURL({
      provider: 'generic',
      url: releaseFeedBase(version),
    })
    usedGenericFeed = true
    return true
  }

  const tryAnnounceCachedDownload = async (version: string): Promise<boolean> => {
    try {
      clearPendingIfWrongVersion(version)
      const meta = await fetchReleaseArtifactMeta(version)
      if (!meta) return false
      const cached = await reconcileCachedDownload(meta.fileName, meta.sha512, meta.size)
      if (!cached) return false
      console.info('[updater] using reconciled cached installer for', version)
      announceDownloaded(version)
      return true
    } catch (err) {
      console.warn('[updater] tryAnnounceCachedDownload failed:', err)
      return false
    }
  }

  const downloadVersion = async (version: string): Promise<void> => {
    if (!isNewerThanInstalled(version)) {
      reconcileStaleDownloadedUpdate(version)
      announceNotAvailable()
      return
    }

    clearPendingIfWrongVersion(version)
    if (downloadInFlight && downloadForVersion === version) return
    if (snapshot.phase === 'downloaded' && snapshot.version === version) return
    if (await tryAnnounceCachedDownload(version)) return

    if (!(await releaseArtifactsReady(version))) {
      announceAvailable(version, true)
      return
    }

    if (!(await tryUseReleaseFeed(version))) {
      announceAvailable(version, true)
      return
    }

    clearBrokenDifferentialCache()
    downloadInFlight = true
    downloadForVersion = version
    setSnapshot({ phase: 'downloading', version, percent: 0, pendingRelease: false })
    armStallTimer(version)

    try {
      try {
        await withTimeout(autoUpdater.checkForUpdates(), UPDATER_RPC_TIMEOUT_MS, 'checkForUpdates')
      } catch (err) {
        console.warn('[updater] checkForUpdates failed (continuing):', err)
      }

      await autoUpdater.downloadUpdate()

      if (snapshot.phase !== 'downloaded' && isNewerThanInstalled(version)) {
        if (await tryAnnounceCachedDownload(version)) return
        announceDownloaded(version)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn('[updater] downloadUpdate failed:', message)
      if (await tryAnnounceCachedDownload(version)) return
      if (isBenignUpdaterError(message)) {
        downloadInFlight = false
        downloadForVersion = null
        announceAvailable(version, true)
        return
      }
      announceDownloadError(version, message)
    } finally {
      if (snapshot.phase !== 'downloading') clearStallTimer()
    }
  }

  const evaluateProbe = async (
    opts?: { reportNetworkError?: boolean },
  ): Promise<{ newer: boolean; version: string | null; pendingRelease: boolean }> => {
    const current = app.getVersion()
    const probeResult = await fetchRemoteVersion()
    const remote = probeResult.version
    lastProbeVersion = remote
    console.info(
      '[updater] probe: installed=%s remote=%s rateLimit=%s',
      current,
      remote ?? 'null',
      probeResult.rateLimit ? rateLimitWaitMinutes(probeResult.rateLimit) + 'min' : 'no',
    )

    if (!remote) {
      lastProbePending = false
      if (opts?.reportNetworkError) {
        if (probeResult.rateLimit) announceRateLimitError(probeResult.rateLimit)
        else announceNetworkError()
      }
      return { newer: false, version: null, pendingRelease: false }
    }

    if (!semverGt(remote, current)) {
      lastProbePending = false
      reconcileStaleDownloadedUpdate(remote)
      return { newer: false, version: remote, pendingRelease: false }
    }

    const resolved = await resolveInstallableUpdate(current, remote)
    if (resolved.installable) {
      lastProbeVersion = resolved.installable
      lastProbePending = false
      return { newer: true, version: resolved.installable, pendingRelease: false }
    }

    if (resolved.pendingVersion) {
      lastProbeVersion = resolved.pendingVersion
      lastProbePending = true
      return { newer: true, version: resolved.pendingVersion, pendingRelease: true }
    }

    lastProbePending = false
    return { newer: false, version: remote, pendingRelease: false }
  }

  const resetUpdaterSession = () => {
    resetFeedToGithub()
    clearAllUpdaterCache()
    clearBrokenDifferentialCache()
    downloadInFlight = false
    downloadForVersion = null
    checkInFlight = false
    checkPromise = null
    lastProbeVersion = null
    lastProbePending = false
    clearStallTimer()
    snapshot = { phase: 'idle' }
    pushSnapshot()
  }

  const runCheckBody = async (manual = false) => {
    if (shuttingDown) return
    resetFeedToGithub()

    setSnapshot({ phase: 'checking' })
    sendToRenderer(mainWindow, 'update:checking')

    const probe = await evaluateProbe({ reportNetworkError: manual })

    if (!probe.newer) {
      if (probe.version != null) announceNotAvailable()
      else if (manual && snapshot.phase !== 'error') {
        announceNetworkError()
      } else if (!manual) {
        setSnapshot({ phase: 'idle' })
      }
      return
    }
    if (!probe.version) return

    if (await tryAnnounceCachedDownload(probe.version)) return

    if (probe.pendingRelease) {
      announceAvailable(probe.version, true)
      return
    }

    await downloadVersion(probe.version)
  }

  const runCheck = async (manual = false) => {
    if (shuttingDown) return
    if (checkInFlight && checkPromise) {
      await checkPromise
      return
    }
    checkInFlight = true
    checkPromise = withTimeout(runCheckBody(manual), CHECK_TIMEOUT_MS, 'update check')
      .catch(async (err) => {
        console.warn('[updater] runCheck failed:', err)
        if (shuttingDown || snapshot.phase !== 'checking') return
        if (lastProbeVersion && isNewerThanInstalled(lastProbeVersion)) {
          await downloadVersion(lastProbeVersion)
        } else if (manual && !lastProbeVersion) {
          announceNetworkError()
        } else if (lastProbeVersion) {
          announceNotAvailable()
        } else if (manual) {
          announceNetworkError()
        } else {
          setSnapshot({ phase: 'idle' })
        }
      })
      .finally(() => {
        checkInFlight = false
        checkPromise = null
      })
    await checkPromise
  }

  const buildCheckResult = () => {
    const current = app.getVersion()
    const remote = snapshot.version ?? lastProbeVersion
    const available = !!remote && semverGt(remote, current)
    return {
      available,
      version: remote ?? undefined,
      installedVersion: current,
      phase: snapshot.phase,
      error: snapshot.error,
      errorCode: snapshot.errorCode,
      rateLimitMinutes: snapshot.rateLimitMinutes,
      pendingRelease: snapshot.pendingRelease,
    }
  }

  if (!updaterIpcRegistered) {
    updaterIpcRegistered = true

    ipcMain.handle('update:install', () => {
      const target = snapshot.version ?? lastProbeVersion
      if (!isNewerThanInstalled(target)) {
        reconcileStaleDownloadedUpdate(target)
        announceNotAvailable()
        return { ok: false as const, reason: 'already-current' as const }
      }
      quittingForInstall = true
      autoUpdater.quitAndInstall(false, true)
      return { ok: true as const }
    })

    ipcMain.handle('update:get-state', () => ({
      ...snapshot,
      installedVersion: app.getVersion(),
      remoteVersion: lastProbeVersion ?? snapshot.version,
    }))

    ipcMain.handle('update:check', async () => {
      await runCheck(true)
      return buildCheckResult()
    })

    ipcMain.handle('update:clear-cache', async () => {
      resetUpdaterSession()
      await runCheck(true)
      return { ok: true as const, ...buildCheckResult() }
    })

    autoUpdater.on('download-progress', (progress) => {
      if (shuttingDown) return
      downloadInFlight = true
      lastProgressAt = Date.now()
      const percent = Math.round(progress.percent)
      setSnapshot({
        phase: 'downloading',
        version: snapshot.version ?? lastProbeVersion ?? undefined,
        percent,
        pendingRelease: false,
      })
      sendToRenderer(mainWindow, 'update:progress', {
        percent,
        transferred: progress.transferred,
        total: progress.total,
      })
    })

    autoUpdater.on('update-downloaded', (info) => {
      if (shuttingDown) return
      const version = info.version || lastProbeVersion || snapshot.version
      if (!version || !isNewerThanInstalled(version)) {
        reconcileStaleDownloadedUpdate(version)
        if (!probeSaysNewer()) announceNotAvailable()
        return
      }
      announceDownloaded(version)
    })

    // electron-updater часто говорит «нет обновления», хотя probe видит новую версию на main.
    // Решение о релизе принимает только наш probe (fetchRemoteVersion).
    autoUpdater.on('update-not-available', () => {
      if (shuttingDown || downloadInFlight) return
      if (probeSaysNewer()) {
        console.info('[updater] ignoring update-not-available; probe=', lastProbeVersion)
        return
      }
      if (!checkInFlight) return
      reconcileStaleDownloadedUpdate(lastProbeVersion)
      announceNotAvailable()
    })

    autoUpdater.on('checking-for-update', () => {
      /* probe-driven flow — UI не переключаем */
    })

    autoUpdater.on('update-available', (info) => {
      if (shuttingDown) return
      if (info.version && isNewerThanInstalled(info.version)) {
        lastProbeVersion = info.version
      }
    })

    autoUpdater.on('error', (err) => {
      void (async () => {
        if (shuttingDown) return
        const message = err.message || 'Не удалось проверить обновления'
        console.warn('[updater] error:', message)

        if (probeSaysNewer() && lastProbeVersion) {
          if (snapshot.phase === 'downloading') {
            if (await tryAnnounceCachedDownload(lastProbeVersion)) return
            if (!isBenignUpdaterError(message)) {
              announceDownloadError(lastProbeVersion, message)
              return
            }
          }
          if (snapshot.phase === 'checking' || snapshot.phase === 'available') {
            await downloadVersion(lastProbeVersion)
            return
          }
        }

        if (isBenignUpdaterError(message)) {
          reconcileStaleDownloadedUpdate(lastProbeVersion)
          if (!probeSaysNewer()) announceNotAvailable()
          return
        }

        if (!probeSaysNewer()) {
          announceDownloadError(lastProbeVersion ?? undefined, message)
        }
      })().catch((handlerErr) => {
        console.warn('[updater] error handler failed:', handlerErr)
      })
    })
  }

  mainWindow.webContents.once('did-finish-load', () => {
    pushSnapshot()
    void runCheck(false)
  })

  periodicCheckTimer = setInterval(() => { void runCheck(false) }, PERIODIC_CHECK_MS)
}