import { ipcMain } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import type { DevTasks, DevTask, DevTaskCheck } from '../storage/dev-tasks'
import type { UndoStack } from '../storage/undo'
import { revertToCheckpoint } from './undo'

const execFileAsync = promisify(execFile)

/**
 * Dev Task Flow (Фаза 2) — оркестратор открытия задачи + наблюдение + откат.
 *
 * Тонкий слой поверх готовых dev_tasks (storage), undo/checkpoint (UndoStack) и
 * git READ. Один объект dev_task агрегирует чекпоинт, base_branch/base_sha,
 * привязанные прогоны. Агентный loop / system-layer НЕ трогаем — задача только
 * наблюдает существующие события.
 *
 * Фаза 2 ограничения (см. roadmap раздел 9):
 *   - ветку НЕ создаём (dirty-in-place, work_branch=null) — git-write это Фаза 3.
 *   - откат ТОЛЬКО через существующий undo:revertToCheckpoint (свой стек не заводим).
 *   - revert НЕ меняет state: откат файлов ≠ отмена задачи (задача остаётся
 *     активной, пользователь может продолжать работу или отменить вручную позже).
 *
 * Безопасность git: execFile('git', [...], {cwd}) без shell → нет command
 * injection (как в ipc/git.ts). Здесь только read-операции (branch / rev-parse).
 */

const GIT_TIMEOUT = 15_000

export interface DevTaskDeps {
  tasks: DevTasks
  getProjectRoot: () => string | null
  undoStack: UndoStack
}

/** Снимок git-базы на момент открытия задачи. */
interface GitBase {
  branch: string | null
  sha: string | null
}

/**
 * Текущая ветка + HEAD sha активного проекта. Read-only, argv-форма.
 * Не git-репозиторий / git не установлен → { null, null } (не падаем).
 */
async function readGitBase(cwd: string): Promise<GitBase> {
  const opts = { cwd, timeout: GIT_TIMEOUT, windowsHide: true }
  let branch: string | null = null
  let sha: string | null = null
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], opts)
    const b = String(stdout ?? '').trim()
    // 'HEAD' → detached, веткой не считаем.
    branch = b && b !== 'HEAD' ? b : null
  } catch { /* нет git / репозитория — branch остаётся null */ }
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], opts)
    const s = String(stdout ?? '').trim()
    sha = s || null
  } catch { /* нет коммитов / репозитория — sha остаётся null */ }
  return { branch, sha }
}

/** Состояния, при которых dev_task ещё «активна» (не финальная). */
export function isActiveDevTask(task: DevTask): boolean {
  return task.state !== 'committed' && task.state !== 'cancelled'
}

export interface DevTaskDetail {
  task: DevTask | null
  checks: DevTaskCheck[]
}

export function registerDevTaskIpc(deps: DevTaskDeps): void {
  const { tasks, getProjectRoot, undoStack } = deps

  /**
   * Снять checkpoint текущего топа undo-стека — ТА ЖЕ семантика, что и
   * undo:checkpoint: id новейшей записи стека, либо 0 если стек пуст (0 ниже
   * любого реального autoincrement id, поэтому `id > 0` матчит все будущие
   * записи при откате). Переиспользуем UndoStack, не дублируем механизм.
   */
  function snapCheckpoint(projectPath: string): number {
    const list = undoStack.list(projectPath)
    return list.length > 0 ? list[0].id : 0
  }

  // devtask:open — открыть задачу: снять checkpoint, зафиксировать git-базу,
  // создать строку dev_tasks (state='draft', ветку НЕ создаём — Фаза 2).
  ipcMain.handle('devtask:open', async (_e, opts: { chatId?: number | null; title: string; summary?: string | null; risk?: string | null }): Promise<DevTask | null> => {
    const projectPath = getProjectRoot()
    if (!projectPath) return null
    const title = String(opts?.title ?? '').trim()
    if (!title) return null
    const checkpointId = snapCheckpoint(projectPath)
    const base = await readGitBase(projectPath)
    const task = tasks.create({
      projectPath,
      chatId: opts.chatId ?? null,
      title,
      summary: opts.summary ?? null,
      risk: opts.risk ?? null,
      baseBranch: base.branch,
      baseSha: base.sha,
      workBranch: null, // Фаза 2: dirty-in-place, ветку создаст Фаза 3.
      checkpointId
    })
    return task
  })

  // devtask:openFromPreflight — открыть задачу из объявленного preflight-плана.
  // Маппинг preflight → { title: summary.slice(0,80), summary, risk }.
  ipcMain.handle('devtask:openFromPreflight', async (_e, opts: {
    chatId?: number | null
    preflight: { summary: string; risk?: string; riskReason?: string; affectedZones?: string[] }
  }): Promise<DevTask | null> => {
    const projectPath = getProjectRoot()
    if (!projectPath) return null
    const summary = String(opts?.preflight?.summary ?? '').trim()
    if (!summary) return null
    const title = summary.slice(0, 80)
    const risk = opts.preflight.risk ?? null
    const checkpointId = snapCheckpoint(projectPath)
    const base = await readGitBase(projectPath)
    const task = tasks.create({
      projectPath,
      chatId: opts.chatId ?? null,
      title,
      summary,
      risk,
      baseBranch: base.branch,
      baseSha: base.sha,
      workBranch: null,
      checkpointId
    })
    return task
  })

  // devtask:get — задача + её проверки. id null/несуществующий → пустой агрегат.
  ipcMain.handle('devtask:get', (_e, id: number): DevTaskDetail => {
    const task = tasks.get(id)
    if (!task) return { task: null, checks: [] }
    return { task, checks: tasks.listChecks(id) }
  })

  // devtask:list — задачи проекта (новейшие первыми). Фильтр state опционален.
  ipcMain.handle('devtask:list', (_e, projectPath: string, opts?: { state?: DevTask['state'] }): DevTask[] => {
    if (!projectPath) return []
    return tasks.list(projectPath, opts)
  })

  // devtask:linkRun — связать прогон (run_id) с задачей. Идемпотентно (INSERT OR IGNORE).
  ipcMain.handle('devtask:linkRun', (_e, id: number, runId: string): void => {
    if (!id || !runId) return
    tasks.linkRun(id, runId)
  })

  /**
   * devtask:revert — откатить файловые правки задачи к её чекпоинту.
   * Переиспользует СУЩЕСТВУЮЩИЙ механизм undo:revertToCheckpoint (тот же стек,
   * не дублируем откат). НЕ меняем state — откат файлов ≠ отмена задачи: задача
   * остаётся активной, можно продолжить работу. checkpoint_id===null → нечего
   * откатывать (задача без снятого чекпоинта).
   *
   * Возвращает true если откат прошёл успешно, иначе false.
   */
  ipcMain.handle('devtask:revert', async (_e, id: number): Promise<boolean> => {
    const projectPath = getProjectRoot()
    if (!projectPath) return false
    const task = tasks.get(id)
    if (!task || task.checkpointId == null) return false
    // Переиспользуем РОВНО ТОТ ЖЕ откат, что и undo:revertToCheckpoint /
    // кнопка «Откатить сессию» — тот же UndoStack, общая функция, не дублируем.
    const result = await revertToCheckpoint(undoStack, projectPath, task.checkpointId)
    return result.ok
  })
}
