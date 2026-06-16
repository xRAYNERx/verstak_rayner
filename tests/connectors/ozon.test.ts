import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createOzonConnector } from '../../electron/connectors/ozon'

// Тесты НЕ дёргают реальный Ozon Seller API. Проверяют:
// 1. info().
// 2. Понятную ошибку при отсутствии credentials.
// 3. Валидацию аргументов (unknown op, отсутствие date_from/date_to).
// 4. Корректный разбор ответов list_products / get_stocks / get_analytics / get_transactions через мок fetch.
// 5. Проброс HTTP 401/403 понятной ошибкой.

const ctx = {
  getSecret: (k: string) => (k === 'ozon_client_id' ? 'test-client' : k === 'ozon_api_key' ? 'test-key' : null),
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

describe('Ozon Seller connector', () => {
  it('info() корректен', () => {
    const info = createOzonConnector().info()
    expect(info.id).toBe('ozon')
    expect(info.label).toBe('Ozon Seller')
    expect(info.kind).toBe('ozon')
    expect(info.status).toBe('ready')
  })

  it('без credentials возвращает no-credentials', async () => {
    const res = await createOzonConnector().query({ op: 'list_products' }, noCredCtx) as { error: string }
    expect(res.error).toBe('no-credentials')
  })

  it('только client_id без api_key — no-credentials', async () => {
    const partial = {
      getSecret: (k: string) => (k === 'ozon_client_id' ? 'test-client' : null),
      signal: new AbortController().signal
    }
    const res = await createOzonConnector().query({ op: 'list_products' }, partial) as { error: string }
    expect(res.error).toBe('no-credentials')
  })

  it('unknown op возвращает список доступных', async () => {
    const res = await createOzonConnector().query({ op: 'foo' }, ctx) as { error: string; message: string }
    expect(res.error).toBe('unknown-op')
    expect(res.message).toContain('list_products')
  })

  it('get_analytics без дат — bad-args', async () => {
    const res = await createOzonConnector().query({ op: 'get_analytics' }, ctx) as { error: string }
    expect(res.error).toBe('bad-args')
  })

  it('get_transactions без дат — bad-args', async () => {
    const res = await createOzonConnector().query({ op: 'get_transactions', date_from: '2026-01-01' }, ctx) as { error: string }
    expect(res.error).toBe('bad-args')
  })

  it('list_products разбирает товары', async () => {
    mockFetchOnce({
      result: {
        items: [
          { product_id: 123, offer_id: 'SKU-1' },
          { product_id: 456, offer_id: 'SKU-2' }
        ]
      }
    })
    const res = await createOzonConnector().query({ op: 'list_products' }, ctx) as {
      count: number; items: Array<{ product_id: number; offer_id: string }>
    }
    expect(res.count).toBe(2)
    expect(res.items[0].product_id).toBe(123)
    expect(res.items[1].offer_id).toBe('SKU-2')
  })

  it('get_stocks разворачивает остатки по складам', async () => {
    mockFetchOnce({
      result: {
        items: [{
          offer_id: 'SKU-1',
          product_id: 123,
          stocks: [
            { present: 10, reserved: 2, type: 'fbo' },
            { present: 5, reserved: 0, type: 'fbs' }
          ]
        }]
      }
    })
    const res = await createOzonConnector().query({ op: 'get_stocks' }, ctx) as {
      count: number; items: Array<{ offer_id: string; stocks: Array<{ present: number; type: string }> }>
    }
    expect(res.count).toBe(1)
    expect(res.items[0].offer_id).toBe('SKU-1')
    expect(res.items[0].stocks[0].present).toBe(10)
    expect(res.items[0].stocks[1].type).toBe('fbs')
  })

  it('get_analytics разворачивает выручку и заказы по дням', async () => {
    mockFetchOnce({
      result: {
        data: [
          { dimensions: [{ id: '2026-01-01', name: '1 января' }], metrics: [15000, 12] },
          { dimensions: [{ id: '2026-01-02', name: '2 января' }], metrics: [22000, 18] }
        ]
      }
    })
    const res = await createOzonConnector().query(
      { op: 'get_analytics', date_from: '2026-01-01', date_to: '2026-01-02' }, ctx
    ) as { count: number; rows: Array<{ date: string; revenue: number; ordered_units: number }> }
    expect(res.count).toBe(2)
    expect(res.rows[0].date).toBe('2026-01-01')
    expect(res.rows[0].revenue).toBe(15000)
    expect(res.rows[1].ordered_units).toBe(18)
  })

  it('get_transactions разбирает финансовые операции', async () => {
    mockFetchOnce({
      result: {
        operations: [{
          operation_id: 777,
          operation_type: 'OperationMarketplaceServiceItemDelivToCustomer',
          amount: -54.3,
          operation_date: '2026-01-01 12:00:00'
        }]
      }
    })
    const res = await createOzonConnector().query(
      { op: 'get_transactions', date_from: '2026-01-01', date_to: '2026-01-31' }, ctx
    ) as { count: number; operations: Array<{ operation_id: number; amount: number; operation_type: string }> }
    expect(res.count).toBe(1)
    expect(res.operations[0].operation_id).toBe(777)
    expect(res.operations[0].amount).toBe(-54.3)
    expect(res.operations[0].operation_type).toContain('Marketplace')
  })

  it('HTTP 403 пробрасывается понятной ошибкой', async () => {
    mockFetchOnce({ message: 'forbidden' }, false, 403)
    const res = await createOzonConnector().query({ op: 'list_products' }, ctx) as { error: string; message: string }
    expect(res.error).toBe('request-failed')
    expect(res.message).toContain('403')
    expect(res.message).toContain('ozon_api_key')
  })
})
