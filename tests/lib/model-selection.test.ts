import { describe, expect, it } from 'vitest'
import { isStaleModelId, normalizeSelectedModel } from '../../shared/contracts/provider'

describe('model selection sanitizer', () => {
  const grokCatalog = {
    models: ['grok-4.5', 'grok-4'],
    defaultModel: 'grok-4.5',
  }

  it('replaces stale Grok Composer ids with the provider default', () => {
    expect(normalizeSelectedModel('grok-composer-2.5-fast', grokCatalog)).toBe('grok-4.5')
    expect(normalizeSelectedModel('grok-composer-2.5', grokCatalog)).toBe('grok-4.5')
    expect(normalizeSelectedModel('grok-build', grokCatalog)).toBe('grok-4.5')
  })

  it('handles stale ids case-insensitively and trims whitespace', () => {
    expect(isStaleModelId(' GROK-COMPOSER-2.5-FAST ')).toBe(true)
  })

  it('keeps valid catalog models and falls back for invalid catalog models', () => {
    expect(normalizeSelectedModel('grok-4', grokCatalog)).toBe('grok-4')
    expect(normalizeSelectedModel('missing-model', grokCatalog)).toBe('grok-4.5')
  })

  it('keeps non-empty custom models when the provider has no catalog', () => {
    expect(normalizeSelectedModel('my-custom-model', { models: [], defaultModel: 'fallback' })).toBe('my-custom-model')
  })
})
