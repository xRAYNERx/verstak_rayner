import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createOzonPerformanceConnector } from '../../electron/connectors/ozon-performance'

// Тесты НЕ дёргают реальный Ozon Performance API. Проверяют:
// 1. info().
// 2. Понятную ошибку при отсутствии credentials.
// 3. Валидацию аргументов (нет campaign_id, unknown op).
// 4. Корректный разбор ответа list_campaigns / list_objects через мок fetch.
// 5. Проброс HTTP 401 понятной ошибкой.
// Первый сетевой вызов всегда — получение токена (POST /token), поэтому для
// успешных кейсов мокаем fetch последовательно: сначала токен, потом данные.

const ctx = {
  getSecret: (k: string) =>
    (k === 'ozon_perf_client_id' ? 'test-id' : k === 'ozon_perf_client_secret' ? 'test-secret' : null),
  signal: new AbortController().signal
}
const noCredCtx = {
  getSecret: (_: string) => null,
  signal: new AbortController().signal
}

// Очередь ответов fetch: первый — токен, далее — полезная нагрузка.
function mockFetchSequence(responses: Array<{ payload: unknown; ok?: boolean; status?: number }>) {
  const fn = vi.fn(async () => {
    const r = responses.shift() ?? { payload: {}, ok: true, status: 200 }
    return {
      ok: r.ok ?? true,
      status: r.status ?? 200,
      text: async () => JSON.stringify(r.payload)
    }
  })
  vi.stubGlobal('fetch', fn as unknown as typeof fetch)
  return fn
}

const tokenOk = { payload: { access_token: 'tok-123', expires_in: 1800 } }

beforeEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Ozon Performance connector', () => {
  it('info() корректен', () => {
    const info = createOzonPerformanceConnector().info()
    expect(info.id).toBe('ozon_performance')
    expect(info.label).toBe('Ozon Performance')
    expect(info.status).toBe('ready')
  })

  it('без credentials возвращает no-credentials', async () => {
    const res = await createOzonPerformanceConnector().query({ op: 'list_campaigns' }, noCredCtx) as { error: string }
    expect(res.error).toBe('no-credentials')
  })

  it('unknown op возвращает список доступных', async () => {
    mockFetchSequence([tokenOk])
    const res = await createOzonPerformanceConnector().query({ op: 'foo' }, ctx) as { error: string; message: string }
    expect(res.error).toBe('unknown-op')
    expect(res.message).toContain('list_campaigns')
  })

  it('list_objects без campaign_id — bad-args', async () => {
    mockFetchSequence([tokenOk])
    const res = await createOzonPerformanceConnector().query({ op: 'list_objects' }, ctx) as { error: string }
    expect(res.error).toBe('bad-args')
  })

  it('list_campaigns разбирает кампании из list', async () => {
    mockFetchSequence([
      tokenOk,
      { payload: { list: [
        { id: '111', title: 'Осенняя распродажа', state: 'CAMPAIGN_STATE_RUNNING', advObjectType: 'SKU' },
        { id: '222', title: 'Поиск', state: 'CAMPAIGN_STATE_STOPPED', advObjectType: 'SEARCH_PROMO' }
      ] } }
    ])
    const res = await createOzonPerformanceConnector().query({ op: 'list_campaigns' }, ctx) as {
      count: number; campaigns: Array<{ id: string; title: string; state: string; advObjectType: string }>
    }
    expect(res.count).toBe(2)
    expect(res.campaigns[0].id).toBe('111')
    expect(res.campaigns[0].state).toBe('CAMPAIGN_STATE_RUNNING')
    expect(res.campaigns[1].advObjectType).toBe('SEARCH_PROMO')
  })

  it('list_objects разбирает объекты кампании', async () => {
    mockFetchSequence([
      tokenOk,
      { payload: { list: [
        { id: '555', name: 'Кроссовки', sku: '987654' },
        { id: '666', name: 'Куртка', sku: '123456' }
      ] } }
    ])
    const res = await createOzonPerformanceConnector().query({ op: 'list_objects', campaign_id: '111' }, ctx) as {
      campaign_id: string; count: number; objects: Array<{ id: string; sku: string }>
    }
    expect(res.campaign_id).toBe('111')
    expect(res.count).toBe(2)
    expect(res.objects[0].sku).toBe('987654')
  })

  it('HTTP 401 на данных пробрасывается понятной ошибкой', async () => {
    mockFetchSequence([
      tokenOk,
      { payload: { error: 'unauthorized' }, ok: false, status: 401 }
    ])
    const res = await createOzonPerformanceConnector().query({ op: 'list_campaigns' }, ctx) as { error: string; message: string }
    expect(res.error).toBe('request-failed')
    expect(res.message).toContain('401')
  })

  it('ошибка авторизации (token) — request-failed', async () => {
    mockFetchSequence([
      { payload: { error: 'invalid_client' }, ok: false, status: 401 }
    ])
    const res = await createOzonPerformanceConnector().query({ op: 'list_campaigns' }, ctx) as { error: string; message: string }
    expect(res.error).toBe('request-failed')
    expect(res.message).toContain('auth')
  })
})
