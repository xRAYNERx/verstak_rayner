import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createYandexWordstatConnector } from '../../electron/connectors/yandex-wordstat'

const ctx = {
  getSecret: (k: string) => (k === 'yandex_wordstat_token' ? 'tok' : null),
  signal: new AbortController().signal
}
const ctxDirectFallback = {
  getSecret: (k: string) => (k === 'yandex_direct_token' ? 'dir' : null),
  signal: new AbortController().signal
}
const noCred = { getSecret: (_: string) => null, signal: new AbortController().signal }

// Live v4 — один URL, ветвление по body.method. Мок отвечает по методу.
function mockByMethod(handler: (method: string) => { ok?: boolean; status?: number; body: unknown }) {
  vi.stubGlobal('fetch', vi.fn(async (_url: string, opts: any) => {
    const method = JSON.parse(opts.body).method as string
    const r = handler(method)
    return { ok: r.ok ?? true, status: r.status ?? 200, text: async () => JSON.stringify(r.body) }
  }) as unknown as typeof fetch)
}

beforeEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('Yandex.Wordstat connector', () => {
  it('info() корректен', () => {
    expect(createYandexWordstatConnector().info().id).toBe('yandex_wordstat')
  })

  it('без токена — no-token', async () => {
    const r = await createYandexWordstatConnector().query({ op: 'get_wordstat', phrases: ['x'] }, noCred) as { error: string }
    expect(r.error).toBe('no-token')
  })

  it('fallback на yandex_direct_token работает', async () => {
    mockByMethod(m => {
      if (m === 'CreateNewWordstatReport') return { body: { data: 1 } }
      if (m === 'GetWordstatReportList') return { body: { data: [{ ReportID: 1, StatusReport: 'Done' }] } }
      if (m === 'GetWordstatReport') return { body: { data: [{ Phrase: 'диван', SearchedWith: [{ Phrase: 'диван', Shows: 100 }] }] } }
      return { body: { data: 1 } }
    })
    const r = await createYandexWordstatConnector().query({ op: 'get_wordstat', phrases: ['диван'] }, ctxDirectFallback) as { count: number }
    expect(r.count).toBe(1)
  })

  it('unknown op', async () => {
    const r = await createYandexWordstatConnector().query({ op: 'foo' }, ctx) as { error: string }
    expect(r.error).toBe('unknown-op')
  })

  it('get_wordstat без phrases — bad-args', async () => {
    const r = await createYandexWordstatConnector().query({ op: 'get_wordstat' }, ctx) as { error: string }
    expect(r.error).toBe('bad-args')
  })

  it('полный цикл: create → poll(Done) → get → разбор', async () => {
    mockByMethod(m => {
      if (m === 'CreateNewWordstatReport') return { body: { data: 42 } }
      if (m === 'GetWordstatReportList') return { body: { data: [{ ReportID: 42, StatusReport: 'Done' }] } }
      if (m === 'GetWordstatReport') return {
        body: { data: [{
          Phrase: 'купить диван',
          SearchedWith: [{ Phrase: 'купить диван', Shows: 5400 }, { Phrase: 'купить диван москва', Shows: 800 }],
          SearchedAlso: [{ Phrase: 'диван недорого', Shows: 1200 }]
        }] }
      }
      return { body: { data: 1 } } // DeleteWordstatReport
    })
    const r = await createYandexWordstatConnector().query({ op: 'get_wordstat', phrases: ['купить диван'], geo_id: [213] }, ctx) as {
      count: number; results: Array<{ phrase: string; searched_with: Array<{ phrase: string; shows: number }> }>
    }
    expect(r.count).toBe(1)
    expect(r.results[0].phrase).toBe('купить диван')
    expect(r.results[0].searched_with[0].shows).toBe(5400)
  })

  it('API-ошибка (error_code) пробрасывается', async () => {
    mockByMethod(() => ({ body: { error_code: 53, error_str: 'Token недействителен' } }))
    const r = await createYandexWordstatConnector().query({ op: 'get_wordstat', phrases: ['x'] }, ctx) as { error: string; message: string }
    expect(r.error).toBe('request-failed')
    expect(r.message).toContain('53')
  })
})
