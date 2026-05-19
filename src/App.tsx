import { useEffect, useState } from 'react'
import { ProjectRail } from './components/ProjectRail'
import { Sidebar } from './components/Sidebar'
import { Settings } from './components/Settings'
import { Chat } from './components/Chat'
import { TasksView } from './components/TasksView'
import { JournalView } from './components/JournalView'
import { PlanView } from './components/PlanView'
import { FeedbackView } from './components/FeedbackView'
import { BrowserView } from './components/BrowserView'
import { StubView } from './components/StubView'
import { DiffView } from './components/DiffView'
import { CommandConfirm } from './components/CommandConfirm'
import { Terminal } from './components/Terminal'
import { useProject } from './store/projectStore'

export function App() {
  const [showSettings, setShowSettings] = useState(false)
  const [showTerminal, setShowTerminal] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const { path, activeView } = useProject()
  const canShowTerminal = path && showTerminal

  // Ctrl/Cmd+B toggles the project sidebar (standard pattern)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'b' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        e.preventDefault()
        setSidebarOpen(v => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className={`gg-app ${sidebarOpen ? '' : 'is-sidebar-collapsed'}`}>
      <ProjectRail
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(v => !v)}
      />
      {sidebarOpen && <Sidebar onOpenSettings={() => setShowSettings(true)} />}
      <main className="gg-main">
        {activeView === 'chat' && (
          <Chat
            onOpenSettings={() => setShowSettings(true)}
            onToggleTerminal={() => setShowTerminal(t => !t)}
            terminalOpen={showTerminal}
          />
        )}
        {activeView === 'tasks' && <TasksView />}
        {activeView === 'journal' && <JournalView />}
        {activeView === 'plan' && <PlanView />}
        {activeView === 'workflow' && <StubView title="Workflow" description="Здесь будут пайплайны и цепочки агентов. В работе." />}
        {activeView === 'calendar' && <StubView title="Calendar" description="Здесь будут события и дедлайны проекта. В работе." />}
        {activeView === 'feedback' && <FeedbackView />}
        {activeView === 'browser' && <BrowserView />}
        {activeView === 'chat' && canShowTerminal && (
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
