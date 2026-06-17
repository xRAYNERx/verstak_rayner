import { autoUpdater } from 'electron-updater'
import { app, BrowserWindow, ipcMain } from 'electron'
import {
  fetchAllReleaseNotesMerged,
  fetchReleaseNoteMerged,
  fetchReleaseNotesSince,
  fetchRemoteVersion,
  isBenignUpdaterError,
  releaseArtifactsReady,
  releaseFeedBase,
  semverGt,
} from './update-remote'
import { clearPendingUpdateCache } from './updater-cache'

autoUpdater.logger = null
autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = false

const PERIODIC_CHECK_MS = 4 * 60 * 60 * 1000

export type UpdatePhase = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'

export type UpdateSnapshot = {
  phase: UpdatePhase
  version?: string
  percent?: number
  error?: string
  pendingRelease?: boolean
}

let snapshot: UpdateSnapshot = { phase: 'idle' }
let lastProbeVersion: string | null = null
let checkInFlight = false
let downloadInFlight = false
let downloadForVersion: string | null = null
let usedGenericFeed = false
let releaseNotesIpcRegistered = false
let updaterIpcRegistered = false

function isNewerThanInstalled(target: string | null | undefined): boolean {
  if (!target) return false
  return semverGt(target, app.getVersion())
}

/** Сброс кэша, если на диске лежит установщик уже установленной (или более новой) версии. */
function reconcileStaleDownloadedUpdate(target?: string | null): boolean {
  const remote = target ?? lastProbeVersion
  if (remote && isNewerThanInstalled(remote)) return false
  clearPendingUpdateCache()
  return true
}

/** Release notes IPC — регистрируем до старта renderer (WhatsNewModal при запуске). */
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
      if (opts?.all) {
        return fetchAllReleaseNotesMerged()
      }
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

export function initAutoUpdater(mainWindow: BrowserWindow): void {
  registerReleaseNotesIpc()
  if (!app.isPackaged) return

  const pushSnapshot = () => {
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
    setSnapshot({ phase: 'not-available' })
    sendToRenderer(mainWindow, 'update:not-available')
  }

  const announceDownloadError = (version: string | undefined, message: string) => {
    downloadInFlight = false
    downloadForVersion = null
    setSnapshot({ phase: 'error', version, error: message })
    sendToRenderer(mainWindow, 'update:error', { error: message })
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

  const ensureDownload = async (version: string): Promise<void> => {
    if (!isNewerThanInstalled(version)) {
      reconcileStaleDownloadedUpdate(version)
      announceNotAvailable()
      return
    }

    if (downloadInFlight && downloadForVersion === version) return
    if (snapshot.phase === 'downloaded' && snapshot.version === version) return

    const hasArtifacts = await releaseArtifactsReady(version)
    if (!hasArtifacts) {
      announceAvailable(version, true)
      return
    }

    const feedReady = await tryUseReleaseFeed(version)
    if (!feedReady) {
      announceAvailable(version, true)
      return
    }

    downloadInFlight = true
    downloadForVersion = version
    setSnapshot({
      phase: 'downloading',
      version,
      percent: snapshot.percent ?? 0,
      pendingRelease: false,
    })

    try {
      await autoUpdater.downloadUpdate()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn('[updater] downloadUpdate failed:', message)
      if (isBenignUpdaterError(message)) {
        downloadInFlight = false
        downloadForVersion = null
        announceAvailable(version, true)
        return
      }
      announceDownloadError(version, message)
    }
  }

  const evaluateProbe = async (): Promise<{ newer: boolean; version: string | null; pendingRelease: boolean }> => {
    const current = app.getVersion()
    const remote = await fetchRemoteVersion()
    lastProbeVersion = remote
    if (!remote || !semverGt(remote, current)) {
      reconcileStaleDownloadedUpdate(remote)
      return { newer: false, version: remote, pendingRelease: false }
    }
    const hasArtifacts = await releaseArtifactsReady(remote)
    return { newer: true, version: remote, pendingRelease: !hasArtifacts }
  }

  const runCheck = async () => {
    if (checkInFlight) return
    checkInFlight = true
    resetFeedToGithub()

    try {
      setSnapshot({ phase: 'checking' })
      sendToRenderer(mainWindow, 'update:checking')

      const probe = await evaluateProbe()

      if (!probe.newer || !probe.version) {
        announceNotAvailable()
        return
      }

      if (probe.pendingRelease) {
        announceAvailable(probe.version, true)
        return
      }

      const feedReady = await tryUseReleaseFeed(probe.version)
      if (!feedReady) {
        announceAvailable(probe.version, true)
        return
      }

      try {
        const result = await autoUpdater.checkForUpdates()
        if (result?.updateInfo?.version && isNewerThanInstalled(result.updateInfo.version)) {
          await ensureDownload(result.updateInfo.version)
        }
      } catch (err) {
        console.warn('[updater] checkForUpdates failed:', err)
        await ensureDownload(probe.version)
      }
    } finally {
      checkInFlight = false
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
      autoUpdater.quitAndInstall(false, true)
      return { ok: true as const }
    })

    ipcMain.handle('update:get-state', () => snapshot)

    ipcMain.handle('update:check', async () => {
      await runCheck()
      const current = app.getVersion()
      const remote = snapshot.version ?? lastProbeVersion
      const available = !!remote && semverGt(remote, current)
      return {
        available,
        version: remote ?? undefined,
        phase: snapshot.phase,
        error: snapshot.error,
        pendingRelease: snapshot.pendingRelease,
      }
    })

    autoUpdater.on('checking-for-update', () => {
      setSnapshot({ ...snapshot, phase: 'checking' })
      sendToRenderer(mainWindow, 'update:checking')
    })

    autoUpdater.on('update-available', (info) => {
      if (!isNewerThanInstalled(info.version)) {
        reconcileStaleDownloadedUpdate(info.version)
        announceNotAvailable()
        return
      }
      void ensureDownload(info.version)
    })

    autoUpdater.on('update-not-available', () => {
      reconcileStaleDownloadedUpdate(lastProbeVersion)
      announceNotAvailable()
    })

    autoUpdater.on('download-progress', (progress) => {
      downloadInFlight = true
      const percent = Math.round(progress.percent)
      setSnapshot({
        phase: 'downloading',
        version: snapshot.version,
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
      downloadInFlight = false
      downloadForVersion = null
      if (!isNewerThanInstalled(info.version)) {
        reconcileStaleDownloadedUpdate(info.version)
        announceNotAvailable()
        return
      }
      setSnapshot({ phase: 'downloaded', version: info.version, percent: 100, pendingRelease: false })
      sendToRenderer(mainWindow, 'update:downloaded', { version: info.version })
    })

    autoUpdater.on('error', async (err) => {
      const message = err.message || 'Не удалось проверить обновления'
      console.warn('[updater] error:', message)

      const current = app.getVersion()
      const remote = snapshot.version ?? lastProbeVersion ?? await fetchRemoteVersion()

      if (snapshot.phase === 'downloading' || snapshot.phase === 'available') {
        if (remote && semverGt(remote, current) && !isBenignUpdaterError(message)) {
          announceDownloadError(remote, message)
          return
        }
        if (remote && semverGt(remote, current)) {
          downloadInFlight = false
          downloadForVersion = null
          announceAvailable(remote, true)
          return
        }
      }

      if (remote && semverGt(remote, current)) {
        const pending = !(await releaseArtifactsReady(remote))
        if (!pending) {
          void ensureDownload(remote)
          return
        }
        announceAvailable(remote, pending)
        return
      }

      if (isBenignUpdaterError(message)) {
        reconcileStaleDownloadedUpdate(remote)
        announceNotAvailable()
        return
      }

      announceDownloadError(remote ?? undefined, message)
    })
  }

  void evaluateProbe().then((probe) => {
    if (!probe.newer) announceNotAvailable()
  })

  mainWindow.webContents.once('did-finish-load', () => {
    pushSnapshot()
    void runCheck()
  })

  setInterval(() => { void runCheck() }, PERIODIC_CHECK_MS)
}

function sendToRenderer(win: BrowserWindow, channel: string, data?: unknown): void {
  try {
    if (!win.isDestroyed()) win.webContents.send(channel, data)
  } catch { /* window might be closing */ }
}