import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { openDb } from '../../electron/storage/db'
import { createDevTasks } from '../../electron/storage/dev-tasks'

/**
 * Тесты storage-слоя Dev Task Flow (Фаза 1) + миграции 18.
 * Падают по ABI (NODE_MODULE_VERSION) вместе с остальными sqlite-тестами —
 * это известный шум, не регрессия. Логику миграции/функций проверяем здесь.
 */
describe('dev-tasks (migration 18)', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'gg-devtasks-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('миграция 18 создаёт таблицы dev_tasks / dev_task_runs / dev_task_checks', () => {
    const db = openDb(join(dir, 'test.db'))
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map(t => t.name)
    expect(tables).toContain('dev_tasks')
    expect(tables).toContain('dev_task_runs')
    expect(tables).toContain('dev_task_checks')
    db.close()
  })

  it('create → get: поля совпали, state=draft, created/updated проставлены', () => {
    const db = openDb(join(dir, 'test.db'))
    const dt = createDevTasks(db)
    const before = Date.now()
    const created = dt.create({
      projectPath: '/p', chatId: 7, title: 'Фича X',
      summary: 'делаем X', risk: 'low', baseBranch: 'main', baseSha: 'abc123'
    })
    expect(created.id).toBeGreaterThan(0)
    const row = dt.get(created.id)
    expect(row).not.toBeNull()
    expect(row!.projectPath).toBe('/p')
    expect(row!.chatId).toBe(7)
    expect(row!.planId).toBeNull()
    expect(row!.title).toBe('Фича X')
    expect(row!.state).toBe('draft')
    expect(row!.summary).toBe('делаем X')
    expect(row!.risk).toBe('low')
    expect(row!.baseBranch).toBe('main')
    expect(row!.baseSha).toBe('abc123')
    expect(row!.workBranch).toBeNull()
    expect(row!.checkpointId).toBeNull()
    expect(row!.packageJson).toBeNull()
    expect(row!.createdAt).toBeGreaterThanOrEqual(before)
    expect(row!.updatedAt).toBeGreaterThanOrEqual(before)
    db.close()
  })

  it('get несуществующей задачи → null', () => {
    const db = openDb(join(dir, 'test.db'))
    expect(createDevTasks(db).get(999)).toBeNull()
    db.close()
  })

  it('list отдаёт новейшие первыми (id DESC), изолирует по проекту и фильтрует по state', () => {
    const db = openDb(join(dir, 'test.db'))
    const dt = createDevTasks(db)
    const a = dt.create({ projectPath: '/p', title: 'A' })
    const b = dt.create({ projectPath: '/p', title: 'B' })
    const c = dt.create({ projectPath: '/p', title: 'C' })
    dt.create({ projectPath: '/other', title: 'Z' })
    // Новейшие первыми (id DESC).
    expect(dt.list('/p').map(t => t.id)).toEqual([c.id, b.id, a.id])
    // Изоляция по проекту.
    expect(dt.list('/other').map(t => t.title)).toEqual(['Z'])
    // Фильтр по state.
    dt.setState(b.id, 'in_progress')
    expect(dt.list('/p', { state: 'in_progress' }).map(t => t.id)).toEqual([b.id])
    expect(dt.list('/p', { state: 'draft' }).map(t => t.id)).toEqual([c.id, a.id])
    db.close()
  })

  it('update меняет поля и продвигает updated_at', async () => {
    const db = openDb(join(dir, 'test.db'))
    const dt = createDevTasks(db)
    const t = dt.create({ projectPath: '/p', title: 'A' })
    const before = dt.get(t.id)!.updatedAt
    // Гарантируем, что Date.now() сдвинется хотя бы на 1мс.
    await new Promise(r => setTimeout(r, 2))
    dt.update(t.id, { workBranch: 'verstak/x-123', checkpointId: 42, summary: 'обновили', state: 'branching' })
    const row = dt.get(t.id)!
    expect(row.workBranch).toBe('verstak/x-123')
    expect(row.checkpointId).toBe(42)
    expect(row.summary).toBe('обновили')
    expect(row.state).toBe('branching')
    expect(row.updatedAt).toBeGreaterThan(before)
    db.close()
  })

  it('update с пустым патчем — no-op (updated_at не двигается)', async () => {
    const db = openDb(join(dir, 'test.db'))
    const dt = createDevTasks(db)
    const t = dt.create({ projectPath: '/p', title: 'A' })
    const before = dt.get(t.id)!.updatedAt
    await new Promise(r => setTimeout(r, 2))
    dt.update(t.id, {})
    expect(dt.get(t.id)!.updatedAt).toBe(before)
    db.close()
  })

  it('setState меняет state', () => {
    const db = openDb(join(dir, 'test.db'))
    const dt = createDevTasks(db)
    const t = dt.create({ projectPath: '/p', title: 'A' })
    dt.setState(t.id, 'review_ready')
    expect(dt.get(t.id)!.state).toBe('review_ready')
    db.close()
  })

  it('linkRun идемпотентен (INSERT OR IGNORE — без дублей)', () => {
    const db = openDb(join(dir, 'test.db'))
    const dt = createDevTasks(db)
    const t = dt.create({ projectPath: '/p', title: 'A' })
    dt.linkRun(t.id, 'run-1')
    dt.linkRun(t.id, 'run-1')   // повтор — не дублируется
    dt.linkRun(t.id, 'run-2')
    const rows = db.prepare('SELECT run_id FROM dev_task_runs WHERE dev_task_id = ? ORDER BY run_id').all(t.id) as Array<{ run_id: string }>
    expect(rows.map(r => r.run_id)).toEqual(['run-1', 'run-2'])
    db.close()
  })

  it('addCheck + listChecks: порядок id ASC, ranInWorktree как boolean', () => {
    const db = openDb(join(dir, 'test.db'))
    const dt = createDevTasks(db)
    const t = dt.create({ projectPath: '/p', title: 'A' })
    dt.addCheck(t.id, { label: 'typecheck', command: 'npm run type', status: 'pass', exitCode: 0 })
    dt.addCheck(t.id, { label: 'tests', command: 'npm test', status: 'fail', exitCode: 1, outputTail: 'FAIL x', ranInWorktree: true })
    const checks = dt.listChecks(t.id)
    expect(checks).toHaveLength(2)
    expect(checks.map(c => c.label)).toEqual(['typecheck', 'tests'])
    expect(checks[0].status).toBe('pass')
    expect(checks[0].exitCode).toBe(0)
    expect(checks[0].ranInWorktree).toBe(false)   // default 0 → false
    expect(checks[1].status).toBe('fail')
    expect(checks[1].outputTail).toBe('FAIL x')
    expect(checks[1].ranInWorktree).toBe(true)
    expect(checks[0].id).toBeLessThan(checks[1].id)
    db.close()
  })

  it('setPackage замораживает package_json и переводит state в packaged', () => {
    const db = openDb(join(dir, 'test.db'))
    const dt = createDevTasks(db)
    const t = dt.create({ projectPath: '/p', title: 'A' })
    const pkg = JSON.stringify({ commitMessage: 'feat: x', files: ['a.ts'] })
    dt.setPackage(t.id, pkg)
    const row = dt.get(t.id)!
    expect(row.packageJson).toBe(pkg)
    expect(row.state).toBe('packaged')
    db.close()
  })
})
