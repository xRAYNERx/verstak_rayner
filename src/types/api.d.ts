export interface FileNode { name: string; path: string; isDirectory: boolean; children?: FileNode[] }
export interface ChatMessage { role: 'user' | 'assistant' | 'system'; content: string }
export interface StoredChatMessage { id: number; role: 'user' | 'assistant' | 'system'; content: string; createdAt: number }
export interface ToolCall { id: string; name: string; args: Record<string, unknown> }
export type ChatEvent =
  | { type: 'text'; text: string }
  | { type: 'tool-call'; call: ToolCall }
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
        onEvent: (cb: (data: { id: number; event: ChatEvent }) => void) => () => void
      }
      chats: {
        list: (projectPath: string) => Promise<StoredChatMessage[]>
        append: (projectPath: string, role: 'user' | 'assistant', content: string) => Promise<void>
      }
    }
  }
}
export {}
