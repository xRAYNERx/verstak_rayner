import { describe, expect, it } from 'vitest'
import { isEnabledModelsUnsetOrEmpty, modelKey } from '../../src/lib/enabled-models'

describe('enabled-models', () => {
  it('modelKey joins provider and model', () => {
    expect(modelKey('claude-api', 'claude-sonnet-4-6')).toBe('claude-api::claude-sonnet-4-6')
  })

  it('isEnabledModelsUnsetOrEmpty treats null and empty array as unset', () => {
    expect(isEnabledModelsUnsetOrEmpty(null)).toBe(true)
    expect(isEnabledModelsUnsetOrEmpty(undefined)).toBe(true)
    expect(isEnabledModelsUnsetOrEmpty('')).toBe(true)
    expect(isEnabledModelsUnsetOrEmpty('[]')).toBe(true)
    expect(isEnabledModelsUnsetOrEmpty('["a::b"]')).toBe(false)
  })

  it('isEnabledModelsUnsetOrEmpty treats invalid json as unset', () => {
    expect(isEnabledModelsUnsetOrEmpty('not-json')).toBe(true)
  })
})