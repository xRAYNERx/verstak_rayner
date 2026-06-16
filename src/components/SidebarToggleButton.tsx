import { useT } from '../i18n'

interface SidebarToggleButtonProps {
  open: boolean
  onClick: () => void
  className?: string
}

export function SidebarToggleButton({ open, onClick, className = '' }: SidebarToggleButtonProps) {
  const t = useT()
  return (
    <button
      type="button"
      className={`gg-sidebar-toggle-btn ${open ? 'is-open' : ''} ${className}`.trim()}
      onClick={onClick}
      title={open ? t.rail.hideNavPanel : t.rail.showNavPanel}
      aria-pressed={open}
      aria-label={open ? t.rail.hideNavPanel : t.rail.showNavPanel}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <line x1="9" y1="4" x2="9" y2="20" />
      </svg>
      <span className="gg-sidebar-toggle-label">{t.rail.navPanel}</span>
    </button>
  )
}