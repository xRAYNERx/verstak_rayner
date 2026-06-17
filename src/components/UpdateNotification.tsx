import { useEffect, useState } from 'react'
import { useT } from '../i18n'
import { semverGt } from '../lib/semver'

type Phase = 'idle' | 'downloading' | 'ready' | 'error'

interface Props {
  /** Развёрнут ли левый rail — влияет на подпись и ширину. */
  railExpanded: boolean
}

/**
 * Компактный индикатор скачивания / готовности обновления — над кнопкой «Настройки» в rail.
 */
export function UpdateNotification({ railExpanded }: Props) {
  const t = useT()
  const [phase, setPhase] = useState<Phase>('idle')
  const [version, setVersion] = useState('')
  const [percent, setPercent] = useState(0)
  const [error, setError] = useState('')
  const [currentVersion, setCurrentVersion] = useState('')

  useEffect(() => {
    void window.api.app.getVersion().then(setCurrentVersion).catch(() => {})

    const isNewer = (v?: string) => !!v && !!currentVersion && semverGt(v, currentVersion)

    const apply = (state: { phase: string; version?: string; percent?: number; pendingRelease?: boolean; error?: string }) => {
      if (state.phase === 'downloaded' && state.version && isNewer(state.version)) {
        setVersion(state.version)
        setPhase('ready')
        setPercent(100)
        setError('')
      } else if (state.phase === 'downloading') {
        if (state.version) setVersion(state.version)
        setPhase('downloading')
        setPercent(state.percent ?? 0)
        setError('')
      } else if (state.phase === 'error') {
        if (state.version) setVersion(state.version)
        setError(state.error || t.settings.updateError)
        setPhase('error')
      } else if (state.phase === 'not-available' || state.phase === 'checking' || state.phase === 'idle') {
        setPhase('idle')
        setError('')
      }
    }

    void window.api.updater.getState().then(apply).catch(() => {})

    const offState = window.api.updater.onState(apply)
    const offProgress = window.api.updater.onProgress(({ percent: p }) => {
      setPercent(p)
      setPhase('downloading')
      setError('')
    })
    const offDownloaded = window.api.updater.onDownloaded(({ version: v }) => {
      if (!isNewer(v)) {
        setPhase('idle')
        return
      }
      setVersion(v)
      setPhase('ready')
      setPercent(100)
      setError('')
    })
    const offNotAvailable = window.api.updater.onNotAvailable(() => {
      setPhase('idle')
      setError('')
    })
    const offError = window.api.updater.onError(({ error: e }) => {
      setError(e || t.settings.updateError)
      setPhase('error')
    })

    return () => {
      offState()
      offProgress()
      offDownloaded()
      offNotAvailable()
      offError()
    }
  }, [currentVersion, t.settings.updateError])

  if (phase === 'idle') return null

  const title =
    phase === 'ready'
      ? t.updates.readyBar.replace('{version}', version)
      : phase === 'error'
        ? error
        : t.updates.downloadingBar.replace('{version}', version).replace('{percent}', String(percent))

  const label =
    phase === 'ready'
      ? (railExpanded
        ? t.updates.readyBar.replace('{version}', version)
        : t.updates.railReadyShort)
      : phase === 'error'
        ? (railExpanded ? error : '!')
        : (railExpanded
          ? t.updates.downloadingBar.replace('{version}', version).replace('{percent}', String(percent))
          : t.updates.railPercent.replace('{percent}', String(percent)))

  return (
    <div
      className={`gg-update-rail ${railExpanded ? 'is-expanded' : ''}${phase === 'error' ? ' is-error' : ''}`}
      title={title}
      role="status"
    >
      <div className="gg-update-rail-row">
        <span className="gg-update-rail-icon" aria-hidden>{phase === 'error' ? '!' : '⬆'}</span>
        <span className="gg-update-rail-label">{label}</span>
        {phase === 'ready' && (
          <button
            type="button"
            className="gg-update-rail-install"
            onClick={() => void window.api.updater.install()}
            title={t.updates.install}
          >
            {railExpanded ? t.updates.install : '↵'}
          </button>
        )}
      </div>
      {phase === 'downloading' && (
        <div className="gg-update-rail-track" aria-hidden>
          <div className="gg-update-rail-fill" style={{ width: `${percent}%` }} />
        </div>
      )}
    </div>
  )
}