import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import type { Database } from 'better-sqlite3'
import { openDb } from '../../electron/storage/db'
import { createChats } from '../../electron/storage/chats'

describe('chats', () => {
  let dir: string
  let db: Database | undefined

  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'gg-')) })
  afterEach(() => {
    db?.close()
    db = undefined
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns empty list for new project', () => {
    db = openDb(join(dir, 't.db'))
    const chats = createChats(db)
    expect(chats.list('/my/project')).toEqual([])
  })

  it('appends and lists in order', () => {
    db = openDb(join(dir, 't.db'))
    const chats = createChats(db)
    chats.append('/my/project', 'user', 'hello')
    chats.append('/my/project', 'assistant', 'hi back')
    const list = chats.list('/my/project')
    expect(list.map(m => [m.role, m.content])).toEqual([['user', 'hello'], ['assistant', 'hi back']])
  })

  it('isolates messages per project', () => {
    db = openDb(join(dir, 't.db'))
    const chats = createChats(db)
    chats.append('/a', 'user', 'msg-a')
    chats.append('/b', 'user', 'msg-b')
    expect(chats.list('/a')).toHaveLength(1)
    expect(chats.list('/b')).toHaveLength(1)
  })
})
