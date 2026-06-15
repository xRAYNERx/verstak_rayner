import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useProject } from '../store/projectStore'
import type { ProjectMeta } from '../types/api'
import iconUrl from '../assets/icon.png'
import { ProjectAvatar } from './ProjectAvatar'
import { SettingsGearIcon } from './SettingsGearIcon'
import { UpdateNotification } from './UpdateNotification'
import { CreateClientModal } from './CreateClientModal'
import { useT } from '../i18n'

const RAIL_EXPANDED_KEY = 'gg-rail-expanded'
const RAIL_WIDTH_COLLAPSED = '72px'
const RAIL_WIDTH_EXPANDED = '264px'

function readRailExpanded(): boolean {
  try {
    return localStorage.getItem(RAIL_EXPANDED_KEY) === '1'
  } catch {
    return false
  }
}

function filterProjects(list: ProjectMeta[], query: string, activePath: string | null): ProjectMeta[] {
  const q = query.trim().toLowerCase()
  if (!q) return list
  const matches = list.filter(
    p => p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q)
  )
  if (activePath && !matches.some(p => p.path === activePath)) {
    const active = list.find(p => p.path === activePath)
    if (active) return [active, ...matches]
  }
  return matches
}

function DockIcon({ children }: { children: ReactNode }) {
  return <span className="gg-rail-dock-icon">{children}</span>
}

interface ProjectRowProps {
  project: ProjectMeta
  active: boolean
  unread: boolean
  streaming: boolean
  expanded: boolean
  onClick: () => void
  onSettings: () => void
}

function ProjectRow({ project, active, unread, streaming, expanded, onClick, onSettings }: ProjectRowProps) {
  const [hover, setHover] = useState(false)
  const status = streaming ? 'streaming' : unread ? 'unread' : null

  return (
    <li
      className={`gg-rail-project ${active ? 'is-active' : ''} ${expanded ? 'is-expanded' : ''}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={expanded ? project.path : `${project.name}\n${project.path}`}
    >
      <button type="button" className="gg-rail-project-btn" onClick={onClick}>
        <span className="gg-rail-avatar-wrap">
          <ProjectAvatar project={project} className="gg-rail-avatar" size={36} />
          {status && (
            <span
              className={`gg-rail-status ${status === 'streaming' ? 'is-streaming' : 'is-unread'}`}
              title={streaming ? 'AI работает в этом проекте' : 'Есть новый ответ'}
            />
          )}
        </span>
        <span className="gg-rail-project-copy" aria-hidden={!expanded}>
          <span className="gg-rail-project-name">{project.name}</span>
        </span>
      </button>
      {hover && (
        <button
          type="button"
          className="gg-rail-project-settings"
          onClick={e => { e.stopPropagation(); onSettings() }}
          title="Настройки проекта"
          aria-label="Настройки проекта"
        >
          <SettingsGearIcon size={14} />
        </button>
      )}
    </li>
  )
}

interface ProjectRailProps {
  sidebarOpen: boolean
  onToggleSidebar: () => void
  onOpenProjectSettings: (project: ProjectMeta) => void
  onOpenAppSettings: () => void
}

export function ProjectRail({ sidebarOpen, onToggleSidebar, onOpenProjectSettings, onOpenAppSettings }: ProjectRailProps) {
  const t = useT()
  const { path, projectList, sessions, setProject, refreshProjectList } = useProject()
  const [bootstrapped, setBootstrapped] = useState(false)
  const [railExpanded, setRailExpanded] = useState(readRailExpanded)
  const [projectQuery, setProjectQuery] = useState('')
  const [showCreateClient, setShowCreateClient] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const filteredProjects = useMemo(
    () => filterProjects(projectList, projectQuery, path),
    [projectList, projectQuery, path]
  )
  const showSearch = projectList.length >= 2
  const hasActiveFilter = projectQuery.trim().length > 0
  const dockCount = showSearch ? 3 : 2

  function openSearch() {
    setRailExpanded(true)
    window.setTimeout(() => searchRef.current?.focus(), 200)
  }

  useEffect(() => {
    document.documentElement.style.setProperty('--gg-rail-w', railExpanded ? RAIL_WIDTH_EXPANDED : RAIL_WIDTH_COLLAPSED)
    try {
      localStorage.setItem(RAIL_EXPANDED_KEY, railExpanded ? '1' : '0')
    } catch { /* ignore */ }
  }, [railExpanded])

  useEffect(() => {
    void (async () => {
      await refreshProjectList()
      const state = useProject.getState()
      if (!state.path) {
        const list = state.projectList
        const last = await window.api.settings.getKey('last_project_path')
        const lastInList = last && list.some(p => p.path === last) ? last : null
        if (lastInList) {
          await setProject(lastInList)
        } else if (list.length > 0) {
          await setProject(list[0].path)
        } else {
          const home = await window.api.app.getHomeDir()
          const fallback = (last && last.length > 0) ? last : home
          if (fallback) await setProject(fallback)
        }
      }
      setBootstrapped(true)
    })()
  }, [])
  void bootstrapped

  async function handleClientOpened(clientPath: string) {
    await setProject(clientPath)
    await refreshProjectList()
  }

  return (
    <>
      <nav className={`gg-rail ${railExpanded ? 'is-expanded' : ''}`} aria-label="Проекты">
        <header className="gg-rail-head">
          <button
            type="button"
            className="gg-rail-home"
            onClick={() => useProject.getState().closeProject()}
            title="Главная"
          >
            <img src={iconUrl} alt="Verstak" />
          </button>
          <div className="gg-rail-head-copy" aria-hidden={!railExpanded}>
            <span className="gg-rail-kicker">Verstak</span>
            <span className="gg-rail-head-title">{t.rail.clients}</span>
          </div>
        </header>

        <div className="gg-rail-dock" data-count={dockCount}>
          <button
            type="button"
            className={`gg-rail-dock-btn ${railExpanded ? 'is-on' : ''}`}
            onClick={() => setRailExpanded(v => !v)}
            title={railExpanded ? t.rail.collapsePanel : t.rail.expandPanel}
            aria-expanded={railExpanded}
          >
            <DockIcon>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <polyline points={railExpanded ? '15 6 9 12 15 18' : '9 6 15 12 9 18'} />
              </svg>
            </DockIcon>
            <span className="gg-rail-dock-label" aria-hidden={!railExpanded}>
              {railExpanded ? 'Свернуть' : 'Раскрыть'}
            </span>
          </button>
          <button
            type="button"
            className={`gg-rail-dock-btn ${sidebarOpen ? 'is-on' : ''}`}
            onClick={onToggleSidebar}
            title={sidebarOpen ? 'Скрыть боковую панель (Ctrl+B)' : 'Показать боковую панель (Ctrl+B)'}
            aria-pressed={sidebarOpen}
          >
            <DockIcon>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <line x1="9" y1="4" x2="9" y2="20" />
              </svg>
            </DockIcon>
            <span className="gg-rail-dock-label" aria-hidden={!railExpanded}>Панель</span>
          </button>
          {showSearch && (
            <button
              type="button"
              className={`gg-rail-dock-btn ${hasActiveFilter ? 'is-on' : ''}`}
              onClick={openSearch}
              title={t.rail.search}
            >
              <DockIcon>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <circle cx="11" cy="11" r="7" />
                  <line x1="16.5" y1="16.5" x2="21" y2="21" />
                </svg>
              </DockIcon>
              <span className="gg-rail-dock-label" aria-hidden={!railExpanded}>{t.rail.search}</span>
            </button>
          )}
        </div>

        <div className="gg-rail-sheet" aria-hidden={!railExpanded}>
          <div className="gg-rail-sheet-inner">
            <div className="gg-rail-sheet-meta">
              <span className="gg-rail-sheet-label">{t.rail.clients}</span>
              <span className="gg-rail-sheet-badge">{filteredProjects.length}</span>
            </div>
            {showSearch && (
              <label className="gg-rail-search-field">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <circle cx="11" cy="11" r="7" />
                  <line x1="16.5" y1="16.5" x2="21" y2="21" />
                </svg>
                <input
                  ref={searchRef}
                  type="search"
                  className="gg-rail-search-input"
                  placeholder={t.rail.searchPlaceholder}
                  value={projectQuery}
                  onChange={e => setProjectQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') setProjectQuery('') }}
                  aria-label={t.rail.search}
                  tabIndex={railExpanded ? 0 : -1}
                />
                {hasActiveFilter && (
                  <button
                    type="button"
                    className="gg-rail-search-reset"
                    onClick={() => setProjectQuery('')}
                    title={t.rail.clearSearch}
                    tabIndex={railExpanded ? 0 : -1}
                  >×</button>
                )}
              </label>
            )}
          </div>
        </div>

        <div className="gg-rail-body">
          <ul className="gg-rail-projects">
            {filteredProjects.length === 0 && hasActiveFilter && (
              <li className="gg-rail-empty">{t.rail.noResults}</li>
            )}
            {filteredProjects.map(p => {
              const session = sessions[p.path]
              return (
                <ProjectRow
                  key={p.path}
                  project={p}
                  active={path === p.path}
                  unread={!!session?.hasUnread}
                  streaming={!!session?.isStreaming}
                  expanded={railExpanded}
                  onClick={() => { if (path !== p.path) void setProject(p.path) }}
                  onSettings={() => onOpenProjectSettings(p)}
                />
              )
            })}
          </ul>

          <button
            type="button"
            className="gg-rail-new"
            onClick={() => setShowCreateClient(true)}
            title={t.rail.createClient}
          >
            <span className="gg-rail-new-icon" aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </span>
            <span className="gg-rail-new-label" aria-hidden={!railExpanded}>{t.rail.createClient}</span>
          </button>
        </div>

        <footer className="gg-rail-foot">
          <UpdateNotification railExpanded={railExpanded} />
          <button
            type="button"
            className="gg-rail-foot-btn"
            onClick={onOpenAppSettings}
            title={t.settings.title}
            aria-label={t.settings.title}
          >
            <SettingsGearIcon size={17} />
            <span className="gg-rail-foot-label" aria-hidden={!railExpanded}>{t.settings.title}</span>
          </button>
        </footer>
      </nav>

      {showCreateClient && (
        <CreateClientModal
          onClose={() => setShowCreateClient(false)}
          onOpened={clientPath => void handleClientOpened(clientPath)}
        />
      )}
    </>
  )
}