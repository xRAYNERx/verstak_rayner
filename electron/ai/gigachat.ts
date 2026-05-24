/**
 * GigaChat provider — Сбер. 152-ФЗ совместим.
 *
 * Особенности:
 *  1. Двухступенчатая auth: clientId + clientSecret → OAuth → access_token.
 *     Token кэшируется module-level до expiresAt - 60s.
 *  2. SSL: Сбер использует свой CA (Russian Trusted Root CA), не в Node trust store.
 *     Обходим через https.Agent({ rejectUnauthorized: false }). V2 — бандлить cert.
 *  3. Chat API OpenAI-compatible (SSE streaming с `data: {...}` строками).
 *  4. Tools не поддерживаем — пропускаем тихо.
 *  5. 401 на chat → сброс кеша → один retry (race между cached token и server-side expire).
 *
 * Документация: https://developers.sber.ru/docs/ru/gigachat/api/reference/rest/post-chat
 */

import { randomUUID } from 'crypto'
import https from 'https'
import type { IncomingMessage } from 'http'
import { URL } from 'url'
import type { ChatProvider, ChatMessage, ChatEvent, ToolDefinition, ToolResult } from './types'

const OAUTH_URL = 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth'
const CHAT_URL  = 'https://gigachat.devices.sberbank.ru/api/v1/chat/completions'

export const GIGACHAT_MODELS = [
  'GigaChat',
  'GigaChat-Plus',
  'GigaChat-Pro',
  'GigaChat-Max'
]

const DEFAULT_MODEL = 'GigaChat'

// Module-level кеш токена. Между несколькими send() вызовами reuse.
let cachedToken: { value: string; expiresAt: number } | null = null

export interface GigaChatOptions {
  clientId: string
  clientSecret: string
  model?: string
}

/**
 * Сбрасывает кеш токена — для тестов и для 401 retry.
 */
export function resetGigaChatTokenCache(): void {
  cachedToken = null
}

interface OAuthResponse {
  access_token: string
  expires_at: number // unix epoch SECONDS
}

/**
 * Тонкая обёртка над https.request для запросов с insecure SSL.
 * Возвращает { statusCode, body } для one-shot (oauth), или IncomingMessage
 * для streaming (chat). Чтобы не тянуть undici.
 */
function httpsRequestRaw(
  url: string,
  options: https.RequestOptions,
  body?: string | Buffer
): Promise<{ statusCode: number; headers: Record<string, string | string[] | undefined>; body: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const req = https.request({
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: options.method ?? 'GET',
      headers: options.headers,
      // Sber CA не в Node trust store — без этого CERT_UNTRUSTED. V2: bundle cert.
      rejectUnauthorized: false
    }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode ?? 0,
          headers: res.headers as Record<string, string | string[] | undefined>,
          body: Buffer.concat(chunks).toString('utf8')
        })
      })
      res.on('error', reject)
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

/**
 * Получить access_token. Использует кеш module-level если token действителен
 * ещё минимум 60 секунд (буфер на сетевую задержку).
 */
export async function getAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const now = Date.now()
  if (cachedToken && cachedToken.expiresAt - now > 60_000) {
    return cachedToken.value
  }
  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const res = await httpsRequestRaw(
    OAUTH_URL,
    {
      method: 'POST',
      headers: {
        'RqUID': randomUUID(),
        'Authorization': `Basic ${creds}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      }
    },
    'scope=GIGACHAT_API_PERS'
  )
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(`GigaChat OAuth HTTP ${res.statusCode}: ${res.body.slice(0, 400)}`)
  }
  const parsed = JSON.parse(res.body) as OAuthResponse
  if (!parsed.access_token) {
    throw new Error('GigaChat OAuth: пустой access_token в ответе')
  }
  cachedToken = {
    value: parsed.access_token,
    // expires_at у Сбера в секундах. Конвертируем в миллисекунды.
    expiresAt: (parsed.expires_at ?? Math.floor(now / 1000) + 1800) * 1000
  }
  return cachedToken.value
}

/**
 * Streaming POST на /chat/completions — используем https.request напрямую,
 * парсим body как async iterable (line-by-line) и эмитим chunks.
 */
async function* chatStream(
  token: string,
  body: object,
  signal?: AbortSignal
): AsyncGenerator<string, void, void> {
  yield* streamLines(await openChatStream(token, body, signal))
}

function openChatStream(token: string, body: object, signal?: AbortSignal): Promise<IncomingMessage & { __status: number }> {
  return new Promise((resolve, reject) => {
    const u = new URL(CHAT_URL)
    const payload = JSON.stringify(body)
    const req = https.request({
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'Content-Length': Buffer.byteLength(payload).toString()
      },
      rejectUnauthorized: false
    }, (res) => {
      ;(res as any).__status = res.statusCode ?? 0
      resolve(res as IncomingMessage & { __status: number })
    })
    req.on('error', reject)
    if (signal) {
      const onAbort = () => req.destroy(new Error('aborted'))
      signal.addEventListener('abort', onAbort, { once: true })
    }
    req.write(payload)
    req.end()
  })
}

async function* streamLines(res: IncomingMessage & { __status: number }): AsyncGenerator<string, void, void> {
  if (res.__status === 401) {
    throw new GigaChatAuthError('401 Unauthorized — token expired or invalid')
  }
  if (res.__status < 200 || res.__status >= 300) {
    const body = await new Promise<string>(r => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer | string) => chunks.push(Buffer.from(c)))
      res.on('end', () => r(Buffer.concat(chunks).toString('utf8')))
    })
    throw new Error(`GigaChat chat HTTP ${res.__status}: ${body.slice(0, 400)}`)
  }
  res.setEncoding('utf8')
  let buf = ''
  for await (const chunk of res as AsyncIterable<string>) {
    buf += chunk
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      const t = line.trim()
      if (!t) continue
      yield t
    }
  }
  if (buf.trim()) yield buf.trim()
}

class GigaChatAuthError extends Error {}

interface ChatChunk {
  choices?: Array<{
    delta?: { content?: string }
    finish_reason?: string | null
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

export function createGigaChatProvider(opts: GigaChatOptions): ChatProvider {
  if (!opts.clientId || !opts.clientId.trim()) throw new Error('GigaChat: Client ID не задан')
  if (!opts.clientSecret || !opts.clientSecret.trim()) throw new Error('GigaChat: Client Secret не задан')

  const model = opts.model && opts.model.trim() ? opts.model : DEFAULT_MODEL

  return {
    id: 'gigachat',
    name: 'GigaChat',
    models: GIGACHAT_MODELS,

    async *send(
      messages: ChatMessage[],
      _tools: ToolDefinition[],
      _results?: ToolResult[]
    ): AsyncIterable<ChatEvent> {
      const body = {
        model,
        messages: messages
          .filter(m => m.role === 'system' || m.role === 'user' || m.role === 'assistant')
          .map(m => ({ role: m.role, content: m.content ?? '' })),
        stream: true,
        temperature: 0.7,
        max_tokens: 8000
      }

      let usageIn = 0
      let usageOut = 0
      let attemptedRetry = false

      async function* runOnce(): AsyncGenerator<ChatEvent, void, void> {
        const token = await getAccessToken(opts.clientId, opts.clientSecret)
        for await (const line of chatStream(token, body)) {
          if (!line.startsWith('data:')) continue
          const payload = line.slice(5).trim()
          if (payload === '[DONE]') break
          let chunk: ChatChunk
          try { chunk = JSON.parse(payload) } catch { continue }
          const delta = chunk.choices?.[0]?.delta?.content
          if (delta) yield { type: 'text', text: delta }
          if (chunk.usage) {
            usageIn = chunk.usage.prompt_tokens ?? usageIn
            usageOut = chunk.usage.completion_tokens ?? usageOut
          }
        }
      }

      try {
        try {
          yield* runOnce()
        } catch (err) {
          // 401 race condition: cached token expired server-side но ещё в кеше.
          // Сбрасываем + один retry. Любой другой error — пробрасываем.
          if (err instanceof GigaChatAuthError && !attemptedRetry) {
            attemptedRetry = true
            resetGigaChatTokenCache()
            yield* runOnce()
          } else {
            throw err
          }
        }
        if (usageIn > 0 || usageOut > 0) {
          yield { type: 'usage', usage: { inputTokens: usageIn, outputTokens: usageOut, model } }
        }
      } catch (err) {
        yield { type: 'error', message: `GigaChat: ${err instanceof Error ? err.message : String(err)}` }
      } finally {
        yield { type: 'done' }
      }
    }
  }
}
