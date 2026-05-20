import { GoogleGenAI } from '@google/genai'
import { randomUUID } from 'crypto'
import type { ChatProvider, ChatMessage, ChatEvent, ToolDefinition, ToolResult } from './types'

interface GeminiOptions {
  apiKey: string
  model?: string
  sdk?: { models: { generateContentStream: (opts: unknown) => Promise<AsyncIterable<unknown>> } }
}

const MODELS = ['gemini-3.5-flash', 'gemini-3-pro', 'gemini-3-flash', 'gemini-2.5-pro', 'gemini-2.5-flash']

function partsForMessage(m: ChatMessage): Array<Record<string, unknown>> {
  const parts: Array<Record<string, unknown>> = []
  if (m.content) parts.push({ text: m.content })
  if (m.attachments?.length) {
    for (const att of m.attachments) {
      parts.push({ inlineData: { mimeType: att.mimeType, data: att.data } })
    }
  }
  // Assistant message that includes tool calls — pack each as functionCall part
  if (m.toolCalls?.length) {
    for (const call of m.toolCalls) {
      parts.push({ functionCall: { name: call.name, args: call.args } })
    }
  }
  // User message carrying tool results — pack each as functionResponse part
  if (m.toolResults?.length) {
    for (const r of m.toolResults) {
      parts.push({
        functionResponse: {
          name: r.name,
          response: r.error
            ? { error: r.error, result: r.result }
            : { result: r.result }
        }
      })
    }
  }
  if (parts.length === 0) parts.push({ text: '' })
  return parts
}

export function createGeminiProvider(opts: GeminiOptions): ChatProvider {
  const model = opts.model ?? 'gemini-3.5-flash'
  const client = opts.sdk ?? new GoogleGenAI({ apiKey: opts.apiKey })

  return {
    id: 'gemini',
    name: 'Gemini',
    models: MODELS,

    async *send(messages: ChatMessage[], tools: ToolDefinition[], _toolResults?: ToolResult[]): AsyncIterable<ChatEvent> {
      // Extract system messages — Gemini wants them in `config.systemInstruction`,
      // not as a user turn. Mixing system content into user turns wastes the
      // prompt cache and confuses multi-turn role alternation.
      const systemTexts: string[] = []
      const nonSystem: ChatMessage[] = []
      for (const m of messages) {
        if (m.role === 'system') {
          if (m.content) systemTexts.push(m.content)
        } else {
          nonSystem.push(m)
        }
      }
      const contents = nonSystem.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: partsForMessage(m)
      }))

      const config: Record<string, unknown> = {}
      if (tools.length > 0) {
        config.tools = [{ functionDeclarations: tools.map(t => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters as Record<string, unknown>
        })) }]
      }
      if (systemTexts.length > 0) {
        config.systemInstruction = { parts: [{ text: systemTexts.join('\n\n') }] }
      }
      const hasConfig = Object.keys(config).length > 0

      try {
        const stream = await client.models.generateContentStream(
          hasConfig ? { model, contents, config } : { model, contents }
        )
        let lastUsage: { prompt?: number; output?: number; cached?: number } = {}
        for await (const chunk of stream) {
          const c = chunk as {
            text?: string
            functionCalls?: Array<{ name: string; args: Record<string, unknown> }>
            usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; cachedContentTokenCount?: number }
          }
          if (c.text) yield { type: 'text', text: c.text }
          if (c.functionCalls) {
            for (const fc of c.functionCalls) {
              yield { type: 'tool-call', call: { id: randomUUID(), name: fc.name, args: fc.args } }
            }
          }
          if (c.usageMetadata) {
            lastUsage = {
              prompt: c.usageMetadata.promptTokenCount,
              output: c.usageMetadata.candidatesTokenCount,
              cached: c.usageMetadata.cachedContentTokenCount
            }
          }
        }
        if (lastUsage.prompt !== undefined || lastUsage.output !== undefined) {
          yield {
            type: 'usage',
            usage: { inputTokens: lastUsage.prompt, outputTokens: lastUsage.output, cachedInputTokens: lastUsage.cached, model }
          }
        }
        yield { type: 'done' }
      } catch (err) {
        yield { type: 'error', message: err instanceof Error ? err.message : String(err) }
      }
    }
  }
}
