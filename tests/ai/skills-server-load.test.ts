import { describe, it, expect, vi, afterEach } from 'vitest'
import { loadAllSkills } from '../../electron/ai/skills/loader'

/**
 * B8: loadFromServer не оборачивал каждый серверный скилл в try/catch (в отличие
 * от loadFromDir) — один битый элемент (например без поля raw) бросал из
 * parseSkillFile и ронял загрузку ВСЕХ серверных скиллов (serverReachable=false).
 */
afterEach(() => { vi.unstubAllGlobals() })

describe('loadAllSkills — серверные скиллы (B8)', () => {
  it('один битый серверный скилл (без raw) не теряет остальные', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        skills: [
          { id: 'good-server-skill', raw: '---\nid: good-server-skill\n---\nтело' },
          { id: 'bad-no-raw' }, // нет raw → parseSkillFile упал бы и снёс всё
        ],
      }),
    })))

    const r = await loadAllSkills({ serverBase: 'https://example.test' })

    expect(r.serverReachable).toBe(true)
    expect(r.skills.some(s => s.id === 'good-server-skill')).toBe(true)
    expect(r.stats.server).toBe(1) // good загружен, bad пропущен — не уронил всё
  })
})
