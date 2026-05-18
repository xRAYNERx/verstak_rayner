export interface FileNode { name: string; path: string; isDirectory: boolean; children?: FileNode[] }
export interface ChatMessage { role: 'user' | 'assistant' | 'system'; content: string }
export type ChatEvent =
  | { type: 'text'; text: string }
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
        send: (messages: ChatMessage[]) => Promise<number>
        onEvent: (cb: (data: { id: number; event: ChatEvent }) => void) => () => void
      }
    }
  }
}
export {}
