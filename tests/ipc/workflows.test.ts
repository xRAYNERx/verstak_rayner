import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

/**
 * Интеграционный тест Agency Workflows: workflows:start собирает промпт +
 * детерминированно создаёт План из шагов (видим в WorkflowView). Мокаем
 * electron.ipcMain, реальные plans в in-memory БД — проверяем, что план
 * действительно создан и достаётся.
 */
const handlers = new Map<string, (...args: unknown[]) => unknown>()
vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, fn: (...args: unknown[]) => unknown) => { handlers.set(channel, fn) } }
}))

const { openDb } = await import('../../electron/storage/db')
const { createPlans } = await import('../../electron/storage/plans')
const { registerWorkflowsIpc } = await import('../../electron/ipc/workflows')

function invoke<T>(channel: string, ...args: unknown[]): T {
  const fn = handlers.get(channel)
  if (!fn) throw new Error(`no handler for ${channel}`)
  return fn({} as unknown, ...args) as T
}

describe('workflows IPC (Agency Workflows end-to-end)', () => {
  let dir: string
  let db: ReturnType<typeof openDb>
  let plans: ReturnType<typeof createPlans>

  beforeEach(() => {
    handlers.clear()
    dir = mkdtempSync(join(tmpdir(), 'gg-wf-'))
    db = openDb(join(dir, 'test.db'))
    plans = createPlans(db)
    registerWorkflowsIpc({ createPlan: (p, t, steps) => plans.create(p, t, steps) })
  })
  afterEach(() => { db.close(); rmSync(dir, { recursive: true, force: true }) })

  it('list: каталог содержит marketing-audit + RU-пак, у всех непустые шаги', () => {
    const list = invoke<Array<{ id: string; stepCount: number }>>('workflows:list')
    const ids = list.map(w => w.id)
    expect(ids).toContain('marketing-audit')
    expect(ids).toContain('ydirect-metrika-audit')
    expect(ids).toContain('bitrix-stale-deals')
    expect(ids).toContain('onec-sheets-reconcile')
    expect(list.every(w => w.stepCount > 0)).toBe(true)
  })

  it('start: вшивает бриф, создаёт реальный План из шагов, возвращает runState', () => {
    const res = invoke<{ prompt: string; planId: number; runState: { workflowId: string; status: string; planId?: number } }>(
      'workflows:start', 'ydirect-metrika-audit', dir, 'аккаунт ACME, период 30д'
    )
    // промпт содержит заголовок первого шага и сам бриф
    expect(res.prompt).toContain('Разбор брифа')
    expect(res.prompt).toContain('аккаунт ACME')
    // runState
    expect(res.runState.workflowId).toBe('ydirect-metrika-audit')
    expect(res.runState.status).toBe('pending')
    expect(res.runState.planId).toBe(res.planId)
    // план реально создан в БД, шаги = шаги workflow, заголовок = имя сценария
    const plan = plans.get(res.planId)
    expect(plan).not.toBeNull()
    expect(plan!.title).toBe('Реклама: Директ + Метрика')
    expect(plan!.steps.length).toBeGreaterThan(0)
    expect(plan!.steps[0].title).toBe('Разбор брифа')
  })

  it('start: неизвестный workflow → error unknown-workflow (план не создаётся)', () => {
    const res = invoke<{ error?: string; planId?: number }>('workflows:start', 'nope', dir, '')
    expect(res.error).toBe('unknown-workflow')
    expect(res.planId).toBeUndefined()
  })
})
