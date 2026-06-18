import { describe, it, expect } from 'vitest'
import { resolveSkillOverride } from '../../src/lib/skill-override'

describe('resolveSkillOverride (B5)', () => {
  it('разное семейство → переключает провайдера + применяет модель', () => {
    expect(resolveSkillOverride({ default_provider: 'claude', default_model: 'claude-opus-4-5' }, 'gemini-api'))
      .toEqual({ providerId: 'claude', model: 'claude-opus-4-5' })
  })

  it('то же семейство (claude-cli vs claude) → провайдер не трогаем, но модель применяем', () => {
    expect(resolveSkillOverride({ default_provider: 'claude', default_model: 'claude-opus-4-5' }, 'claude-cli'))
      .toEqual({ model: 'claude-opus-4-5' })
  })

  it('нет default_provider → ничего (модель без провайдера небезопасна)', () => {
    expect(resolveSkillOverride({ default_model: 'claude-opus-4-5' }, 'gemini-api')).toEqual({})
  })

  it('нет default_model → только провайдер при разном семействе', () => {
    expect(resolveSkillOverride({ default_provider: 'claude' }, 'gemini-api')).toEqual({ providerId: 'claude' })
  })
})
