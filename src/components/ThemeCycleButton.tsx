import { useT } from '../i18n'
import { getNextTheme, useTheme } from '../hooks/useTheme'

/**
 * Плавающая кнопка в правом нижнем углу — быстрое переключение тем.
 */
export function ThemeCycleButton() {
  const t = useT()
  const { theme, cycleTheme } = useTheme()
  const next = getNextTheme(theme)
  const nextLabel = t.themeFab?.[next.id] ?? next.label
  const hint = (t.themeFab?.switchTo ?? 'Switch to {name}').replace('{name}', nextLabel)

  return (
    <button
      type="button"
      className="gg-theme-cycle-fab"
      onClick={() => void cycleTheme()}
      title={hint}
      aria-label={hint}
    >
      <span className="gg-theme-cycle-fab-swatch" aria-hidden>
        <span className="gg-theme-cycle-fab-swatch-base" style={{ background: next.swatch[0] }} />
        <span className="gg-theme-cycle-fab-swatch-mid" style={{ background: next.swatch[1] }} />
        <span className="gg-theme-cycle-fab-swatch-accent" style={{ background: next.swatch[2] }} />
      </span>
      <span className="gg-theme-cycle-fab-icon" aria-hidden>
        {next.light ? '☀' : '☾'}
      </span>
    </button>
  )
}