import { useEffect, useState, useCallback } from 'react'

export type ThemeId = 'dark' | 'light'
const STORAGE_KEY = 'theme'
const DEFAULT_THEME: ThemeId = 'dark'

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
    const theme: ThemeId = stored === 'light' ? 'light' : 'dark'
    applyTheme(theme)
  } catch {
    applyTheme(DEFAULT_THEME)
  }
}

export function useTheme(): { theme: ThemeId; setTheme: (t: ThemeId) => Promise<void> } {
  const [theme, setLocal] = useState<ThemeId>(DEFAULT_THEME)

  useEffect(() => {
    let cancelled = false
    void window.api.settings.getKey(STORAGE_KEY).then(v => {
      if (cancelled) return
      const next: ThemeId = v === 'light' ? 'light' : 'dark'
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

  return { theme, setTheme }
}
