export interface FileNode { name: string; path: string; isDirectory: boolean; children?: FileNode[] }
export interface Attachment { name: string; mimeType: string; data: string; size: number }
export interface ChatMessage { role: 'user' | 'assistant' | 'system'; content: string; attachments?: Attachment[] }
export interface StoredChatMessage { id: number; role: 'user' | 'assistant' | 'system'; content: string; createdAt: number }
export interface Task { id: number; text: string; done: boolean; createdAt: number; doneAt: number | null }
export type JournalKind = 'manual' | 'session' | 'tool' | 'note'
export interface JournalEntry { id: number; kind: JournalKind; title: string; detail: string | null; createdAt: number }
export interface ToolCall { id: string; name: string; args: Record<string, unknown> }
export type ChatEvent =
  | { type: 'text'; text: string }
  | { type: 'pending-write'; callId: string; path: string; before: string; after: string }
  | { type: 'pending-command'; callId: string; command: string }
  | { type: 'command-result'; callId: string; command: string; status: 'ok' | 'error' | 'rejected'; exitCode?: number; stdout?: string; stderr?: string; error?: string }
  | { type: 'tool-blocked'; callId: string; name: string; command?: string; reason: string }
  | { type: 'done' }
  | { type: 'error'; message: string }

declare global {
  interface Window {
    api: {
      projects: {
        pick: () => Promise<string | null>
        setCurrent: (path: string | null) => Promise<void>
      }
      files: {
        tree: (root: string) => Promise<FileNode[]>
        read: (path: string) => Promise<string>
      }
      settings: {
        getKey: (key: string) => Promise<string | null>
        setKey: (key: string, value: string) => Promise<void>
      }
      ai: {
        send: (messages: ChatMessage[], projectPath: string | null) => Promise<number>
        resolveWrite: (callId: string, accept: boolean) => Promise<void>
        resolveCommand: (callId: string, accept: boolean) => Promise<void>
        stop: (sendId: number) => Promise<boolean>
        onEvent: (cb: (data: { id: number; event: ChatEvent }) => void) => () => void
      }
      chats: {
        list: (projectPath: string) => Promise<StoredChatMessage[]>
        append: (projectPath: string, role: 'user' | 'assistant', content: string) => Promise<void>
      }
      tasks: {
        list: (projectPath: string) => Promise<Task[]>
        add: (projectPath: string, text: string) => Promise<Task>
        toggle: (id: number, done: boolean) => Promise<void>
        remove: (id: number) => Promise<void>
        clearDone: (projectPath: string) => Promise<number>
      }
      journal: {
        list: (projectPath: string, limit?: number) => Promise<JournalEntry[]>
        append: (projectPath: string, kind: JournalKind, title: string, detail?: string | null) => Promise<JournalEntry>
        remove: (id: number) => Promise<void>
        clear: (projectPath: string) => Promise<number>
      }
      term: {
        spawn: (cwd: string) => Promise<number>
        write: (id: number, data: string) => Promise<void>
        resize: (id: number, cols: number, rows: number) => Promise<void>
        kill: (id: number) => Promise<void>
        onData: (cb: (data: { id: number; data: string }) => void) => () => void
        onExit: (cb: (data: { id: number }) => void) => () => void
      }
    }
  }
}
export {}
