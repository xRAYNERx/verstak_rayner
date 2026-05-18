import { GoogleGenAI } from '@google/genai'
import type { ChatProvider, ChatMessage, ChatEvent, ToolDefinition, ToolResult } from './types'

interface GeminiOptions {
  apiKey: string
  model?: string
  sdk?: { models: { generateContentStream: (opts: unknown) => Promise<AsyncIterable<{ text?: string }>> } }
}

const MODELS = ['gemini-2.5-pro', 'gemini-2.5-flash']

export function createGeminiProvider(opts: GeminiOptions): ChatProvider {
  const model = opts.model ?? 'gemini-2.5-pro'
  const client = opts.sdk ?? new GoogleGenAI({ apiKey: opts.apiKey })

  return {
    id: 'gemini',
    name: 'Gemini',
    models: MODELS,

    async *send(messages: ChatMessage[], _tools: ToolDefinition[], _toolResults?: ToolResult[]): AsyncIterable<ChatEvent> {
      const contents = messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }))

      try {
        const stream = await client.models.generateContentStream({ model, contents })
        for await (const chunk of stream) {
          const text = (chunk as { text?: string }).text
          if (text) yield { type: 'text', text }
        }
        yield { type: 'done' }
      } catch (err) {
        yield { type: 'error', message: err instanceof Error ? err.message : String(err) }
      }
    }
  }
}
