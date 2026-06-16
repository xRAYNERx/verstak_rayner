import { useEffect, useState } from 'react'
import { useT } from '../i18n'
import { semverGt } from '../lib/semver'

type Phase = 'idle' | 'downloading' | 'ready'

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
  const [currentVersion, setCurrentVersion] = useState('')

  useEffect(() => {
    void window.api.app.getVersion().then(setCurrentVersion).catch(() => {})

    const isNewer = (v?: string) => !!v && !!currentVersion && semverGt(v, currentVersion)

    const apply = (state: { phase: string; version?: string; percent?: number; pendingRelease?: boolean }) => {
      if (state.phase === 'downloaded' && state.version && isNewer(state.version)) {
        setVersion(state.version)
        setPhase('ready')
        setPercent(100)
      } else if (state.phase === 'downloading') {
        if (state.version) setVersion(state.version)
        setPhase('downloading')
        if (state.percent != null) setPercent(state.percent)
      }
    }

    void window.api.updater.getState().then(apply).catch(() => {})

    const offState = window.api.updater.onState(apply)
    const offProgress = window.api.updater.onProgress(({ percent: p }) => {
      setPercent(p)
      setPhase('downloading')
    })
    const offDownloaded = window.api.updater.onDownloaded(({ version: v }) => {
      if (!isNewer(v)) return
      setVersion(v)
      setPhase('ready')
      setPercent(100)
    })
    const offAvailable = window.api.updater.onAvailable(({ version: v, pendingRelease }) => {
      if (!pendingRelease) {
        setVersion(v)
        setPhase('downloading')
      }
    })

    return () => {
      offState()
      offProgress()
      offDownloaded()
      offAvailable()
    }
  }, [currentVersion])

  if (phase === 'idle') return null

  const title =
    phase === 'ready'
      ? t.updates.readyBar.replace('{version}', version)
      : t.updates.downloadingBar.replace('{version}', version).replace('{percent}', String(percent))

  const label =
    phase === 'ready'
      ? (railExpanded
        ? t.updates.readyBar.replace('{version}', version)
        : t.updates.railReadyShort)
      : (railExpanded
        ? t.updates.downloadingBar.replace('{version}', version).replace('{percent}', String(percent))
        : t.updates.railPercent.replace('{percent}', String(percent)))

  return (
    <div
      className={`gg-update-rail ${railExpanded ? 'is-expanded' : ''}`}
      title={title}
      role="status"
    >
      <div className="gg-update-rail-row">
        <span className="gg-update-rail-icon" aria-hidden>⬆</span>
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