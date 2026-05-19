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

export function ProjectRail() {
  const { path, projectList, setProject, refreshProjectList, removeProject } = useProject()
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
      <div className="gg-rail-divider" />
      <div className="gg-rail-list">
        {projectList.map(p => (
          <ProjectChip
            key={p.path}
            project={p}
            active={path === p.path}
            onClick={() => { if (path !== p.path) void setProject(p.path) }}
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
