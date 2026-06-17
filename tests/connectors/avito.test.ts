import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createAvitoConnector } from '../../electron/connectors/avito'

const ctx = {
  getSecret: (k: string) => (k === 'avito_client_id' ? 'cid' : k === 'avito_client_secret' ? 'sec' : null),
  signal: new AbortController().signal
}
const noCred = { getSecret: (_: string) => null, signal: new AbortController().signal }

// URL-aware мок: Avito делает /token, затем /core|/stats запросы.
function mockRouter(routes: Array<[string, { ok?: boolean; status?: number; body: unknown }]>) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url)
    const hit = routes.find(([p]) => u.includes(p))
    const r = hit ? hit[1] : { ok: false, status: 404, body: {} }
    return { ok: r.ok ?? true, status: r.status ?? 200, text: async () => JSON.stringify(r.body) }
  }) as unknown as typeof fetch)
}

const TOKEN_OK: [string, { body: unknown }] = ['/token', { body: { access_token: 'at', expires_in: 86400 } }]

beforeEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('Avito connector', () => {
  it('info() корректен', () => {
    expect(createAvitoConnector().info().id).toBe('avito')
  })

  it('без креды — no-credentials', async () => {
    const r = await createAvitoConnector().query({ op: 'list_items' }, noCred) as { error: string }
    expect(r.error).toBe('no-credentials')
  })

  it('ошибка авторизации (неверный secret) пробрасывается', async () => {
    mockRouter([['/token', { ok: false, status: 401, body: { error: 'invalid_client' } }]])
    const r = await createAvitoConnector().query({ op: 'list_items' }, ctx) as { error: string; message: string }
    expect(r.error).toBe('request-failed')
    expect(r.message).toContain('Avito auth 401')
  })

  it('unknown op (после успешного токена)', async () => {
    mockRouter([TOKEN_OK])
    const r = await createAvitoConnector().query({ op: 'foo' }, ctx) as { error: string; message: string }
    expect(r.error).toBe('unknown-op')
    expect(r.message).toContain('list_items')
  })

  it('list_items парсит объявления', async () => {
    mockRouter([
      TOKEN_OK,
      ['/core/v1/items', { body: { resources: [{ id: 5, title: 'Диван', price: 1000, status: 'active', url: 'https://avito.ru/5' }] } }]
    ])
    const r = await createAvitoConnector().query({ op: 'list_items' }, ctx) as { items: Array<{ id: number; title: string }> }
    expect(r.items[0].id).toBe(5)
    expect(r.items[0].title).toBe('Диван')
  })

  it('get_stats без item_ids — bad-args', async () => {
    mockRouter([TOKEN_OK])
    const r = await createAvitoConnector().query({ op: 'get_stats' }, ctx) as { error: string }
    expect(r.error).toBe('bad-args')
  })

  it('get_balance возвращает остаток', async () => {
    mockRouter([
      TOKEN_OK,
      ['/accounts/self', { body: { id: 42 } }],
      ['/balance', { body: { real: 1500, bonus: 200 } }]
    ])
    const r = await createAvitoConnector().query({ op: 'get_balance' }, ctx) as { real: number; bonus: number }
    expect(r.real).toBe(1500)
    expect(r.bonus).toBe(200)
  })

  // C4: cachedToken/cachedUserId не были привязаны к client_id — после смены
  // креда возвращался токен и userId ЧУЖОГО аккаунта (кросс-аккаунтная путаница).
  it('смена креда → новый userId в stats-запросе (не кэш чужого аккаунта)', async () => {
    let selfN = 0
    const statsUrls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = String(url)
      if (u.includes('/token')) return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: 'at', expires_in: 86400 }) }
      if (u.includes('/accounts/self')) { selfN++; return { ok: true, status: 200, text: async () => JSON.stringify({ id: 100 + selfN }) } }
      if (u.includes('/stats/')) { statsUrls.push(u); return { ok: true, status: 200, text: async () => JSON.stringify({ result: { items: [] } }) } }
      return { ok: true, status: 200, text: async () => JSON.stringify({}) }
    }) as unknown as typeof fetch)

    const conn = createAvitoConnector()
    const ctxA = { getSecret: (k: string) => k === 'avito_client_id' ? 'cidA' : k === 'avito_client_secret' ? 'secA' : null, signal: new AbortController().signal }
    const ctxB = { getSecret: (k: string) => k === 'avito_client_id' ? 'cidB' : k === 'avito_client_secret' ? 'secB' : null, signal: new AbortController().signal }
    await conn.query({ op: 'get_stats', item_ids: [1] }, ctxA)
    await conn.query({ op: 'get_stats', item_ids: [1] }, ctxB)

    expect(statsUrls).toHaveLength(2)
    expect(statsUrls[0]).toContain('/accounts/101/')
    expect(statsUrls[1]).toContain('/accounts/102/') // НЕ 101 — userId сброшен при смене креда
  })
})
