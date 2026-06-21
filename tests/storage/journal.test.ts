import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { openDb } from '../../electron/storage/db'
import { createJournal } from '../../electron/storage/journal'
import type { Database } from 'better-sqlite3'

describe('journal session summaries', () => {
  let dir: string
  let db: Database | null = null

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gg-journal-'))
    vi.useFakeTimers()
  })

  afterEach(() => {
    db?.close()
    db = null
    vi.useRealTimers()
    rmSync(dir, { recursive: true, force: true })
  })

  it('creates a detailed summary from the real chat dialog', () => {
    vi.setSystemTime(new Date('2026-06-21T09:15:00'))
    db = openDb(join(dir, 'test.db'))
    const journal = createJournal(db)
    insertChat('client-a', 'user', 'Что нужно добавить в программу, а что убрать?')
    insertChat('client-a', 'assistant', 'Добавить стоит журнал решений, настройки автообновления и понятные статусы. Убрать можно лишние всплывающие окна и дубли в панели.')
    journal.append('client-a', 'tool', 'Изменён файл src/App.tsx', 'Обновлена страница журнала')

    vi.setSystemTime(new Date('2026-06-21T11:42:00'))
    const summaries = journal.flushSessionSummaries('close')

    expect(summaries).toHaveLength(1)
    expect(summaries[0].kind).toBe('session')
    expect(summaries[0].title).toContain('Сводка сессии')
    expect(summaries[0].detail).toContain('Что спрашивал пользователь:')
    expect(summaries[0].detail).toContain('Что нужно добавить в программу, а что убрать?')
    expect(summaries[0].detail).toContain('Что было предложено или отвечено:')
    expect(summaries[0].detail).toContain('Добавить стоит журнал решений')
    expect(summaries[0].detail).toContain('Изменено:')
  })

  it('hides legacy session fragments from the journal list', () => {
    vi.setSystemTime(new Date('2026-06-21T09:15:00'))
    db = openDb(join(dir, 'test.db'))
    const journal = createJournal(db)

    journal.append('client-a', 'session', 'Что добавить?', 'Старый обрывок')
    journal.append('client-a', 'manual', 'Ручная заметка', null)

    const entries = journal.list('client-a')
    expect(entries).toHaveLength(1)
    expect(entries[0].title).toBe('Ручная заметка')
  })

  it('creates a summary for a chat-only session without raw journal events', () => {
    vi.setSystemTime(new Date('2026-06-21T12:00:00'))
    db = openDb(join(dir, 'test.db'))
    const journal = createJournal(db)
    insertChat('client-a', 'user', 'Какие функции в Запрете лишние?')
    insertChat('client-a', 'assistant', 'Лишними выглядят дублирующие настройки, повторные подсказки и отдельные всплывающие окна без действия.')

    vi.setSystemTime(new Date('2026-06-21T12:30:00'))
    const summaries = journal.flushSessionSummaries('close')

    expect(summaries).toHaveLength(1)
    expect(summaries[0].detail).toContain('Какие функции в Запрете лишние?')
    expect(summaries[0].detail).toContain('Лишними выглядят')
  })

  it('rolls the active journal window over at local midnight', () => {
    vi.setSystemTime(new Date('2026-06-21T23:50:00'))
    db = openDb(join(dir, 'test.db'))
    const journal = createJournal(db)

    insertChat('client-a', 'user', 'Подготовь дневной отчёт по клиенту.')
    journal.append('client-a', 'tool', 'Создан файл report.md', 'Черновик отчёта')

    vi.setSystemTime(new Date('2026-06-22T00:01:00'))
    const daySummaries = journal.flushDailyRollovers()
    insertChat('client-a', 'user', 'Продолжим новый день.')
    journal.append('client-a', 'tool', 'Изменён файл report.md', 'Новая дневная сессия')
    const closeSummaries = journal.flushSessionSummaries('close')

    expect(daySummaries).toHaveLength(1)
    expect(daySummaries[0].title).toBe('Сводка дня · 21.06.2026')
    expect(daySummaries[0].detail).toContain('Подготовь дневной отчёт')
    expect(closeSummaries).toHaveLength(1)
    expect(closeSummaries[0].title).toContain('22.06.2026')
    expect(closeSummaries[0].detail).toContain('Продолжим новый день')
  })

  function insertChat(projectPath: string, role: 'user' | 'assistant', content: string): void {
    db!.prepare(
      'INSERT INTO chats (project_path, role, content, created_at) VALUES (?, ?, ?, ?)'
    ).run(projectPath, role, content, Date.now())
  }
})
