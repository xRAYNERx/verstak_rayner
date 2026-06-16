import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMoySkladConnector } from '../../electron/connectors/moysklad'

// Тесты НЕ дёргают реальный МойСклад. Проверяют:
// 1. info().
// 2. Понятную ошибку при отсутствии токена.
// 3. unknown op возвращает список доступных.
// 4. Корректный разбор rows[] для products / orders / stock через мок fetch.
// 5. HTTP 401 пробрасывается понятной ошибкой.

const ctx = {
  getSecret: (k: string) => (k === 'moysklad_token' ? 'test-token' : null),
  signal: new AbortController().signal
}
const noCredCtx = {
  getSecret: (_: string) => null,
  signal: new AbortController().signal
}

function mockFetchOnce(payload: unknown, ok = true, status = 200) {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok,
    status,
    text: async () => JSON.stringify(payload)
  })) as unknown as typeof fetch)
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('MoySklad connector', () => {
  it('info() корректен', () => {
    const info = createMoySkladConnector().info()
    expect(info.id).toBe('moysklad')
    expect(info.label).toBe('МойСклад')
    expect(info.status).toBe('ready')
  })

  it('без токена возвращает no-token', async () => {
    const res = await createMoySkladConnector().query({ op: 'list_products' }, noCredCtx) as { error: string }
    expect(res.error).toBe('no-token')
  })

  it('unknown op возвращает список доступных', async () => {
    const res = await createMoySkladConnector().query({ op: 'foo' }, ctx) as { error: string; message: string }
    expect(res.error).toBe('unknown-op')
    expect(res.message).toContain('list_products')
  })

  it('list_products разбирает rows в товары', async () => {
    mockFetchOnce({
      rows: [
        { id: 'p1', name: 'Чудо товар', code: '00001', article: 'ART-1' },
        { id: 'p2', name: 'Без артикула', code: '00002' }
      ]
    })
    const res = await createMoySkladConnector().query({ op: 'list_products' }, ctx) as {
      count: number; products: Array<{ id: string; name: string; code: string; article: string | null }>
    }
    expect(res.count).toBe(2)
    expect(res.products[0].article).toBe('ART-1')
    expect(res.products[1].article).toBeNull()
  })

  it('list_orders разбирает rows в заказы', async () => {
    mockFetchOnce({
      rows: [
        { id: 'o1', name: '00012', moment: '2026-06-16 10:00:00.000', sum: 150000 }
      ]
    })
    const res = await createMoySkladConnector().query({ op: 'list_orders' }, ctx) as {
      count: number; orders: Array<{ id: string; name: string; moment: string; sum: number }>
    }
    expect(res.count).toBe(1)
    expect(res.orders[0].name).toBe('00012')
    expect(res.orders[0].sum).toBe(150000)
  })

  it('get_stock разбирает rows остатков', async () => {
    mockFetchOnce({
      rows: [
        { name: 'Чудо товар', code: '00001', stock: 5, reserve: 1, quantity: 4 }
      ]
    })
    const res = await createMoySkladConnector().query({ op: 'get_stock' }, ctx) as {
      count: number; stock: Array<{ name: string; article: string; stock: number; reserve: number; quantity: number }>
    }
    expect(res.count).toBe(1)
    expect(res.stock[0].stock).toBe(5)
    expect(res.stock[0].reserve).toBe(1)
    expect(res.stock[0].article).toBe('00001')  // fallback на code
  })

  it('пустой rows — count:0', async () => {
    mockFetchOnce({ rows: [] })
    const res = await createMoySkladConnector().query({ op: 'list_products' }, ctx) as { count: number }
    expect(res.count).toBe(0)
  })

  it('HTTP 401 пробрасывается понятной ошибкой', async () => {
    mockFetchOnce({ errors: [{ error: 'Unauthorized' }] }, false, 401)
    const res = await createMoySkladConnector().query({ op: 'list_products' }, ctx) as { error: string; message: string }
    expect(res.error).toBe('request-failed')
    expect(res.message).toContain('401')
  })
})
