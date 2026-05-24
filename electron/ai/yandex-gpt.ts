/**
 * YandexGPT provider — Yandex Cloud Foundation Models.
 *
 * Особенности vs OpenAI/Anthropic:
 *  1. modelUri составляется как `gpt://${folderId}/${model}` — folderId
 *     обязателен и идёт отдельно от API ключа.
 *  2. Streaming формат — NDJSON (newline-delimited JSON), не SSE. Каждая
 *     строка — отдельный JSON-объект с ПОЛНЫМ накопленным текстом ответа.
 *     Дельту вычисляем сами (slice от prevText).
 *  3. Tools не поддерживаются нативно — если в запросе есть, игнорируем
 *     (НЕ передаём, НЕ бросаем ошибку).
 *  4. maxTokens передаётся как строка ('8000'), не number — особенность API.
 *
 * Документация: https://yandex.cloud/ru/docs/foundation-models/text-generation/api-ref/TextGeneration/completion
 */

import type { ChatProvider, ChatMessage, ChatEvent, ToolDefinition, ToolResult } from './types'

const COMPLETION_STREAM_URL =
  'https://llm.api.cloud.yandex.net/foundationModels/v1/completionStream'

export const YANDEX_GPT_MODELS = [
  'yandexgpt/latest',
  'yandexgpt-lite/latest',
  'yandexgpt-32k/latest'
]

export const YANDEX_GPT_MODEL_LABELS: Record<string, string> = {
  'yandexgpt/latest':      'YandexGPT Pro',
  'yandexgpt-lite/latest': 'YandexGPT Lite',
  'yandexgpt-32k/latest':  'YandexGPT Pro 32K'
}

const DEFAULT_MODEL = 'yandexgpt/latest'

export interface YandexGptOptions {
  apiKey: string
  folderId: string
  model?: string
}

interface YandexChunk {
  result?: {
    alternatives?: Array<{
      message?: { text?: string; role?: string }
      status?: string
    }>
    usage?: {
      inputTextTokens?: string
      completionTokens?: string
      totalTokens?: string
    }
  }
}

/**
 * Преобразует наши ChatMessage в формат Yandex: system-сообщения
 * объединяются в один, остальные идут как user/assistant.
 * Tool-результаты пропускаются (Yandex не поддерживает).
 */
export function buildYandexMessages(
  messages: ChatMessage[]
): Array<{ role: 'system' | 'user' | 'assistant'; text: string }> {
  const systemParts: string[] = []
  const rest: Array<{ role: 'user' | 'assistant'; text: string }> = []
  for (const m of messages) {
    if (m.role === 'system') {
      if (m.content) systemParts.push(m.content)
    } else if (m.role === 'user' || m.role === 'assistant') {
      // Не передаём tool-результаты — Yandex про них не знает
      rest.push({ role: m.role, text: m.content ?? '' })
    }
  }
  const out: Array<{ role: 'system' | 'user' | 'assistant'; text: string }> = []
  if (systemParts.length > 0) {
    out.push({ role: 'system', text: systemParts.join('\n\n') })
  }
  out.push(...rest)
  return out
}

/**
 * Строит modelUri из folder и model. Экспортирован для тестов.
 */
export function buildModelUri(folderId: string, model: string): string {
  return `gpt://${folderId}/${model}`
}

export function createYandexGptProvider(opts: YandexGptOptions): ChatProvider {
  if (!opts.folderId || !opts.folderId.trim()) {
    throw new Error('YandexGPT: Folder ID не задан (Settings → Провайдеры → YandexGPT)')
  }
  if (!opts.apiKey || !opts.apiKey.trim()) {
    throw new Error('YandexGPT: API ключ не задан')
  }

  const model = opts.model && opts.model.trim() ? opts.model : DEFAULT_MODEL

  return {
    id: 'yandex-gpt',
    name: 'YandexGPT',
    models: YANDEX_GPT_MODELS,

    async *send(
      messages: ChatMessage[],
      _tools: ToolDefinition[],
      _results?: ToolResult[]
    ): AsyncIterable<ChatEvent> {
      // tools игнорируем — Yandex не поддерживает function-calling в API,
      // совместимом с нашим dispatcher'ом. Тихо пропускаем, как договорились в ТЗ.

      const yandexMessages = buildYandexMessages(messages)
      const body = {
        modelUri: buildModelUri(opts.folderId, model),
        completionOptions: {
          stream: true,
          temperature: 0.6,
          maxTokens: '8000' // ВАЖНО: строка, не number — особенность Yandex API
        },
        messages: yandexMessages
      }

      let usageInput = 0
      let usageOutput = 0
      let modelName = model

      try {
        const response = await fetch(COMPLETION_STREAM_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Api-Key ${opts.apiKey}`,
            'x-folder-id': opts.folderId,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        })

        if (!response.ok) {
          const errText = await response.text().catch(() => '')
          yield {
            type: 'error',
            message: `YandexGPT HTTP ${response.status}: ${errText.slice(0, 400) || response.statusText}`
          }
          return
        }
        if (!response.body) {
          yield { type: 'error', message: 'YandexGPT: пустой response body (streaming недоступен)' }
          return
        }

        // NDJSON парсер: каждая строка — отдельный JSON.
        const reader = response.body.getReader()
        const decoder = new TextDecoder('utf-8')
        let buf = ''
        let prevText = '' // ПОЛНЫЙ накопленный текст из предыдущего chunk'а

        const processChunk = (chunk: YandexChunk): { text?: string } => {
          const alt = chunk.result?.alternatives?.[0]
          const fullText = alt?.message?.text ?? ''
          // Yandex возвращает накопленный текст; вычитаем prevText чтобы получить дельту
          const delta = fullText.length > prevText.length ? fullText.slice(prevText.length) : ''
          if (delta) prevText = fullText
          // Usage всегда в последних chunk'ах
          if (chunk.result?.usage) {
            const u = chunk.result.usage
            usageInput = parseInt(u.inputTextTokens ?? '0', 10) || 0
            usageOutput = parseInt(u.completionTokens ?? '0', 10) || 0
          }
          return { text: delta }
        }

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop() ?? ''
          for (const line of lines) {
            const t = line.trim()
            if (!t) continue
            try {
              const { text } = processChunk(JSON.parse(t) as YandexChunk)
              if (text) yield { type: 'text', text }
            } catch { /* битый chunk — пропускаем */ }
          }
        }
        // Хвост буфера
        if (buf.trim()) {
          try {
            const { text } = processChunk(JSON.parse(buf) as YandexChunk)
            if (text) yield { type: 'text', text }
          } catch { /* skip */ }
        }

        if (usageInput > 0 || usageOutput > 0) {
          yield {
            type: 'usage',
            usage: {
              inputTokens: usageInput,
              outputTokens: usageOutput,
              model: modelName
            }
          }
        }
      } catch (err) {
        yield {
          type: 'error',
          message: `YandexGPT: ${err instanceof Error ? err.message : String(err)}`
        }
      } finally {
        yield { type: 'done' }
      }
    }
  }
}
