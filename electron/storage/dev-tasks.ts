import type { Database } from 'better-sqlite3'

/**
 * Dev Task Flow V1 (Фаза 1) — тонкий оркестратор «задача» поверх готовых
 * undo/checkpoint, plans, verify, git. Один объект dev_tasks агрегирует ветку,
 * run_id'ы, чекпоинт, проверки и итоговый пакет.
 *
 * State machine: draft → branching → in_progress → review_ready → (paused) →
 * packaged → committed/cancelled. Меняется через setState/update.
 *
 * changed_files НЕ храним — источник истины git diff. package_json — замороженный
 * снимок пакета (JSON-текст) на момент packaged.
 *
 * В Фазе 1 storage-фасад только создаётся и тестируется — поведение приложения
 * не меняется (оркестратор dev-task.ts и git-write — Фазы 2-5).
 */

export type DevTaskState =
  | 'draft'
  | 'branching'
  | 'in_progress'
  | 'review_ready'
  | 'paused'
  | 'packaged'
  | 'committed'
  | 'cancelled'

export type DevTaskCheckStatus = 'pending' | 'running' | 'pass' | 'fail' | 'skipped'

export interface DevTask {
  id: number
  projectPath: string
  chatId: number | null
  planId: number | null
  title: string
  state: DevTaskState
  baseBranch: string | null
  baseSha: string | null
  workBranch: string | null
  worktreePath: string | null
  checkpointId: number | null
  risk: string | null
  summary: string | null
  packageJson: string | null
  createdAt: number
  updatedAt: number
}

export interface DevTaskCheck {
  id: number
  devTaskId: number
  label: string
  command: string
  status: DevTaskCheckStatus
  exitCode: number | null
  outputTail: string | null
  ranInWorktree: boolean
  createdAt: number
}

/** Поля dev_tasks, которые можно патчить через update (camelCase → snake_case). */
export interface DevTaskPatch {
  chatId?: number | null
  planId?: number | null
  title?: string
  state?: DevTaskState
  baseBranch?: string | null
  baseSha?: string | null
  workBranch?: string | null
  worktreePath?: string | null
  checkpointId?: number | null
  risk?: string | null
  summary?: string | null
  packageJson?: string | null
}

export interface DevTasks {
  /** Создать задачу (state='draft', created_at/updated_at=now). Возвращает строку с id. */
  create: (opts: {
    projectPath: string
    chatId?: number | null
    title: string
    summary?: string | null
    risk?: string | null
    baseBranch?: string | null
    baseSha?: string | null
    workBranch?: string | null
    checkpointId?: number | null
  }) => DevTask
  get: (id: number) => DevTask | null
  /** Задачи проекта, новейшие первыми (id DESC). Фильтр state опционален. */
  list: (projectPath: string, opts?: { state?: DevTaskState }) => DevTask[]
  /** Частичный апдейт полей + updated_at=now. Пустой патч — no-op. */
  update: (id: number, patch: DevTaskPatch) => void
  /** Сменить state (+ updated_at=now). */
  setState: (id: number, state: DevTaskState) => void
  /** Связать прогон с задачей (INSERT OR IGNORE — идемпотентно). */
  linkRun: (devTaskId: number, runId: string) => void
  /** Добавить проверку (запись в dev_task_checks). */
  addCheck: (devTaskId: number, check: {
    label: string
    command: string
    status: DevTaskCheckStatus
    exitCode?: number | null
    outputTail?: string | null
    ranInWorktree?: boolean
  }) => void
  /** Проверки задачи в порядке добавления (id ASC). */
  listChecks: (devTaskId: number) => DevTaskCheck[]
  /** Заморозить пакет (package_json) и перевести задачу в state='packaged'. */
  setPackage: (id: number, packageJson: string) => void
}

const SELECT_TASK = `
  SELECT id, project_path as projectPath, chat_id as chatId, plan_id as planId,
         title, state, base_branch as baseBranch, base_sha as baseSha,
         work_branch as workBranch, worktree_path as worktreePath,
         checkpoint_id as checkpointId, risk, summary, package_json as packageJson,
         created_at as createdAt, updated_at as updatedAt
  FROM dev_tasks
`

const SELECT_CHECK = `
  SELECT id, dev_task_id as devTaskId, label, command, status,
         exit_code as exitCode, output_tail as outputTail,
         ran_in_worktree as ranInWorktree, created_at as createdAt
  FROM dev_task_checks
`

interface CheckRow {
  id: number
  devTaskId: number
  label: string
  command: string
  status: DevTaskCheckStatus
  exitCode: number | null
  outputTail: string | null
  ranInWorktree: number
  createdAt: number
}

export function createDevTasks(db: Database): DevTasks {
  return {
    create(opts) {
      const now = Date.now()
      const info = db.prepare(
        `INSERT INTO dev_tasks
          (project_path, chat_id, title, state, base_branch, base_sha,
           work_branch, checkpoint_id, risk, summary, created_at, updated_at)
         VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        opts.projectPath,
        opts.chatId ?? null,
        opts.title,
        opts.baseBranch ?? null,
        opts.baseSha ?? null,
        opts.workBranch ?? null,
        opts.checkpointId ?? null,
        opts.risk ?? null,
        opts.summary ?? null,
        now,
        now
      )
      const id = Number(info.lastInsertRowid)
      // get() гарантированно вернёт строку — мы её только что вставили.
      return db.prepare(`${SELECT_TASK} WHERE id = ?`).get(id) as DevTask
    },
    get(id) {
      const row = db.prepare(`${SELECT_TASK} WHERE id = ?`).get(id) as DevTask | undefined
      return row ?? null
    },
    list(projectPath, opts) {
      const where: string[] = ['project_path = ?']
      const vals: unknown[] = [projectPath]
      if (opts?.state !== undefined) { where.push('state = ?'); vals.push(opts.state) }
      return db.prepare(
        `${SELECT_TASK} WHERE ${where.join(' AND ')} ORDER BY id DESC`
      ).all(...vals) as DevTask[]
    },
    update(id, patch) {
      const sets: string[] = []
      const vals: unknown[] = []
      if (patch.chatId !== undefined) { sets.push('chat_id = ?'); vals.push(patch.chatId) }
      if (patch.planId !== undefined) { sets.push('plan_id = ?'); vals.push(patch.planId) }
      if (patch.title !== undefined) { sets.push('title = ?'); vals.push(patch.title) }
      if (patch.state !== undefined) { sets.push('state = ?'); vals.push(patch.state) }
      if (patch.baseBranch !== undefined) { sets.push('base_branch = ?'); vals.push(patch.baseBranch) }
      if (patch.baseSha !== undefined) { sets.push('base_sha = ?'); vals.push(patch.baseSha) }
      if (patch.workBranch !== undefined) { sets.push('work_branch = ?'); vals.push(patch.workBranch) }
      if (patch.worktreePath !== undefined) { sets.push('worktree_path = ?'); vals.push(patch.worktreePath) }
      if (patch.checkpointId !== undefined) { sets.push('checkpoint_id = ?'); vals.push(patch.checkpointId) }
      if (patch.risk !== undefined) { sets.push('risk = ?'); vals.push(patch.risk) }
      if (patch.summary !== undefined) { sets.push('summary = ?'); vals.push(patch.summary) }
      if (patch.packageJson !== undefined) { sets.push('package_json = ?'); vals.push(patch.packageJson) }
      if (sets.length === 0) return
      sets.push('updated_at = ?'); vals.push(Date.now())
      vals.push(id)
      db.prepare(`UPDATE dev_tasks SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
    },
    setState(id, state) {
      db.prepare('UPDATE dev_tasks SET state = ?, updated_at = ? WHERE id = ?').run(state, Date.now(), id)
    },
    linkRun(devTaskId, runId) {
      db.prepare(
        'INSERT OR IGNORE INTO dev_task_runs (dev_task_id, run_id) VALUES (?, ?)'
      ).run(devTaskId, runId)
    },
    addCheck(devTaskId, check) {
      db.prepare(
        `INSERT INTO dev_task_checks
          (dev_task_id, label, command, status, exit_code, output_tail, ran_in_worktree, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        devTaskId,
        check.label,
        check.command,
        check.status,
        check.exitCode ?? null,
        check.outputTail ?? null,
        check.ranInWorktree ? 1 : 0,
        Date.now()
      )
    },
    listChecks(devTaskId) {
      const rows = db.prepare(
        `${SELECT_CHECK} WHERE dev_task_id = ? ORDER BY id ASC`
      ).all(devTaskId) as CheckRow[]
      return rows.map(r => ({ ...r, ranInWorktree: r.ranInWorktree === 1 }))
    },
    setPackage(id, packageJson) {
      db.prepare(
        "UPDATE dev_tasks SET package_json = ?, state = 'packaged', updated_at = ? WHERE id = ?"
      ).run(packageJson, Date.now(), id)
    }
  }
}
