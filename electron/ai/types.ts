export type Role = 'user' | 'assistant' | 'system'

export interface Attachment {
  /** Display name (file name or auto-generated like "Скриншот 1.png") */
  name: string
  /** MIME type, e.g. "image/png", "application/pdf", "text/plain" */
  mimeType: string
  /** Base64-encoded raw bytes (without data:URL prefix) */
  data: string
  /** Decoded byte size, for UI display */
  size: number
}

export interface ChatMessage {
  role: Role
  content: string
  attachments?: Attachment[]
}

export interface ToolCall {
  id: string
  name: string
  args: Record<string, unknown>
}

export interface ToolResult {
  id: string
  result: unknown
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>  // JSON Schema
}

export type ChatEvent =
  | { type: 'text'; text: string }
  | { type: 'tool-call'; call: ToolCall }
  | { type: 'pending-write'; callId: string; path: string; before: string; after: string }
  | { type: 'done' }
  | { type: 'error'; message: string }

export interface ChatProvider {
  id: string
  name: string
  models: string[]
  send: (
    messages: ChatMessage[],
    tools: ToolDefinition[],
    toolResults?: ToolResult[]
  ) => AsyncIterable<ChatEvent>
}
