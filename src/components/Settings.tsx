import { useEffect, useState } from 'react'

export function Settings({ onClose }: { onClose: () => void }) {
  const [key, setKey] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => { window.api.settings.getKey('gemini_api_key').then(v => setKey(v ?? '')) }, [])

  async function save() {
    await window.api.settings.setKey('gemini_api_key', key)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
      <div style={{ background: '#1a1a2e', padding: 24, borderRadius: 8, width: 480, color: '#e0e0e0' }}>
        <h3 style={{ marginTop: 0 }}>Настройки</h3>
        <label style={{ display: 'block', marginBottom: 8, fontSize: 13 }}>Gemini API ключ</label>
        <input
          type="password"
          value={key}
          onChange={e => setKey(e.target.value)}
          placeholder="AIzaSy..."
          style={{ width: '100%', padding: 8, background: '#0d0d0d', color: '#fff', border: '1px solid #333', borderRadius: 4, marginBottom: 12 }}
        />
        <div style={{ fontSize: 11, color: '#888', marginBottom: 16 }}>
          Получи бесплатно в Google AI Studio: aistudio.google.com → Get API key
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose}>Закрыть</button>
          <button onClick={save}>{saved ? 'Сохранено ✓' : 'Сохранить'}</button>
        </div>
      </div>
    </div>
  )
}
