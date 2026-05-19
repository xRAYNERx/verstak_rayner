import { useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { Settings } from './components/Settings'
import { Chat } from './components/Chat'
import { DiffView } from './components/DiffView'
import { CommandConfirm } from './components/CommandConfirm'
import { Terminal } from './components/Terminal'
import { useProject } from './store/projectStore'

export function App() {
  const [showSettings, setShowSettings] = useState(false)
  const [showTerminal, setShowTerminal] = useState(false)
  const { path } = useProject()
  const canShowTerminal = path && showTerminal
  return (
    <div className="gg-app">
      <Sidebar onOpenSettings={() => setShowSettings(true)} />
      <main className="gg-main">
        <Chat
          onOpenSettings={() => setShowSettings(true)}
          onToggleTerminal={() => setShowTerminal(t => !t)}
          terminalOpen={showTerminal}
        />
        {canShowTerminal && (
          <div className="gg-terminal-wrap">
            <div className="gg-terminal-header">
              <span className="gg-terminal-dot" />
              <span>Терминал</span>
              <button
                className="gg-terminal-close"
                onClick={() => setShowTerminal(false)}
                title="Скрыть"
              >×</button>
            </div>
            <div className="gg-terminal-body">
              <Terminal />
            </div>
          </div>
        )}
      </main>
      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
      <DiffView />
      <CommandConfirm />
    </div>
  )
}
