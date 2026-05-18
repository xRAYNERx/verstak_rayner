import { useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { Settings } from './components/Settings'

export function App() {
  const [showSettings, setShowSettings] = useState(false)
  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0d0d0d', color: '#e0e0e0', fontFamily: 'sans-serif' }}>
      <Sidebar />
      <main style={{ flex: 1, padding: 20, position: 'relative' }}>
        <button onClick={() => setShowSettings(true)} style={{ position: 'absolute', top: 12, right: 12 }}>⚙ Настройки</button>
        <h2>Чат с Gemini (в следующей задаче)</h2>
      </main>
      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
    </div>
  )
}
