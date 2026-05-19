import { GoogleGenAI } from '@google/genai'
import { randomUUID } from 'crypto'
import type { ChatProvider, ChatMessage, ChatEvent, ToolDefinition, ToolResult } from './types'

interface GeminiOptions {
  apiKey: string
  model?: string
  sdk?: { models: { generateContentStream: (opts: unknown) => Promise<AsyncIterable<unknown>> } }
}

const MODELS = ['gemini-2.5-pro', 'gemini-2.5-flash']

export function createGeminiProvider(opts: GeminiOptions): ChatProvider {
  const model = opts.model ?? 'gemini-2.5-pro'
  const client = opts.sdk ?? new GoogleGenAI({ apiKey: opts.apiKey })

  return {
    id: 'gemini',
    name: 'Gemini',
    models: MODELS,

    async *send(messages: ChatMessage[], tools: ToolDefinition[], _toolResults?: ToolResult[]): AsyncIterable<ChatEvent> {
      const contents = messages.map(m => {
        const parts: Array<Record<string, unknown>> = []
        if (m.content) parts.push({ text: m.content })
        if (m.attachments?.length) {
          for (const att of m.attachments) {
            parts.push({ inlineData: { mimeType: att.mimeType, data: att.data } })
          }
        }
        // Gemini requires at least one part per content block
        if (parts.length === 0) parts.push({ text: '' })
        return {
          role: m.role === 'assistant' ? 'model' : 'user',
          parts
        }
      })

      const config = tools.length > 0 ? {
        tools: [{ functionDeclarations: tools.map(t => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters as Record<string, unknown>
        })) }]
      } : undefined

      try {
        const stream = await client.models.generateContentStream(
          config ? { model, contents, config } : { model, contents }
        )
        for await (const chunk of stream) {
          const c = chunk as { text?: string; functionCalls?: Array<{ name: string; args: Record<string, unknown> }> }
          if (c.text) yield { type: 'text', text: c.text }
          if (c.functionCalls) {
            for (const fc of c.functionCalls) {
              yield { type: 'tool-call', call: { id: randomUUID(), name: fc.name, args: fc.args } }
            }
          }
        }
        yield { type: 'done' }
      } catch (err) {
        yield { type: 'error', message: err instanceof Error ? err.message : String(err) }
      }
    }
  }
}
