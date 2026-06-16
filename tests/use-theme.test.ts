import { describe, expect, it } from 'vitest'
import { getNextTheme, THEMES } from '../src/hooks/useTheme'

describe('getNextTheme', () => {
  it('cycles nord -> light -> nord', () => {
    expect(getNextTheme('nord').id).toBe('light')
    expect(getNextTheme('light').id).toBe('nord')
  })

  it('covers all themes', () => {
    let current = THEMES[0].id
    const seen = new Set<string>()
    for (let i = 0; i < THEMES.length; i++) {
      seen.add(current)
      current = getNextTheme(current).id
    }
    expect(seen.size).toBe(THEMES.length)
  })
})