import { useEffect, useState, useCallback } from 'react'

export type ThemeId = 'nord' | 'light'

export interface ThemeMeta {
  id: ThemeId
  /** Russian label shown in the picker */
  label: string
  /** true = light surfaces (affects swatch contrast hints) */
  light: boolean
  /** [bg, surface, accent] — drives the swatch preview in Settings */
  swatch: [string, string, string]
}

/** Single source of truth for the picker. Colours mirror theme.css. */
export const THEMES: ThemeMeta[] = [
  { id: 'nord', label: 'Тёмная', light: false, swatch: ['#2e3440', '#3b4252', '#88c0d0'] },
  { id: 'light', label: 'Светлая', light: true, swatch: ['#ffffff', '#eef0f4', '#3a6ee8'] },
]

const VALID = new Set<ThemeId>(THEMES.map(t => t.id))
const LEGACY_DARK = new Set(['dark', 'dracula', 'tokyo-night', 'gruvbox'])

const STORAGE_KEY = 'theme'
const DEFAULT_THEME: ThemeId = 'nord'

function normalize(v: unknown): ThemeId {
  if (typeof v === 'string' && VALID.has(v as ThemeId)) return v as ThemeId
  if (typeof v === 'string' && LEGACY_DARK.has(v)) return 'nord'
  return DEFAULT_THEME
}

function applyTheme(theme: ThemeId): void {
  document.documentElement.setAttribute('data-theme', theme)
}

/**
 * Apply the saved theme as early as possible (before first paint of components
 * that read CSS variables). Called from main.tsx.
 */
export async function bootstrapTheme(): Promise<void> {
  try {
    const stored = await window.api.settings.getKey(STORAGE_KEY)
    applyTheme(normalize(stored))
    document.documentElement.removeAttribute('data-radius')
  } catch {
    applyTheme(DEFAULT_THEME)
  }
}

export function getNextTheme(current: ThemeId): ThemeMeta {
  const idx = THEMES.findIndex(t => t.id === current)
  const nextIdx = idx < 0 ? 0 : (idx + 1) % THEMES.length
  return THEMES[nextIdx]
}

export function useTheme(): {
  theme: ThemeId
  setTheme: (t: ThemeId) => Promise<void>
  cycleTheme: () => Promise<void>
} {
  const [theme, setLocal] = useState<ThemeId>(DEFAULT_THEME)

  useEffect(() => {
    let cancelled = false
    void window.api.settings.getKey(STORAGE_KEY).then(v => {
      if (cancelled) return
      const next = normalize(v)
      setLocal(next)
      applyTheme(next)
    })
    return () => { cancelled = true }
  }, [])

  const setTheme = useCallback(async (next: ThemeId) => {
    setLocal(next)
    applyTheme(next)
    await window.api.settings.setKey(STORAGE_KEY, next)
  }, [])

  const cycleTheme = useCallback(async () => {
    const next = getNextTheme(theme)
    await setTheme(next.id)
  }, [theme, setTheme])

  return { theme, setTheme, cycleTheme }
}