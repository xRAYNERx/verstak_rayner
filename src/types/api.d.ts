export interface FileNode { name: string; path: string; isDirectory: boolean; children?: FileNode[] }
export interface Attachment { name: string; mimeType: string; data: string; size: number }
export interface ChatMessage { role: 'user' | 'assistant' | 'system'; content: string; attachments?: Attachment[] }
export interface StoredChatMessage { id: number; role: 'user' | 'assistant' | 'system'; content: string; createdAt: number }
export interface ToolCall { id: string; name: string; args: Record<string, unknown> }
export type ChatEvent =
  | { type: 'text'; text: string }
  | { type: 'pending-write'; callId: string; path: string; before: string; after: string }
  | { type: 'done' }
  | { type: 'error'; message: string }

declare global {
  interface Window {
    api: {
      projects: { pick: () => Promise<string | null> }
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
        onEvent: (cb: (data: { id: number; event: ChatEvent }) => void) => () => void
      }
      chats: {
        list: (projectPath: string) => Promise<StoredChatMessage[]>
        append: (projectPath: string, role: 'user' | 'assistant', content: string) => Promise<void>
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
declare module '*.css'
export {}
