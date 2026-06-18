import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Database as DB } from 'better-sqlite3'
import { openDb } from '../../electron/storage/db'
import { createUserProfiles } from '../../electron/storage/user-profiles'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

/**
 * B7: setActive(id) деактивировал все профили, затем активировал id. На
 * несуществующем id активация трогала 0 строк → НИ ОДНОГО активного профиля.
 */
describe('user-profiles setActive (B7)', () => {
  let dir: string
  let db: DB
  let profiles: ReturnType<typeof createUserProfiles>

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'verstak-prof-'))
    db = openDb(join(dir, 'test.db'))
    profiles = createUserProfiles(db)
  })
  afterEach(() => { db.close(); rmSync(dir, { recursive: true, force: true }) })

  it('setActive(несуществующий id) НЕ обнуляет активный профиль', () => {
    const a = profiles.create({ name: 'A' })
    profiles.setActive(a.id)
    expect(profiles.list().find(p => p.isActive)?.id).toBe(a.id)

    profiles.setActive(99999) // несуществующий — должен быть no-op
    expect(profiles.list().find(p => p.isActive)?.id).toBe(a.id)
  })

  it('setActive(валидный) переключает активный профиль', () => {
    const a = profiles.create({ name: 'A' })
    const b = profiles.create({ name: 'B' })
    profiles.setActive(a.id)
    profiles.setActive(b.id)
    const active = profiles.list().filter(p => p.isActive)
    expect(active).toHaveLength(1)
    expect(active[0].id).toBe(b.id)
  })
})
