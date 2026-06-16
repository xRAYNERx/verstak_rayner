import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createYandexWebmasterConnector } from '../../electron/connectors/yandex-webmaster'

const ctx = {
  getSecret: (k: string) => (k === 'yandex_webmaster_token' ? 'tok' : null),
  signal: new AbortController().signal
}
const noCred = { getSecret: (_: string) => null, signal: new AbortController().signal }

// Вебмастер сначала зовёт /v4/user (user_id), затем данные.
function mockRouter(routes: Array<[string, { ok?: boolean; status?: number; body: unknown }]>) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url)
    const hit = routes.find(([p]) => u.includes(p))
    const r = hit ? hit[1] : { ok: false, status: 404, body: {} }
    return { ok: r.ok ?? true, status: r.status ?? 200, text: async () => JSON.stringify(r.body) }
  }) as unknown as typeof fetch)
}

// В роутере более специфичные пути (/hosts, /summary, /search-queries)
// ставим раньше общего '/v4/user', который ловит вызов getUserId.

beforeEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('Yandex.Webmaster connector', () => {
  it('info() корректен', () => {
    expect(createYandexWebmasterConnector().info().id).toBe('yandex_webmaster')
  })

  it('без токена — no-token', async () => {
    const r = await createYandexWebmasterConnector().query({ op: 'list_hosts' }, noCred) as { error: string }
    expect(r.error).toBe('no-token')
  })

  it('list_hosts парсит сайты', async () => {
    mockRouter([
      ['/hosts', { body: { hosts: [{ host_id: 'https:client.ru:443', unicode_host_url: 'https://client.ru/', verified: true }] } }],
      ['/v4/user', { body: { user_id: 7 } }]
    ])
    const r = await createYandexWebmasterConnector().query({ op: 'list_hosts' }, ctx) as { hosts: Array<{ host_id: string; verified: boolean }> }
    expect(r.hosts[0].host_id).toBe('https:client.ru:443')
    expect(r.hosts[0].verified).toBe(true)
  })

  it('get_summary без host_id — bad-args', async () => {
    mockRouter([['/v4/user', { body: { user_id: 7 } }]])
    const r = await createYandexWebmasterConnector().query({ op: 'get_summary' }, ctx) as { error: string }
    expect(r.error).toBe('bad-args')
  })

  it('get_summary возвращает ИКС и проблемы', async () => {
    mockRouter([
      ['/summary', { body: { sqi: 320, site_problems: { CRITICAL: [] } } }],
      ['/v4/user', { body: { user_id: 7 } }]
    ])
    const r = await createYandexWebmasterConnector().query({ op: 'get_summary', host_id: 'https:client.ru:443' }, ctx) as { sqi: number }
    expect(r.sqi).toBe(320)
  })

  it('get_queries возвращает топ запросов с показами/кликами', async () => {
    mockRouter([
      ['/search-queries/popular', { body: { queries: [{ query_text: 'купить диван', indicators: { TOTAL_SHOWS: 5000, TOTAL_CLICKS: 120 } }] } }],
      ['/v4/user', { body: { user_id: 7 } }]
    ])
    const r = await createYandexWebmasterConnector().query({ op: 'get_queries', host_id: 'https:client.ru:443' }, ctx) as {
      queries: Array<{ query: string; shows: number; clicks: number }>
    }
    expect(r.queries[0].query).toBe('купить диван')
    expect(r.queries[0].shows).toBe(5000)
    expect(r.queries[0].clicks).toBe(120)
  })

  it('403 пробрасывается понятной ошибкой', async () => {
    mockRouter([['/v4/user', { ok: false, status: 403, body: { error: 'forbidden' } }]])
    const r = await createYandexWebmasterConnector().query({ op: 'list_hosts' }, ctx) as { error: string; message: string }
    expect(r.error).toBe('request-failed')
    expect(r.message).toContain('403')
  })
})
