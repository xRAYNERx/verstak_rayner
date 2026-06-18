import { useCallback, useEffect, useState } from 'react'
import { useT } from '../i18n'
import { semverGt } from '../lib/semver'
import { formatUpdaterError, type UpdaterErrorPayload } from '../lib/updater-error'
import { PastReleasesModal } from './PastReleasesModal'
import { ReleaseNotesModal, type ReleaseNote } from './ReleaseNotesModal'

type Status = 'idle' | 'checking' | 'current' | 'available' | 'downloading' | 'ready' | 'error' | 'pending'

type CheckResult = UpdaterErrorPayload & {
  available: boolean
  version?: string
  installedVersion?: string
  phase?: string
  pendingRelease?: boolean
}

export function UpdatesSettings() {
  const t = useT()
  const errorT = {
    updateError: t.settings.updateError,
    updateNoRelease: t.settings.updateNoRelease,
    updateRateLimitMinutes: t.settings.updateRateLimitMinutes,
    updateRateLimitHour: t.settings.updateRateLimitHour,
  }
  const [version, setVersion] = useState('…')
  const [versionLoaded, setVersionLoaded] = useState(false)
  const [status, setStatus] = useState<Status>('idle')
  const [remoteVersion, setRemoteVersion] = useState('')
  const [percent, setPercent] = useState(0)
  const [error, setError] = useState('')
  const [notesOpen, setNotesOpen] = useState(false)
  const [pastOpen, setPastOpen] = useState(false)
  const [releaseNotes, setReleaseNotes] = useState<ReleaseNote[]>([])
  const [notesLoading, setNotesLoading] = useState(false)
  const [notesTargetVersion, setNotesTargetVersion] = useState('')
  const [clearingCache, setClearingCache] = useState(false)

  const installedNorm = version.replace(/^v/, '')

  const isNewerThanInstalled = useCallback((v?: string) => {
    if (!v || !versionLoaded) return false
    return semverGt(v, installedNorm)
  }, [installedNorm, versionLoaded])

  const applyAvailable = useCallback((v: string, pendingRelease?: boolean) => {
    setRemoteVersion(v)
    setStatus(pendingRelease ? 'pending' : 'available')
    setError('')
  }, [])

  const applyCheckResult = useCallback((result: CheckResult) => {
    if (result.error || result.errorCode || result.phase === 'error') {
      setError(formatUpdaterError(result, errorT))
      setStatus('error')
      return
    }
    if (result.phase === 'downloaded') {
      if (result.version) setRemoteVersion(result.version)
      setStatus('ready')
      return
    }
    if (result.phase === 'downloading') {
      if (result.version) setRemoteVersion(result.version)
      setStatus('downloading')
      return
    }
    if (result.available && result.version) {
      applyAvailable(result.version, result.pendingRelease)
      return
    }
    if (result.version && isNewerThanInstalled(result.version)) {
      applyAvailable(result.version, result.pendingRelease)
      return
    }
    if (result.phase === 'idle') {
      setStatus('idle')
      return
    }
    setStatus('current')
    setError('')
  }, [applyAvailable, errorT, isNewerThanInstalled])

  useEffect(() => {
    const applyPhase = (
      phase: string,
      v?: string,
      p?: number,
      err?: string,
      pendingRelease?: boolean,
      errorCode?: string,
      rateLimitMinutes?: number,
    ) => {
      if (phase === 'available') {
        if (!pendingRelease && !isNewerThanInstalled(v)) {
          setStatus('current')
          return
        }
        if (v) applyAvailable(v, pendingRelease)
      } else if (phase === 'downloading') {
        if (v) setRemoteVersion(v)
        setStatus('downloading')
        if (p != null) setPercent(p)
        setError('')
      } else if (phase === 'downloaded') {
        if (!isNewerThanInstalled(v)) {
          setStatus('current')
          return
        }
        if (v) setRemoteVersion(v)
        setStatus('ready')
        setError('')
      } else if (phase === 'not-available') {
        if (v && isNewerThanInstalled(v)) {
          applyAvailable(v, pendingRelease)
          return
        }
        setStatus('current')
        setError('')
      } else if (phase === 'checking') {
        setStatus('checking')
      } else if (phase === 'error') {
        setError(formatUpdaterError({ error: err, errorCode, rateLimitMinutes }, errorT))
        setStatus('error')
      } else if (phase === 'idle') {
        setStatus('idle')
      }
    }

    void window.api.app.getVersion()
      .then((v) => {
        setVersion(v)
        setVersionLoaded(true)
      })
      .catch(() => setVersionLoaded(true))
    void window.api.updater.getState()
      .then(s => applyPhase(
        s.phase,
        s.remoteVersion ?? s.version,
        s.percent,
        s.error,
        s.pendingRelease,
        s.errorCode,
        s.rateLimitMinutes,
      ))
      .catch(() => {})

    const offState = window.api.updater.onState(s => applyPhase(
      s.phase,
      s.version,
      s.percent,
      s.error,
      s.pendingRelease,
      s.errorCode,
      s.rateLimitMinutes,
    ))
    const offAvailable = window.api.updater.onAvailable(({ version: v, pendingRelease }) => {
      if (!pendingRelease && !isNewerThanInstalled(v)) {
        setStatus('current')
        return
      }
      applyAvailable(v, pendingRelease)
    })
    const offProgress = window.api.updater.onProgress(({ percent: p }) => {
      setPercent(p)
      setStatus('downloading')
    })
    const offDownloaded = window.api.updater.onDownloaded(({ version: v }) => {
      if (!isNewerThanInstalled(v)) {
        setStatus('current')
        return
      }
      setRemoteVersion(v)
      setStatus('ready')
    })
    const offNotAvailable = window.api.updater.onNotAvailable(() => {
      if (remoteVersion && isNewerThanInstalled(remoteVersion)) return
      setStatus('current')
    })
    const offError = window.api.updater.onError((payload) => {
      setError(formatUpdaterError(payload, errorT))
      setStatus('error')
    })
    return () => {
      offState()
      offAvailable()
      offProgress()
      offDownloaded()
      offNotAvailable()
      offError()
    }
  }, [applyAvailable, errorT, isNewerThanInstalled, remoteVersion])

  const viewReleaseNotes = useCallback(async () => {
    setNotesLoading(true)
    try {
      const targetVersion = remoteVersion && status !== 'current' && status !== 'idle'
        ? remoteVersion
        : version.replace(/^v/, '')
      const notes = await window.api.updater.getReleaseNotes({ version: targetVersion })
      setReleaseNotes(notes)
      setNotesTargetVersion(targetVersion)
      setNotesOpen(true)
    } finally {
      setNotesLoading(false)
    }
  }, [remoteVersion, status, version])

  const check = useCallback(async () => {
    setStatus('checking')
    setError('')
    try {
      const result = await window.api.updater.check()
      applyCheckResult(result)
    } catch {
      setError(errorT.updateError)
      setStatus('error')
    }
  }, [applyCheckResult, errorT])

  const clearCache = useCallback(async () => {
    setClearingCache(true)
    setStatus('checking')
    setError('')
    try {
      const result = await window.api.updater.clearCache()
      applyCheckResult(result)
    } catch {
      setError(errorT.updateError)
      setStatus('error')
    } finally {
      setClearingCache(false)
    }
  }, [applyCheckResult, errorT])

  const notesTitle = notesTargetVersion && remoteVersion === notesTargetVersion && status !== 'current'
    ? t.updates.releaseNotesTitleAvailable.replace('{version}', notesTargetVersion)
    : t.updates.releaseNotesTitleCurrent.replace('{version}', notesTargetVersion || version.replace(/^v/, ''))

  const busy = status === 'checking' || clearingCache

  return (
    <div className="gg-settings-extra">
      <div className="gg-settings-section-title">{t.settings.updates}</div>
      <div className="gg-settings-hint" style={{ marginBottom: 16 }}>{t.settings.updatesHint}</div>

      <div className="gg-settings-row" style={{ marginBottom: 12 }}>
        <label className="gg-settings-label">{t.settings.releaseNotes}</label>
        <div className="gg-updates-notes-actions">
          <button
            type="button"
            className="gg-btn gg-btn-ghost"
            onClick={() => void viewReleaseNotes()}
            disabled={notesLoading || version === '…'}
          >
            {notesLoading ? t.settings.viewReleaseNotesLoading : t.settings.viewReleaseNotes}
          </button>
          <button
            type="button"
            className="gg-btn gg-btn-ghost"
            onClick={() => setPastOpen(true)}
          >
            {t.settings.viewPastUpdates}
          </button>
        </div>
      </div>

      <div className="gg-settings-row">
        <label className="gg-settings-label">{t.settings.currentVersion}</label>
        <div style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>v{version}</div>
      </div>

      <div className="gg-settings-row">
        <label className="gg-settings-label">{t.settings.checkUpdates}</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
          <div className="gg-updates-notes-actions">
            <button type="button" className="gg-btn gg-btn-ghost" onClick={() => void check()} disabled={busy}>
              {status === 'checking' && !clearingCache ? t.settings.checkingUpdates : t.settings.checkUpdates}
            </button>
            <button type="button" className="gg-btn gg-btn-ghost" onClick={() => void clearCache()} disabled={busy}>
              {clearingCache ? t.settings.clearingUpdateCache : t.settings.clearUpdateCache}
            </button>
          </div>
          {status === 'current' && <span className="gg-settings-hint">{t.settings.upToDate}</span>}
          {status === 'pending' && remoteVersion && (
            <span className="gg-settings-hint">{t.settings.updatePendingRelease.replace('{version}', remoteVersion)}</span>
          )}
          {(status === 'available' || status === 'downloading') && remoteVersion && (
            <span className="gg-settings-hint">
              {t.settings.downloadingUpdate
                .replace('{version}', remoteVersion)
                .replace('{percent}', String(status === 'downloading' ? percent : 0))}
            </span>
          )}
          {status === 'ready' && remoteVersion && (
            <div className="gg-updates-ready-row">
              <span className="gg-settings-hint">{t.settings.updateReady.replace('{version}', remoteVersion)}</span>
              <button type="button" className="gg-btn gg-btn-primary" onClick={() => void window.api.updater.install()}>
                {t.settings.installUpdate}
              </button>
            </div>
          )}
          {status === 'error' && <span className="gg-settings-hint" style={{ color: 'var(--error)' }}>{error || t.settings.updateError}</span>}
        </div>
      </div>

      <ReleaseNotesModal
        open={notesOpen}
        elevated
        onClose={() => setNotesOpen(false)}
        notes={releaseNotes}
        title={notesTitle}
        emptyText={t.settings.releaseNotesEmpty}
      />
      <PastReleasesModal open={pastOpen} onClose={() => setPastOpen(false)} />
    </div>
  )
}