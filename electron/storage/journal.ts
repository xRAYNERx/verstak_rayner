import type { Database } from 'better-sqlite3'

export type JournalKind = 'manual' | 'session' | 'tool' | 'note'

export interface JournalEntry {
  id: number
  kind: JournalKind
  title: string
  detail: string | null
  createdAt: number
}

export interface Journal {
  list: (projectPath: string, limit?: number) => JournalEntry[]
  append: (projectPath: string, kind: JournalKind, title: string, detail?: string | null) => JournalEntry
  flushSessionSummaries: (reason?: 'close' | 'day', now?: number) => JournalEntry[]
  flushDailyRollovers: (now?: number) => JournalEntry[]
  updateManual: (id: number, title: string, detail?: string | null) => JournalEntry | null
  remove: (id: number) => void
  clear: (projectPath: string) => number
}

interface Row {
  id: number
  kind: JournalKind
  title: string
  detail: string | null
  createdAt: number
}

interface ChatRow {
  role: 'user' | 'assistant' | string
  content: string
  createdAt: number
}

export function createJournal(db: Database): Journal {
  const appSessionStart = Date.now()
  const activeSinceByProject = new Map<string, number>()

  const insertEntry = (projectPath: string, kind: JournalKind, title: string, detail: string | null, createdAt: number): JournalEntry => {
    const info = db.prepare(
      'INSERT INTO journal (project_path, kind, title, detail, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(projectPath, kind, title, detail, createdAt)
    return { id: Number(info.lastInsertRowid), kind, title, detail, createdAt }
  }

  const ensureActive = (projectPath: string, now: number) => {
    if (!activeSinceByProject.has(projectPath)) {
      activeSinceByProject.set(projectPath, Math.max(appSessionStart, startOfLocalDay(now)))
    }
  }

  const seedActiveProjectsFromChats = (now: number) => {
    const rows = db.prepare(`
      SELECT project_path as projectPath, MIN(created_at) as firstAt
      FROM chats
      WHERE created_at >= ?
        AND created_at <= ?
      GROUP BY project_path
    `).all(appSessionStart, now) as Array<{ projectPath: string; firstAt: number }>
    for (const row of rows) {
      if (!activeSinceByProject.has(row.projectPath)) {
        activeSinceByProject.set(row.projectPath, Math.max(appSessionStart, startOfLocalDay(row.firstAt)))
      }
    }
  }

  const isSummaryTitle = (title: string) => title.startsWith('Сводка сессии') || title.startsWith('Сводка дня')
  const isLegacySessionTitle = (title: string) => !isSummaryTitle(title)

  const flushProjectWindow = (projectPath: string, start: number, end: number, reason: 'close' | 'day'): JournalEntry | null => {
    if (end <= start) return null
    const events = db.prepare(`
      SELECT id, kind, title, detail, created_at as createdAt
      FROM journal
      WHERE project_path = ?
        AND created_at >= ?
        AND created_at <= ?
        AND kind != 'session'
      ORDER BY id ASC
    `).all(projectPath, start, end) as Row[]
    const messages = db.prepare(`
      SELECT role, content, created_at as createdAt
      FROM chats
      WHERE project_path = ?
        AND created_at >= ?
        AND created_at <= ?
        AND role IN ('user', 'assistant')
      ORDER BY id ASC
    `).all(projectPath, start, end) as ChatRow[]
    if (events.length === 0 && messages.length === 0) return null

    const title = reason === 'day'
      ? `Сводка дня · ${formatDate(start)}`
      : `Сводка сессии · ${formatDate(start)} ${formatClock(start)}-${formatClock(end)}`

    const exists = db.prepare(
      'SELECT id FROM journal WHERE project_path = ? AND kind = ? AND title = ? LIMIT 1'
    ).get(projectPath, 'session', title) as { id: number } | undefined
    if (exists) return null

    return insertEntry(projectPath, 'session', title, buildSummaryDetail(messages, events, start, end, reason), end)
  }

  const flushProjectRollover = (projectPath: string, now: number): JournalEntry[] => {
    const start = activeSinceByProject.get(projectPath)
    if (!start) return []
    const todayStart = startOfLocalDay(now)
    if (start >= todayStart) return []
    const flushed = flushProjectWindow(projectPath, start, todayStart - 1, 'day')
    activeSinceByProject.set(projectPath, todayStart)
    return flushed ? [flushed] : []
  }

  return {
    list(projectPath, limit = 200) {
      const rows = db.prepare(`
        SELECT id, kind, title, detail, created_at as createdAt
        FROM journal
        WHERE project_path = ?
          AND (
            kind = 'manual'
            OR (kind = 'session' AND (title LIKE 'Сводка сессии%' OR title LIKE 'Сводка дня%'))
          )
        ORDER BY id DESC
        LIMIT ?
      `).all(projectPath, limit) as Row[]
      return rows
    },
    append(projectPath, kind, title, detail = null) {
      const now = Date.now()
      ensureActive(projectPath, now)
      flushProjectRollover(projectPath, now)
      if (kind === 'session' && isLegacySessionTitle(title)) {
        return { id: 0, kind, title, detail, createdAt: now }
      }
      return insertEntry(projectPath, kind, title, detail, now)
    },
    flushSessionSummaries(reason = 'close', now = Date.now()) {
      seedActiveProjectsFromChats(now)
      const created: JournalEntry[] = []
      for (const [projectPath, start] of activeSinceByProject) {
        const flushed = flushProjectWindow(projectPath, start, now, reason)
        if (flushed) created.push(flushed)
        activeSinceByProject.set(projectPath, now)
      }
      return created
    },
    flushDailyRollovers(now = Date.now()) {
      seedActiveProjectsFromChats(now)
      const created: JournalEntry[] = []
      for (const projectPath of activeSinceByProject.keys()) {
        created.push(...flushProjectRollover(projectPath, now))
      }
      return created
    },
    updateManual(id, title, detail = null) {
      const row = db.prepare(
        'SELECT id, kind, title, detail, created_at as createdAt FROM journal WHERE id = ?'
      ).get(id) as Row | undefined
      if (!row || row.kind !== 'manual') return null
      db.prepare('UPDATE journal SET title = ?, detail = ? WHERE id = ? AND kind = ?')
        .run(title, detail, id, 'manual')
      return { ...row, title, detail }
    },
    remove(id) {
      db.prepare('DELETE FROM journal WHERE id = ?').run(id)
    },
    clear(projectPath) {
      const info = db.prepare('DELETE FROM journal WHERE project_path = ?').run(projectPath)
      return info.changes
    }
  }
}

function startOfLocalDay(ts: number): number {
  const d = new Date(ts)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`
}

function formatClock(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function buildSummaryDetail(messages: ChatRow[], rows: Row[], start: number, end: number, reason: 'close' | 'day'): string {
  const changed: string[] = []
  const added: string[] = []
  const removed: string[] = []
  const commands: string[] = []
  const notes: string[] = []
  const errors: string[] = []
  const done: string[] = []
  const userQuestions: string[] = []
  const assistantAnswers: string[] = []

  for (const message of messages) {
    const text = compactMessage(message.content)
    if (!text) continue
    if (message.role === 'user') {
      pushUnique(userQuestions, text)
    } else if (message.role === 'assistant') {
      pushUnique(assistantAnswers, text)
    }
  }

  for (const row of rows) {
    const text = compactLine(`${row.title}${row.detail ? `: ${row.detail}` : ''}`)
    const lower = text.toLowerCase()
    if (/(ошиб|error|failed|fail|упал|не удалось)/i.test(text)) {
      pushUnique(errors, text)
      continue
    }
    if (/(удал|remove|delete|deleted)/i.test(text)) {
      pushUnique(removed, text)
      continue
    }
    if (/(создан|создал|добав|add|added|create|created)/i.test(text)) {
      pushUnique(added, text)
      continue
    }
    if (/(измен|обнов|правк|edit|change|changed|update|updated|write|patch)/i.test(text)) {
      pushUnique(changed, text)
      continue
    }
    if (row.kind === 'tool' || lower.includes('команд') || lower.includes('command')) {
      pushUnique(commands, text)
      continue
    }
    if (row.kind === 'manual' || row.kind === 'note') {
      pushUnique(notes, text)
      continue
    }
    pushUnique(done, text)
  }

  const lines = [
    `Период: ${formatDate(start)} ${formatClock(start)}-${formatClock(end)}`,
    `Тип: ${reason === 'day' ? 'итоги дня' : 'итоги сессии'}`,
    `Диалог: ${messages.filter(m => m.role === 'user').length} пользовательских сообщений, ${messages.filter(m => m.role === 'assistant').length} ответов AI`,
    `Технических событий: ${rows.length}`
  ]

  appendSection(lines, 'Что спрашивал пользователь', userQuestions, 10)
  appendSection(lines, 'Что было предложено или отвечено', assistantAnswers, 10)
  appendSection(lines, 'Сделано', done)
  appendSection(lines, 'Добавлено/создано', added)
  appendSection(lines, 'Изменено', changed)
  appendSection(lines, 'Удалено', removed)
  appendSection(lines, 'Команды и инструменты', commands)
  appendSection(lines, 'Заметки', notes)
  appendSection(lines, 'Ошибки/важное', errors)

  if (lines.length === 4) {
    appendSection(lines, 'События', rows.map(row => compactLine(row.title)))
  }

  return lines.join('\n')
}

function appendSection(lines: string[], title: string, values: string[], limit = 8): void {
  if (values.length === 0) return
  lines.push('', `${title}:`)
  for (const value of values.slice(0, limit)) lines.push(`- ${value}`)
  if (values.length > limit) lines.push(`- ...и ещё ${values.length - limit}`)
}

function pushUnique(values: string[], value: string): void {
  if (!value || values.includes(value)) return
  values.push(value)
}

function compactLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 240)
}

function compactMessage(value: string): string {
  const clean = value
    .replace(/\[Вложение:[^\]]+\]/g, '')
    .replace(/```[\s\S]*?```/g, '[фрагмент кода]')
    .replace(/\s+/g, ' ')
    .trim()
  if (!clean) return ''
  return clean.length > 900 ? `${clean.slice(0, 900).trim()}...` : clean
}
