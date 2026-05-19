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
  /** Tool calls emitted by the assistant (only set on assistant messages). */
  toolCalls?: ToolCall[]
  /** Tool results being fed back to the assistant (only set on user messages
   *  that exist to carry these results — content may be empty). */
  toolResults?: ToolResult[]
}

export interface ToolCall {
  id: string
  name: string
  args: Record<string, unknown>
}

export interface ToolResult {
  id: string
  /** Tool call name (some providers — Claude — don't require it, others — Gemini — do). */
  name: string
  /** Whatever the tool returned; will be JSON-stringified before sending. */
  result: unknown
  /** If the tool failed, the error message. When set, `result` is the error context. */
  error?: string
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>  // JSON Schema
}

export interface UsageDelta {
  /** Tokens in the prompt for this turn */
  inputTokens?: number
  /** Tokens produced by the model in this turn */
  outputTokens?: number
  /** Tokens already cached on the provider side (Anthropic / OpenAI) */
  cachedInputTokens?: number
  /** Model that produced the usage, helps cost lookup */
  model?: string
}

export type ChatEvent =
  | { type: 'text'; text: string }
  | { type: 'tool-call'; call: ToolCall }
  | { type: 'pending-write'; callId: string; path: string; before: string; after: string }
  | { type: 'pending-command'; callId: string; command: string }
  | { type: 'command-result'; callId: string; command: string; status: 'ok' | 'error' | 'rejected'; exitCode?: number; stdout?: string; stderr?: string; error?: string }
  | { type: 'tool-blocked'; callId: string; name: string; command?: string; reason: string }
  | { type: 'plan-created'; planId: number; title: string; stepCount: number }
  | { type: 'usage'; usage: UsageDelta }
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
