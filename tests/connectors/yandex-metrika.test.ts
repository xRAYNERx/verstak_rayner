import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createYandexMetrikaConnector } from '../../electron/connectors/yandex-metrika'

const ctx = {
  getSecret: (k: string) => (k === 'yandex_metrika_token' ? 'tok' : null),
  signal: new AbortController().signal
}
const noCred = { getSecret: (_: string) => null, signal: new AbortController().signal }

function mockJson(body: unknown, ok = true, status = 200) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok, status, text: async () => JSON.stringify(body) })) as unknown as typeof fetch)
}

beforeEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('Yandex.Metrika connector', () => {
  it('info() корректен', () => {
    expect(createYandexMetrikaConnector().info().id).toBe('yandex_metrika')
  })

  it('без токена — no-token', async () => {
    const r = await createYandexMetrikaConnector().query({ op: 'list_counters' }, noCred) as { error: string }
    expect(r.error).toBe('no-token')
  })

  it('unknown op', async () => {
    const r = await createYandexMetrikaConnector().query({ op: 'x' }, ctx) as { error: string; message: string }
    expect(r.error).toBe('unknown-op')
    expect(r.message).toContain('get_traffic')
  })

  it('get_traffic без counter — bad-args', async () => {
    const r = await createYandexMetrikaConnector().query({ op: 'get_traffic' }, ctx) as { error: string }
    expect(r.error).toBe('bad-args')
  })

  it('list_counters парсит счётчики', async () => {
    mockJson({ counters: [{ id: 111, name: 'Сайт клиента', site: 'client.ru', status: 'Active' }] })
    const r = await createYandexMetrikaConnector().query({ op: 'list_counters' }, ctx) as { counters: Array<{ id: number; site: string }> }
    expect(r.counters[0].id).toBe(111)
    expect(r.counters[0].site).toBe('client.ru')
  })

  it('get_traffic разворачивает stat data в плоские строки', async () => {
    mockJson({
      data: [{ dimensions: [{ name: '2026-06-15' }], metrics: [120, 95, 300, 22.5, 88] }],
      totals: [[120, 95, 300, 22.5, 88]]
    })
    const r = await createYandexMetrikaConnector().query({ op: 'get_traffic', counter: '111' }, ctx) as {
      data: Array<{ date: string; visits: number; users: number }>
    }
    expect(r.data[0].date).toBe('2026-06-15')
    expect(r.data[0].visits).toBe(120)
    expect(r.data[0].users).toBe(95)
  })

  it('401 пробрасывается понятной ошибкой', async () => {
    mockJson({ errors: [{ message: 'auth' }] }, false, 401)
    const r = await createYandexMetrikaConnector().query({ op: 'list_counters' }, ctx) as { error: string; message: string }
    expect(r.error).toBe('request-failed')
    expect(r.message).toContain('401')
  })
})
