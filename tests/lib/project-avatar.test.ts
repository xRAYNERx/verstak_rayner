import { describe, expect, it } from 'vitest'
import {
  AVATAR_LETTER_STYLE,
  PROJECT_AVATAR_PALETTE,
  pickProjectColor,
  projectAvatarLetterStyle,
  projectAvatarLetterStyleOriginal,
  projectAvatarLetterStyleUnified,
  projectAvatarLetterStyleVariant1
} from '../../src/lib/project-avatar'

describe('project-avatar', () => {
  it('pickProjectColor is stable and uses the stored palette', () => {
    const a = pickProjectColor('C:\\Clients\\Ostov')
    const b = pickProjectColor('C:\\Clients\\Ostov')
    expect(a).toBe(b)
    expect(PROJECT_AVATAR_PALETTE).toContain(a)
  })

  it('unified style uses theme tokens only', () => {
    expect(AVATAR_LETTER_STYLE).toBe('unified')
    const style = projectAvatarLetterStyleUnified(34)
    expect(style.width).toBe(34)
    expect(style.background).toContain('var(--bg-overlay)')
    expect(style.color).toBe('var(--text-secondary)')
    expect(style.borderColor).toBe('var(--border-default)')
    expect(projectAvatarLetterStyle('#ff0000', 34)).toEqual(style)
  })

  it('variant1 mixes per-path tint into surfaces', () => {
    const style = projectAvatarLetterStyleVariant1('#5e81ac', 34)
    expect(style.background).toContain('color-mix')
    expect(style.background).toContain('#5e81ac')
  })

  it('original uses flat fill', () => {
    const style = projectAvatarLetterStyleOriginal('#5b8dff', 34)
    expect(style.background).toBe('#5b8dff')
    expect(style.color).toBe('rgba(0, 0, 0, 0.82)')
  })
})