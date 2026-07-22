import { randomUUID } from 'crypto'
import type { Database } from 'better-sqlite3'

export type ProjectTaskStatus = 'new' | 'in_progress' | 'review' | 'done' | 'paused' | 'cancelled'
export type ProjectTaskPriority = 'low' | 'normal' | 'high' | 'urgent'
export type ProjectTaskSource = 'verstak' | 'bitrix24' | 'jira' | 'external'
export type ProjectTaskSyncState = 'local' | 'synced' | 'pending' | 'conflict' | 'error'
export type ProjectTaskLinkTarget = 'chat_message' | 'chat_session' | 'file' | 'skill' | 'project'

export interface Task {
  id: number
  uuid: string
  projectPath: string
  projectId: string
  workspaceId: string
  title: string
  text: string
  description: string | null
  status: ProjectTaskStatus
  priority: ProjectTaskPriority
  deadlineAt: number | null
  assigneeId: string | null
  createdById: string | null
  source: ProjectTaskSource
  externalProviderId: string | null
  externalTaskId: string | null
  externalUrl: string | null
  syncState: ProjectTaskSyncState
  done: boolean
  createdAt: number
  updatedAt: number
  completedAt: number | null
  doneAt: number | null
  deletedAt: number | null
}

export interface TaskInput {
  projectPath: string
  title: string
  description?: string | null
  status?: ProjectTaskStatus
  priority?: ProjectTaskPriority
  deadlineAt?: number | null
  assigneeId?: string | null
  createdById?: string | null
  source?: ProjectTaskSource
  externalProviderId?: string | null
  externalTaskId?: string | null
  externalUrl?: string | null
  syncState?: ProjectTaskSyncState
}

export interface TaskUpdate {
  title?: string
  description?: string | null
  status?: ProjectTaskStatus
  priority?: ProjectTaskPriority
  deadlineAt?: number | null
  assigneeId?: string | null
  syncState?: ProjectTaskSyncState
}

export interface TaskLink {
  id: number
  taskId: number
  targetType: ProjectTaskLinkTarget
  targetId: string
  label: string | null
  createdAt: number
}

export interface TaskLinkInput {
  taskId: number
  targetType: ProjectTaskLinkTarget
  targetId: string
  label?: string | null
}

export interface Tasks {
  list: (projectPath: string) => Task[]
  create: (input: TaskInput) => Task
  update: (id: number, patch: TaskUpdate) => Task | null
  softDelete: (id: number) => Task | null
  link: (input: TaskLinkInput) => TaskLink
  listLinks: (taskId: number) => TaskLink[]
  add: (projectPath: string, text: string) => Task
  toggle: (id: number, done: boolean) => void
  remove: (id: number) => void
  clearDone: (projectPath: string) => number
}

interface Row {
  id: number
  uuid: string | null
  projectPath: string
  projectId: string | null
  workspaceId: string | null
  title: string | null
  text: string
  description: string | null
  status: ProjectTaskStatus | null
  priority: ProjectTaskPriority | null
  deadlineAt: number | null
  assigneeId: string | null
  createdById: string | null
  source: ProjectTaskSource | null
  externalProviderId: string | null
  externalTaskId: string | null
  externalUrl: string | null
  syncState: ProjectTaskSyncState | null
  done: number
  createdAt: number
  updatedAt: number | null
  completedAt: number | null
  doneAt: number | null
  deletedAt: number | null
}

interface LinkRow {
  id: number
  taskId: number
  targetType: ProjectTaskLinkTarget
  targetId: string
  label: string | null
  createdAt: number
}

const SELECT = `
  SELECT id, uuid, project_path as projectPath, project_id as projectId,
         workspace_id as workspaceId, title, text, description, status,
         priority, deadline_at as deadlineAt, assignee_id as assigneeId,
         created_by_id as createdById, source,
         external_provider_id as externalProviderId,
         external_task_id as externalTaskId, external_url as externalUrl,
         sync_state as syncState, done, created_at as createdAt,
         updated_at as updatedAt, completed_at as completedAt,
         done_at as doneAt, deleted_at as deletedAt
  FROM tasks
`

const LOCAL_WORKSPACE_ID = 'local'
const LOCAL_USER_ID = 'local-user'

function projectId(projectPath: string): string {
  return projectPath.trim().toLowerCase().replace(/\\/g, '/')
}

function cleanTitle(title: string): string {
  return title.trim().replace(/\s+/g, ' ').slice(0, 180)
}

function rowToTask(r: Row): Task {
  const status = r.status ?? (r.done ? 'done' : 'new')
  const title = r.title?.trim() || r.text
  const completedAt = r.completedAt ?? r.doneAt ?? null
  return {
    id: r.id,
    uuid: r.uuid ?? String(r.id),
    projectPath: r.projectPath,
    projectId: r.projectId ?? projectId(r.projectPath),
    workspaceId: r.workspaceId ?? LOCAL_WORKSPACE_ID,
    title,
    text: title,
    description: r.description,
    status,
    priority: r.priority ?? 'normal',
    deadlineAt: r.deadlineAt,
    assigneeId: r.assigneeId,
    createdById: r.createdById ?? LOCAL_USER_ID,
    source: r.source ?? 'verstak',
    externalProviderId: r.externalProviderId,
    externalTaskId: r.externalTaskId,
    externalUrl: r.externalUrl,
    syncState: r.syncState ?? 'local',
    done: status === 'done',
    createdAt: r.createdAt,
    updatedAt: r.updatedAt ?? r.createdAt,
    completedAt,
    doneAt: completedAt,
    deletedAt: r.deletedAt
  }
}

function ensureColumn(db: Database, table: string, name: string, sql: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (!cols.some(c => c.name === name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${sql}`)
}

export function ensureTasksSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_path TEXT NOT NULL,
      text TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      done_at INTEGER
    );
  `)
  ensureColumn(db, 'tasks', 'uuid', 'uuid TEXT')
  ensureColumn(db, 'tasks', 'project_id', 'project_id TEXT')
  ensureColumn(db, 'tasks', 'workspace_id', 'workspace_id TEXT')
  ensureColumn(db, 'tasks', 'title', 'title TEXT')
  ensureColumn(db, 'tasks', 'description', 'description TEXT')
  ensureColumn(db, 'tasks', 'status', "status TEXT NOT NULL DEFAULT 'new'")
  ensureColumn(db, 'tasks', 'priority', "priority TEXT NOT NULL DEFAULT 'normal'")
  ensureColumn(db, 'tasks', 'deadline_at', 'deadline_at INTEGER')
  ensureColumn(db, 'tasks', 'assignee_id', 'assignee_id TEXT')
  ensureColumn(db, 'tasks', 'created_by_id', 'created_by_id TEXT')
  ensureColumn(db, 'tasks', 'source', "source TEXT NOT NULL DEFAULT 'verstak'")
  ensureColumn(db, 'tasks', 'external_provider_id', 'external_provider_id TEXT')
  ensureColumn(db, 'tasks', 'external_task_id', 'external_task_id TEXT')
  ensureColumn(db, 'tasks', 'external_url', 'external_url TEXT')
  ensureColumn(db, 'tasks', 'sync_state', "sync_state TEXT NOT NULL DEFAULT 'local'")
  ensureColumn(db, 'tasks', 'updated_at', 'updated_at INTEGER')
  ensureColumn(db, 'tasks', 'completed_at', 'completed_at INTEGER')
  ensureColumn(db, 'tasks', 'deleted_at', 'deleted_at INTEGER')

  const now = Date.now()
  db.prepare('UPDATE tasks SET uuid = ? || id WHERE uuid IS NULL OR uuid = ?').run('task-', '')
  db.prepare('UPDATE tasks SET project_id = lower(replace(project_path, ?, ?)) WHERE project_id IS NULL OR project_id = ?').run('\\', '/', '')
  db.prepare('UPDATE tasks SET workspace_id = ? WHERE workspace_id IS NULL OR workspace_id = ?').run(LOCAL_WORKSPACE_ID, '')
  db.prepare('UPDATE tasks SET title = text WHERE title IS NULL OR title = ?').run('')
  db.prepare("UPDATE tasks SET status = CASE WHEN done = 1 THEN 'done' ELSE 'new' END WHERE status IS NULL OR status = ''").run()
  db.prepare("UPDATE tasks SET priority = 'normal' WHERE priority IS NULL OR priority = ''").run()
  db.prepare("UPDATE tasks SET source = 'verstak' WHERE source IS NULL OR source = ''").run()
  db.prepare("UPDATE tasks SET sync_state = 'local' WHERE sync_state IS NULL OR sync_state = ''").run()
  db.prepare('UPDATE tasks SET created_by_id = ? WHERE created_by_id IS NULL OR created_by_id = ?').run(LOCAL_USER_ID, '')
  db.prepare('UPDATE tasks SET updated_at = COALESCE(done_at, created_at, ?) WHERE updated_at IS NULL').run(now)
  db.prepare('UPDATE tasks SET completed_at = done_at WHERE completed_at IS NULL AND done = 1 AND done_at IS NOT NULL').run()

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_uuid ON tasks(uuid);
    CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_path, done, created_at);
    CREATE INDEX IF NOT EXISTS idx_tasks_project_status ON tasks(project_path, status, updated_at);
    CREATE INDEX IF NOT EXISTS idx_tasks_deleted ON tasks(deleted_at);

    CREATE TABLE IF NOT EXISTS task_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      label TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_task_links_task ON task_links(task_id);
    CREATE INDEX IF NOT EXISTS idx_task_links_target ON task_links(target_type, target_id);

    CREATE TABLE IF NOT EXISTS local_users (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      email TEXT,
      avatar TEXT,
      is_local INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'local',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `)
  db.prepare(`
    INSERT INTO local_users (id, display_name, email, avatar, is_local, created_at)
    VALUES (?, ?, NULL, NULL, 1, ?)
    ON CONFLICT(id) DO NOTHING
  `).run(LOCAL_USER_ID, 'Я', now)
  db.prepare(`
    INSERT INTO workspaces (id, name, type, created_at, updated_at)
    VALUES (?, ?, 'local', ?, ?)
    ON CONFLICT(id) DO NOTHING
  `).run(LOCAL_WORKSPACE_ID, 'Локальное пространство', now, now)
}

export function createTasks(db: Database): Tasks {
  ensureTasksSchema(db)

  return {
    list(projectPath) {
      const rows = db.prepare(`
        ${SELECT}
        WHERE project_path = ? AND deleted_at IS NULL
        ORDER BY
          CASE status WHEN 'done' THEN 1 WHEN 'cancelled' THEN 1 ELSE 0 END,
          COALESCE(deadline_at, 9223372036854775807) ASC,
          updated_at DESC,
          id DESC
      `).all(projectPath) as Row[]
      return rows.map(rowToTask)
    },
    create(input) {
      const now = Date.now()
      const title = cleanTitle(input.title)
      if (!input.projectPath.trim()) throw new Error('projectPath is required')
      if (!title) throw new Error('title is required')
      const status = input.status ?? 'new'
      const completedAt = status === 'done' ? now : null
      const info = db.prepare(`
        INSERT INTO tasks (
          uuid, project_path, project_id, workspace_id, title, text, description,
          status, priority, deadline_at, assignee_id, created_by_id, source,
          external_provider_id, external_task_id, external_url, sync_state,
          done, created_at, updated_at, completed_at, done_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        randomUUID(),
        input.projectPath,
        projectId(input.projectPath),
        LOCAL_WORKSPACE_ID,
        title,
        title,
        input.description?.trim() || null,
        status,
        input.priority ?? 'normal',
        input.deadlineAt ?? null,
        input.assigneeId ?? null,
        input.createdById ?? LOCAL_USER_ID,
        input.source ?? 'verstak',
        input.externalProviderId ?? null,
        input.externalTaskId ?? null,
        input.externalUrl ?? null,
        input.syncState ?? 'local',
        status === 'done' ? 1 : 0,
        now,
        now,
        completedAt,
        completedAt
      )
      return this.list(input.projectPath).find(t => t.id === Number(info.lastInsertRowid))!
    },
    update(id, patch) {
      const current = db.prepare(`${SELECT} WHERE id = ? AND deleted_at IS NULL`).get(id) as Row | undefined
      if (!current) return null
      const nextStatus = patch.status ?? current.status ?? (current.done ? 'done' : 'new')
      const completedAt = nextStatus === 'done'
        ? current.completedAt ?? current.doneAt ?? Date.now()
        : null
      const nextTitle = patch.title !== undefined ? cleanTitle(patch.title) : current.title ?? current.text
      if (!nextTitle) throw new Error('title is required')
      db.prepare(`
        UPDATE tasks
        SET title = ?, text = ?, description = ?, status = ?, priority = ?,
            deadline_at = ?, assignee_id = ?, sync_state = ?, done = ?,
            completed_at = ?, done_at = ?, updated_at = ?
        WHERE id = ?
      `).run(
        nextTitle,
        nextTitle,
        patch.description !== undefined ? patch.description?.trim() || null : current.description,
        nextStatus,
        patch.priority ?? current.priority ?? 'normal',
        patch.deadlineAt !== undefined ? patch.deadlineAt : current.deadlineAt,
        patch.assigneeId !== undefined ? patch.assigneeId : current.assigneeId,
        patch.syncState ?? current.syncState ?? 'local',
        nextStatus === 'done' ? 1 : 0,
        completedAt,
        completedAt,
        Date.now(),
        id
      )
      return (db.prepare(`${SELECT} WHERE id = ?`).get(id) as Row | undefined)
        ? rowToTask(db.prepare(`${SELECT} WHERE id = ?`).get(id) as Row)
        : null
    },
    softDelete(id) {
      const now = Date.now()
      db.prepare('UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL').run(now, now, id)
      const row = db.prepare(`${SELECT} WHERE id = ?`).get(id) as Row | undefined
      return row ? rowToTask(row) : null
    },
    link(input) {
      const now = Date.now()
      const info = db.prepare(`
        INSERT INTO task_links (task_id, target_type, target_id, label, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(input.taskId, input.targetType, input.targetId, input.label?.trim() || null, now)
      return db.prepare(`
        SELECT id, task_id as taskId, target_type as targetType, target_id as targetId,
               label, created_at as createdAt
        FROM task_links WHERE id = ?
      `).get(Number(info.lastInsertRowid)) as LinkRow
    },
    listLinks(taskId) {
      return db.prepare(`
        SELECT id, task_id as taskId, target_type as targetType, target_id as targetId,
               label, created_at as createdAt
        FROM task_links
        WHERE task_id = ?
        ORDER BY id ASC
      `).all(taskId) as LinkRow[]
    },
    add(projectPath, text) {
      return this.create({ projectPath, title: text, source: 'verstak' })
    },
    toggle(id, done) {
      this.update(id, { status: done ? 'done' : 'new' })
    },
    remove(id) {
      this.softDelete(id)
    },
    clearDone(projectPath) {
      const now = Date.now()
      const info = db.prepare(`
        UPDATE tasks
        SET deleted_at = ?, updated_at = ?
        WHERE project_path = ? AND deleted_at IS NULL AND (done = 1 OR status IN ('done', 'cancelled'))
      `).run(now, now, projectPath)
      return info.changes
    }
  }
}
