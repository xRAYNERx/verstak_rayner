import { describe, it, expect } from 'vitest'
import { isCliProvider, CLI_PROVIDER_IDS } from '../../src/lib/model-catalog'

describe('isCliProvider', () => {
  it('true для всех 4 CLI-провайдеров', () => {
    for (const id of CLI_PROVIDER_IDS) expect(isCliProvider(id)).toBe(true)
    expect(CLI_PROVIDER_IDS.size).toBe(4)
  })

  it('false для API-провайдеров', () => {
    expect(isCliProvider('claude')).toBe(false)
    expect(isCliProvider('gemini-api')).toBe(false)
    expect(isCliProvider('openai')).toBe(false)
    expect(isCliProvider('grok')).toBe(false)
  })

  it('false для null/undefined/пустого', () => {
    expect(isCliProvider(null)).toBe(false)
    expect(isCliProvider(undefined)).toBe(false)
    expect(isCliProvider('')).toBe(false)
  })
})
