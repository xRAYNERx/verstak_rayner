import { useEffect, useState } from 'react'

/**
 * Полоска внизу экрана — показывает прогресс скачивания обновления
 * и кнопку «Перезапустить» когда обновление готово.
 * Рендерится всегда, но видна только при наличии обновления.
 */
export function UpdateNotification() {
  const [state, setState] = useState<'idle' | 'downloading' | 'ready'>('idle')
  const [version, setVersion] = useState('')
  const [percent, setPercent] = useState(0)

  useEffect(() => {
    window.api.updater.onAvailable(({ version: v }) => {
      setVersion(v)
      setState('downloading')
    })
    window.api.updater.onProgress(({ percent: p }) => {
      setPercent(p)
    })
    window.api.updater.onDownloaded(({ version: v }) => {
      setVersion(v)
      setState('ready')
    })
  }, [])

  if (state === 'idle') return null

  return (
    <div className="gg-update-bar">
      {state === 'downloading' && (
        <>
          <span>⬇️ Downloading v{version}... {percent}%</span>
          <div className="gg-update-progress" style={{ width: `${percent}%` }} />
        </>
      )}
      {state === 'ready' && (
        <>
          <span>✨ v{version} ready</span>
          <button onClick={() => window.api.updater.install()}>
            Restart to update
          </button>
        </>
      )}
    </div>
  )
}
