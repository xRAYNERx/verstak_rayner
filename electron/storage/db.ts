import Database from 'better-sqlite3'
import type { Database as DB } from 'better-sqlite3'

export function openDb(path: string): DB {
  const db = new Database(path)
  db.pragma('journal_mode = WAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_path TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chats_project ON chats(project_path, created_at);

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_path TEXT NOT NULL,
      title TEXT NOT NULL,
      provider_id TEXT,
      model TEXT,
      created_at INTEGER NOT NULL,
      last_message_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chat_sessions_project ON chat_sessions(project_path, last_message_at DESC);

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_path TEXT NOT NULL,
      text TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      done_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_path, done, created_at);

    CREATE TABLE IF NOT EXISTS journal (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_path TEXT NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      detail TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_journal_project ON journal(project_path, created_at);

    CREATE TABLE IF NOT EXISTS projects (
      path TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      last_opened_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS file_undo (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_path TEXT NOT NULL,
      file_path TEXT NOT NULL,
      before_content TEXT,
      after_content TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_undo_project ON file_undo(project_path, id);

    CREATE TABLE IF NOT EXISTS plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_path TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at INTEGER NOT NULL,
      completed_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_plans_project ON plans(project_path, id);

    CREATE TABLE IF NOT EXISTS plan_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id INTEGER NOT NULL,
      idx INTEGER NOT NULL,
      title TEXT NOT NULL,
      detail TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      result TEXT,
      FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_plan_steps_plan ON plan_steps(plan_id, idx);

    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_path TEXT,
      provider_id TEXT,
      rating INTEGER,
      message TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `)

  // Migrate chats → session-aware. Add session_id column if missing, then
  // backfill: for every project that has orphan chats, create a default
  // session and tag those rows. Idempotent.
  const chatCols = (db.prepare("PRAGMA table_info(chats)").all() as Array<{ name: string }>).map(c => c.name)
  if (!chatCols.includes('session_id')) {
    db.exec('ALTER TABLE chats ADD COLUMN session_id INTEGER')
  }
  const orphans = db.prepare(`
    SELECT DISTINCT project_path FROM chats WHERE session_id IS NULL
  `).all() as Array<{ project_path: string }>
  for (const { project_path } of orphans) {
    const now = Date.now()
    const info = db.prepare(
      'INSERT INTO chat_sessions (project_path, title, created_at, last_message_at) VALUES (?, ?, ?, ?)'
    ).run(project_path, 'Основной чат', now, now)
    db.prepare('UPDATE chats SET session_id = ? WHERE project_path = ? AND session_id IS NULL').run(
      info.lastInsertRowid, project_path
    )
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_chats_session ON chats(session_id, created_at)')

  return db
}
