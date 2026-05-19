import { useEffect, useState } from 'react'

type ProviderId = 'gemini-api' | 'gemini-cli'

export function Settings({ onClose }: { onClose: () => void }) {
  const [key, setKey] = useState('')
  const [provider, setProvider] = useState<ProviderId>('gemini-api')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    void window.api.settings.getKey('gemini_api_key').then(v => setKey(v ?? ''))
    void window.api.settings.getKey('provider').then(v => {
      if (v === 'gemini-cli') setProvider('gemini-cli')
    })
  }, [])

  async function save() {
    await window.api.settings.setKey('gemini_api_key', key)
    await window.api.settings.setKey('provider', provider)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div className="gg-modal-backdrop" onClick={onClose}>
      <div className="gg-modal" onClick={e => e.stopPropagation()}>
        <div className="gg-modal-header">
          <div className="gg-modal-title">Настройки</div>
          <button className="gg-modal-close" onClick={onClose}>×</button>
        </div>

        <div className="gg-modal-body">
          <div className="gg-label">Способ подключения</div>
          <div className="gg-provider-grid">
            <button
              type="button"
              className={`gg-provider-card ${provider === 'gemini-api' ? 'active' : ''}`}
              onClick={() => setProvider('gemini-api')}
            >
              <div className="gg-provider-card-label">API ключ</div>
              <div className="gg-provider-card-desc">
                Прямой вызов <code>@google/genai</code>. Tools, diff-подтверждение, multi-turn.
              </div>
            </button>
            <button
              type="button"
              className={`gg-provider-card ${provider === 'gemini-cli' ? 'active' : ''}`}
              onClick={() => setProvider('gemini-cli')}
            >
              <div className="gg-provider-card-label">CLI · подписка</div>
              <div className="gg-provider-card-desc">
                Subprocess <code>gemini</code>. Твоя Ultra-подписка, без API ключа.
              </div>
            </button>
          </div>

          {provider === 'gemini-api' && (
            <>
              <div className="gg-label">Gemini API ключ</div>
              <input
                type="password"
                className="gg-input"
                value={key}
                onChange={e => setKey(e.target.value)}
                placeholder="AIzaSy…"
                autoFocus
              />
              <div className="gg-text-tertiary" style={{ fontSize: 'var(--text-xs)', marginTop: 6 }}>
                Создаётся бесплатно в <a href="https://aistudio.google.com" target="_blank" rel="noreferrer">Google AI Studio</a> → Get API key. Хранится зашифрованно через safeStorage.
              </div>
            </>
          )}

          {provider === 'gemini-cli' && (
            <div className="gg-notice">
              <div style={{ marginBottom: 6 }}><strong>Что нужно для CLI режима</strong></div>
              <div>1. Установлен <code>gemini-cli</code> (у тебя уже есть, обнаружен в <code>%APPDATA%\npm\gemini.cmd</code>)</div>
              <div>2. Залогинен через <code>gemini</code> — открой обычный терминал, набери <code>gemini</code>, пройди Google OAuth твоим аккаунтом с Ultra-подпиской</div>
              <div style={{ marginTop: 8, color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)' }}>
                В CLI-режиме AI сам управляет файлами проекта — diff-подтверждение не показывается.
              </div>
            </div>
          )}
        </div>

        <div className="gg-modal-footer">
          <button className="gg-btn gg-btn-ghost" onClick={onClose}>Закрыть</button>
          <button className="gg-btn gg-btn-primary" onClick={save}>
            {saved ? '✓ Сохранено' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  )
}
