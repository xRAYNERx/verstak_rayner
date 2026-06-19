import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import type { Database } from 'better-sqlite3'
import { openDb } from '../../electron/storage/db'
import { createProjects } from '../../electron/storage/projects'

describe('projects', () => {
  let dir: string
  let db: Database | undefined

  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'gg-proj-')) })
  afterEach(() => {
    db?.close()
    db = undefined
    rmSync(dir, { recursive: true, force: true })
  })

  it('touch does not create a missing project row', () => {
    db = openDb(join(dir, 't.db'))
    const projects = createProjects(db)
    projects.touch('C:\\Users\\RAYNER')
    expect(projects.list()).toEqual([])
  })

  it('миграция 23: projects имеет kind + remote_json', () => {
    db = openDb(join(dir, 't.db'))
    const cols = (db.prepare('PRAGMA table_info(projects)').all() as Array<{ name: string }>).map(c => c.name)
    expect(cols).toContain('kind')
    expect(cols).toContain('remote_json')
  })

  it('upsert → local-проект (kind=local, remote=null)', () => {
    db = openDb(join(dir, 't.db'))
    const p = createProjects(db).upsert('C:\\proj')
    expect(p.kind).toBe('local')
    expect(p.remote).toBeNull()
  })

  it('createRemote ssh-live → kind=ssh + remote разобран обратно', () => {
    db = openDb(join(dir, 't.db'))
    const projects = createProjects(db)
    const remote = { kind: 'ssh' as const, user: 'root', host: 'agi-iri.ru', remotePath: '/var/www/agi-iri.ru', name: 'agi-iri.ru' }
    const created = projects.createRemote('ssh://root@agi-iri.ru/var/www/agi-iri.ru', 'ssh', remote)
    expect(created.kind).toBe('ssh')
    expect(created.name).toBe('agi-iri.ru')
    expect(created.remote).toEqual(remote)
    // переживает round-trip через list()
    const fromList = projects.list().find(p => p.kind === 'ssh')
    expect(fromList?.remote).toEqual(remote)
  })

  it('createRemote git → kind=git + cloneUrl', () => {
    db = openDb(join(dir, 't.db'))
    const remote = { kind: 'git' as const, cloneUrl: 'https://github.com/owner/repo', name: 'repo' }
    const p = createProjects(db).createRemote('/home/.verstak/projects/repo', 'git', remote)
    expect(p.kind).toBe('git')
    expect(p.remote).toEqual(remote)
  })

  it('upsert creates then touch updates lastOpenedAt', () => {
    db = openDb(join(dir, 't.db'))
    const projects = createProjects(db)
    const first = projects.upsert('C:\\Users\\RAYNER')
    expect(projects.list()).toHaveLength(1)
    expect(first.path).toBe('C:\\Users\\RAYNER')
    expect(first.iconPath).toBeNull()
    projects.touch('C:\\Users\\RAYNER')
    const second = projects.list().find(p => p.path === 'C:\\Users\\RAYNER')!
    expect(second.lastOpenedAt).toBeGreaterThanOrEqual(first.lastOpenedAt)
  })

  it('list is alphabetical and reopening does not reorder', () => {
    db = openDb(join(dir, 't3.db'))
    const projects = createProjects(db)
    projects.upsert('C:\\Zeta')
    projects.upsert('C:\\Alpha')
    projects.upsert('C:\\Mike')
    expect(projects.list().map(p => p.name)).toEqual(['Alpha', 'Mike', 'Zeta'])
    projects.upsert('C:\\Mike')
    expect(projects.list().map(p => p.name)).toEqual(['Alpha', 'Mike', 'Zeta'])
  })

  it('list puts Cyrillic before Latin', () => {
    db = openDb(join(dir, 't4.db'))
    const projects = createProjects(db)
    projects.upsert('C:\\Alpha')
    projects.upsert('C:\\Ostov')
    projects.upsert('C:\\Avtor')
    projects.updateMeta('C:\\Ostov', { name: 'ГК Остов' })
    projects.updateMeta('C:\\Avtor', { name: 'Автор' })
    expect(projects.list().map(p => p.name)).toEqual(['Автор', 'ГК Остов', 'Alpha'])
  })

  it('updateMeta can hide and unhide a project', () => {
    db = openDb(join(dir, 't5.db'))
    const projects = createProjects(db)
    projects.upsert('C:\\Clients\\Hidden')
    expect(projects.list()[0].hidden).toBe(false)
    const hidden = projects.updateMeta('C:\\Clients\\Hidden', { hidden: true })
    expect(hidden?.hidden).toBe(true)
    expect(projects.list()[0].hidden).toBe(true)
    const visible = projects.updateMeta('C:\\Clients\\Hidden', { hidden: false })
    expect(visible?.hidden).toBe(false)
  })

  it('updateMeta renames and stores icon path without touching folder', () => {
    db = openDb(join(dir, 't2.db'))
    const projects = createProjects(db)
    projects.upsert('C:\\Clients\\Ostov')
    const updated = projects.updateMeta('C:\\Clients\\Ostov', {
      name: 'ГК Остов',
      iconPath: 'C:\\AppData\\verstak\\project-icons\\abc.png'
    })
    expect(updated?.name).toBe('ГК Остов')
    expect(updated?.iconPath).toContain('abc.png')
    expect(projects.list()[0].name).toBe('ГК Остов')
  })
})