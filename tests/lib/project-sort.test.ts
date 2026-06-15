import { describe, it, expect } from 'vitest'
import { compareProjectNames, projectNameSortGroup, sortProjectsByName } from '../../src/lib/project-sort'

describe('project-sort', () => {
  it('groups Cyrillic before Latin', () => {
    expect(projectNameSortGroup('Автор')).toBe(0)
    expect(projectNameSortGroup('Alpha')).toBe(1)
    expect(compareProjectNames('ГК Остов', 'Beta')).toBeLessThan(0)
    expect(compareProjectNames('Alpha', 'Остов')).toBeGreaterThan(0)
  })

  it('sorts Cyrillic with ru locale', () => {
    const names = sortProjectsByName([
      { name: 'ГК Остов', path: 'C:\\Ostov' },
      { name: 'Автор', path: 'C:\\Avtor' },
      { name: 'Видланекс', path: 'C:\\Wid' },
    ]).map(p => p.name)
    expect(names).toEqual(['Автор', 'Видланекс', 'ГК Остов'])
  })

  it('sorts Latin after Cyrillic', () => {
    const names = sortProjectsByName([
      { name: 'Zeta', path: 'C:\\Z' },
      { name: 'Alpha', path: 'C:\\A' },
      { name: 'Остов', path: 'C:\\O' },
      { name: 'Mike', path: 'C:\\M' },
    ]).map(p => p.name)
    expect(names).toEqual(['Остов', 'Alpha', 'Mike', 'Zeta'])
  })
})