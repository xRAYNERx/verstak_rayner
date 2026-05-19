import Anthropic from '@anthropic-ai/sdk'
import { randomUUID } from 'crypto'
import type { ChatProvider, ChatMessage, ChatEvent, ToolDefinition, ToolResult } from './types'

interface ClaudeOptions {
  apiKey: string
  model?: string
}

export const CLAUDE_MODELS = [
  'claude-opus-4-5-20251101',
  'claude-sonnet-4-5-20251101',
  'claude-haiku-4-5-20251101'
]

const DEFAULT_MODEL = CLAUDE_MODELS[1]

type AnyBlock = Record<string, unknown>

function buildContent(message: ChatMessage): string | AnyBlock[] {
  const blocks: AnyBlock[] = []
  if (message.content) blocks.push({ type: 'text', text: message.content })

  if (message.attachments?.length) {
    for (const att of message.attachments) {
      if (att.mimeType.startsWith('image/')) {
        blocks.push({ type: 'image', source: { type: 'base64', media_type: att.mimeType, data: att.data } })
      } else if (att.mimeType === 'application/pdf') {
        blocks.push({ type: 'document', source: { type: 'base64', media_type: att.mimeType, data: att.data } })
      }
    }
  }

  // Assistant turn with tool calls
  if (message.toolCalls?.length) {
    for (const call of message.toolCalls) {
      blocks.push({ type: 'tool_use', id: call.id, name: call.name, input: call.args })
    }
  }

  // User turn carrying tool results
  if (message.toolResults?.length) {
    for (const r of message.toolResults) {
      const content = r.error
        ? `Error: ${r.error}\n${typeof r.result === 'string' ? r.result : JSON.stringify(r.result).slice(0, 5000)}`
        : (typeof r.result === 'string' ? r.result : JSON.stringify(r.result).slice(0, 5000))
      blocks.push({
        type: 'tool_result',
        tool_use_id: r.id,
        content,
        ...(r.error ? { is_error: true } : {})
      })
    }
  }

  if (blocks.length === 0) return ''
  // If only one text block, send as a plain string (Anthropic accepts both)
  if (blocks.length === 1 && blocks[0].type === 'text') return blocks[0].text as string
  return blocks
}

export function createClaudeProvider(opts: ClaudeOptions): ChatProvider {
  const model = opts.model ?? DEFAULT_MODEL
  const client = new Anthropic({ apiKey: opts.apiKey })

  return {
    id: 'claude',
    name: 'Claude',
    models: CLAUDE_MODELS,

    async *send(messages: ChatMessage[], tools: ToolDefinition[], _results?: ToolResult[]): AsyncIterable<ChatEvent> {
      const systemMessages = messages.filter(m => m.role === 'system').map(m => m.content).filter(Boolean).join('\n\n')
      const conversation = messages
        .filter(m => m.role !== 'system')
        .map(m => ({
          role: (m.role === 'assistant' ? 'assistant' : 'user') as 'assistant' | 'user',
          content: buildContent(m)
        }))
        .filter(m => {
          const c = m.content
          return typeof c === 'string' ? c.length > 0 : c.length > 0
        })

      const apiTools = tools.length > 0
        ? tools.map(t => ({
            name: t.name,
            description: t.description,
            input_schema: t.parameters as Anthropic.Messages.Tool.InputSchema
          }))
        : undefined

      // Accumulators for in-progress tool_use blocks (Claude streams partial JSON)
      const activeToolUses: Record<number, { id: string; name: string; input: string }> = {}

      try {
        const stream = await client.messages.stream({
          model,
          max_tokens: 4096,
          system: systemMessages || undefined,
          messages: conversation as Anthropic.Messages.MessageParam[],
          ...(apiTools ? { tools: apiTools } : {})
        })

        let inputTokens = 0
        let outputTokens = 0
        let cachedInputTokens = 0
        for await (const event of stream) {
          if (event.type === 'message_start' && event.message?.usage) {
            inputTokens = event.message.usage.input_tokens ?? 0
            cachedInputTokens = (event.message.usage as { cache_read_input_tokens?: number }).cache_read_input_tokens ?? 0
          } else if (event.type === 'message_delta' && event.usage) {
            outputTokens = event.usage.output_tokens ?? 0
          } else if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
            activeToolUses[event.index] = {
              id: event.content_block.id ?? randomUUID(),
              name: event.content_block.name,
              input: ''
            }
          } else if (event.type === 'content_block_delta') {
            if (event.delta.type === 'text_delta') {
              yield { type: 'text', text: event.delta.text }
            } else if (event.delta.type === 'input_json_delta' && activeToolUses[event.index]) {
              activeToolUses[event.index].input += event.delta.partial_json
            }
          } else if (event.type === 'content_block_stop' && activeToolUses[event.index]) {
            const tu = activeToolUses[event.index]
            let args: Record<string, unknown> = {}
            try { args = tu.input ? JSON.parse(tu.input) : {} } catch { args = {} }
            yield { type: 'tool-call', call: { id: tu.id, name: tu.name, args } }
            delete activeToolUses[event.index]
          }
        }
        if (inputTokens || outputTokens) {
          yield { type: 'usage', usage: { inputTokens, outputTokens, cachedInputTokens, model } }
        }
        yield { type: 'done' }
      } catch (err) {
        yield { type: 'error', message: err instanceof Error ? err.message : String(err) }
      }
    }
  }
}
