import { describe, expect, it } from 'vitest'
import { isVersionInRange, normalizeVersion, semverGt } from '../src/lib/semver'

describe('src/lib/semver', () => {
  it('normalizeVersion strips v prefix', () => {
    expect(normalizeVersion('v1.4.0')).toBe('1.4.0')
  })

  it('semverGt compares versions', () => {
    expect(semverGt('1.4.0', '1.3.1')).toBe(true)
    expect(semverGt('1.3.1', '1.4.0')).toBe(false)
  })

  it('isVersionInRange keeps versions after since and up to current', () => {
    expect(isVersionInRange('1.4.0', '1.3.1', '1.4.0')).toBe(true)
    expect(isVersionInRange('1.3.1', '1.3.1', '1.4.0')).toBe(false)
    expect(isVersionInRange('1.5.0', '1.3.1', '1.4.0')).toBe(false)
  })
})