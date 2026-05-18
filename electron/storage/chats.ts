import type { Database } from 'better-sqlite3'

export type Role = 'user' | 'assistant' | 'system'

export interface ChatMessage {
  id: number
  role: Role
  content: string
  createdAt: number
}

export interface Chats {
  list: (projectPath: string) => ChatMessage[]
  append: (projectPath: string, role: Role, content: string) => void
}

export function createChats(db: Database): Chats {
  return {
    list(projectPath) {
      const rows = db.prepare(
        'SELECT id, role, content, created_at as createdAt FROM chats WHERE project_path = ? ORDER BY id ASC'
      ).all(projectPath) as ChatMessage[]
      return rows
    },
    append(projectPath, role, content) {
      db.prepare(
        'INSERT INTO chats (project_path, role, content, created_at) VALUES (?, ?, ?, ?)'
      ).run(projectPath, role, content, Date.now())
    }
  }
}
