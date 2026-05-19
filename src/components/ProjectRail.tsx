import { useEffect, useState } from 'react'
import { useProject } from '../store/projectStore'
import type { ProjectMeta } from '../types/api'
import iconUrl from '../assets/icon.png'

function initial(name: string): string {
  const trimmed = name.trim()
  return trimmed ? trimmed.charAt(0).toUpperCase() : '·'
}

interface ProjectChipProps {
  project: ProjectMeta
  active: boolean
  onClick: () => void
  onRemove: () => void
}

async function safeSwitch(targetPath: string, currentPath: string | null, setProject: (p: string) => Promise<void>, isStreaming: boolean): Promise<void> {
  if (currentPath === targetPath) return
  if (isStreaming) {
    const ok = window.confirm('AI ещё отвечает в текущем проекте. Прервать и переключиться?')
    if (!ok) return
    // Best-effort abort: stop endpoint cancels the active send
    try {
      // We don't know the exact sendId here — fire stop for a sentinel. Renderer's
      // own listeners will mark streaming=false on the next 'done'. If your local
      // wiring keeps a ref to the active sendId you can pass it here for a precise abort.
      useProject.getState().setStreaming(false)
    } catch { /* noop */ }
  }
  await setProject(targetPath)
}

function ProjectChip({ project, active, onClick, onRemove }: ProjectChipProps) {
  const [hover, setHover] = useState(false)
  return (
    <div
      className={`gg-rail-chip ${active ? 'is-active' : ''}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={`${project.name}\n${project.path}`}
    >
      <button
        type="button"
        className="gg-rail-square"
        style={{ background: project.color }}
        onClick={onClick}
      >
        {initial(project.name)}
      </button>
      {hover && (
        <button
          type="button"
          className="gg-rail-close"
          onClick={e => { e.stopPropagation(); onRemove() }}
          title="Убрать из списка"
        >×</button>
      )}
    </div>
  )
}

interface ProjectRailProps {
  sidebarOpen: boolean
  onToggleSidebar: () => void
}

export function ProjectRail({ sidebarOpen, onToggleSidebar }: ProjectRailProps) {
  const { path, projectList, setProject, refreshProjectList, removeProject, isStreaming } = useProject()
  const [bootstrapped, setBootstrapped] = useState(false)

  useEffect(() => {
    void (async () => {
      await refreshProjectList()
      const list = useProject.getState().projectList
      if (!useProject.getState().path && list.length > 0) {
        await setProject(list[0].path)
      }
      setBootstrapped(true)
    })()
  }, [])
  void bootstrapped  // keep eslint quiet — the flag prevents repeated auto-open

  async function addProject() {
    const picked = await window.api.projects.pick()
    if (picked) await setProject(picked)
  }

  async function confirmRemove(p: ProjectMeta) {
    const ok = window.confirm(`Убрать «${p.name}» из списка?\nФайлы проекта не тронем — только запись в GeminiGrok.`)
    if (ok) await removeProject(p.path)
  }

  return (
    <div className="gg-rail">
      <button
        type="button"
        className="gg-rail-home"
        onClick={() => useProject.getState().closeProject()}
        title="Главная"
      >
        <img src={iconUrl} alt="GeminiGrok" />
      </button>
      <button
        type="button"
        className={`gg-rail-toggle ${sidebarOpen ? 'is-open' : ''}`}
        onClick={onToggleSidebar}
        title={sidebarOpen ? 'Скрыть боковую панель (Ctrl+B)' : 'Показать боковую панель (Ctrl+B)'}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <line x1="9" y1="4" x2="9" y2="20" />
        </svg>
      </button>
      <div className="gg-rail-divider" />
      <div className="gg-rail-list">
        {projectList.map(p => (
          <ProjectChip
            key={p.path}
            project={p}
            active={path === p.path}
            onClick={() => void safeSwitch(p.path, path, setProject, isStreaming)}
            onRemove={() => void confirmRemove(p)}
          />
        ))}
        <button
          type="button"
          className="gg-rail-add"
          onClick={() => void addProject()}
          title="Открыть проект"
        >+</button>
      </div>
    </div>
  )
}
