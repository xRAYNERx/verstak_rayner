import { useEffect, useState } from 'react'
import { useProject } from '../store/projectStore'

interface Props {
  onClose: () => void
}

export function SystemLayerViewer({ onClose }: Props) {
  const { path } = useProject()
  const [system, setSystem] = useState<{ version: string; prompt: string } | null>(null)
  const [user, setUser] = useState<{ path: string | null; content: string } | null>(null)
  const [tab, setTab] = useState<'system' | 'user'>('system')

  useEffect(() => {
    void (async () => {
      setSystem(await window.api.systemLayer.get())
      setUser(await window.api.systemLayer.user(path))
    })()
  }, [path])

  return (
    <div className="gg-modal-backdrop" onClick={onClose}>
      <div className="gg-modal gg-modal-large" onClick={e => e.stopPropagation()}>
        <div className="gg-modal-header">
          <div>
            <div className="gg-modal-title">Слои инструкций агента</div>
            <div className="gg-text-tertiary" style={{ fontSize: 'var(--text-xs)', marginTop: 4 }}>
              Что AI видит как системный prompt перед каждым твоим сообщением.
            </div>
          </div>
          <button className="gg-modal-close" onClick={onClose}>×</button>
        </div>

        <div className="gg-modal-body" style={{ padding: 0 }}>
          <div className="gg-syslayer-tabs">
            <button
              className={`gg-syslayer-tab ${tab === 'system' ? 'is-active' : ''}`}
              onClick={() => setTab('system')}
            >
              System layer
              <span className="gg-syslayer-tab-meta">{system ? `v${system.version}` : ''}</span>
            </button>
            <button
              className={`gg-syslayer-tab ${tab === 'user' ? 'is-active' : ''}`}
              onClick={() => setTab('user')}
            >
              User layer
              <span className="gg-syslayer-tab-meta">{user?.path ?? 'не задан'}</span>
            </button>
          </div>

          {tab === 'system' && (
            <div className="gg-syslayer-body">
              <div className="gg-notice" style={{ margin: '16px 22px' }}>
                Иммутабельный слой. Защищён в коде продукта. Пользователь может только
                <strong> расширять</strong> его через User layer, но не переопределять.
              </div>
              <pre className="gg-syslayer-pre">{system?.prompt ?? 'Loading…'}</pre>
            </div>
          )}

          {tab === 'user' && (
            <div className="gg-syslayer-body">
              {user?.path ? (
                <>
                  <div className="gg-notice" style={{ margin: '16px 22px' }}>
                    Загружено из <code>{user.path}</code> в корне проекта. Это твоя зона —
                    редактируй файл напрямую любым редактором, перезагрузка не нужна (читается при каждом сообщении).
                  </div>
                  <pre className="gg-syslayer-pre">{user.content}</pre>
                </>
              ) : (
                <div className="gg-panel-empty" style={{ padding: '32px 22px' }}>
                  В корне проекта нет файла кастомизации. Создай один из:<br /><br />
                  <code>AGENTS.md</code> · <code>CLAUDE.md</code> · <code>GEMINI.md</code> · <code>.geminigrok/RULES.md</code><br /><br />
                  Содержимое попадёт в системный prompt после неизменяемого слоя.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="gg-modal-footer">
          <button className="gg-btn gg-btn-ghost" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  )
}
