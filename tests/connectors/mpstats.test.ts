import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMpStatsConnector } from '../../electron/connectors/mpstats'

// Тесты НЕ дёргают реальный MPSTATS. Проверяют:
// 1. info().
// 2. Понятную ошибку при отсутствии токена.
// 3. unknown op со списком доступных.
// 4. Валидацию аргументов (нет path/sku, кривые даты).
// 5. Корректный разбор ответа category/sales через мок fetch.
// 6. Проброс HTTP 401 понятной ошибкой.

const ctx = {
  getSecret: (k: string) => (k === 'mpstats_token' ? 'test-token' : null),
  signal: new AbortController().signal
}
const noTokenCtx = {
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

describe('MPSTATS connector', () => {
  it('info() корректен', () => {
    const info = createMpStatsConnector().info()
    expect(info.id).toBe('mpstats')
    expect(info.label).toBe('MPSTATS')
    expect(info.status).toBe('ready')
  })

  it('без токена возвращает no-token', async () => {
    const res = await createMpStatsConnector().query(
      { op: 'wb_category', path: 'Женщинам/Платья', d1: '2024-01-01', d2: '2024-01-31' },
      noTokenCtx
    ) as { error: string }
    expect(res.error).toBe('no-token')
  })

  it('unknown op возвращает список доступных', async () => {
    const res = await createMpStatsConnector().query({ op: 'foo' }, ctx) as { error: string; message: string }
    expect(res.error).toBe('unknown-op')
    expect(res.message).toContain('wb_category')
    expect(res.message).toContain('wb_item_sales')
  })

  it('wb_category без path — bad-args', async () => {
    const res = await createMpStatsConnector().query(
      { op: 'wb_category', d1: '2024-01-01', d2: '2024-01-31' },
      ctx
    ) as { error: string }
    expect(res.error).toBe('bad-args')
  })

  it('wb_category с кривыми датами — bad-args', async () => {
    const res = await createMpStatsConnector().query(
      { op: 'wb_category', path: 'Женщинам/Платья', d1: '01.01.2024', d2: '2024-01-31' },
      ctx
    ) as { error: string; message: string }
    expect(res.error).toBe('bad-args')
    expect(res.message).toContain('YYYY-MM-DD')
  })

  it('wb_item_sales без sku — bad-args', async () => {
    const res = await createMpStatsConnector().query(
      { op: 'wb_item_sales', d1: '2024-01-01', d2: '2024-01-31' },
      ctx
    ) as { error: string }
    expect(res.error).toBe('bad-args')
  })

  it('wb_category разбирает товары категории', async () => {
    mockFetchOnce({
      total: { count: 1 },
      data: [{
        id: 148471993,
        name: 'Платье летнее',
        brand: 'BrandX',
        seller: 'ИП Иванов',
        final_price: 1990,
        rating: 4.8,
        comments: 120,
        sales: 340,
        revenue: 676600,
        balance: 58,
        url: 'https://www.wildberries.ru/catalog/148471993/detail.aspx'
      }]
    })
    const res = await createMpStatsConnector().query(
      { op: 'wb_category', path: 'Женщинам/Платья', d1: '2024-01-01', d2: '2024-01-31' },
      ctx
    ) as { count: number; items: Array<{ sku: number; revenue: number; brand: string }> }
    expect(res.count).toBe(1)
    expect(res.items[0].sku).toBe(148471993)
    expect(res.items[0].revenue).toBe(676600)
    expect(res.items[0].brand).toBe('BrandX')
  })

  it('wb_item_sales разбирает дневные срезы', async () => {
    mockFetchOnce([
      { data: '2024-01-01', sales: 12, price: 1990, balance: 70, revenue: 23880 },
      { data: '2024-01-02', sales: 9, price: 1990, balance: 61, revenue: 17910 }
    ])
    const res = await createMpStatsConnector().query(
      { op: 'wb_item_sales', sku: '148471993', d1: '2024-01-01', d2: '2024-01-31' },
      ctx
    ) as { sku: string; days: number; sales: Array<{ date: string; sales: number }> }
    expect(res.sku).toBe('148471993')
    expect(res.days).toBe(2)
    expect(res.sales[0].date).toBe('2024-01-01')
    expect(res.sales[0].sales).toBe(12)
  })

  it('HTTP 401 пробрасывается понятной ошибкой', async () => {
    mockFetchOnce({ message: 'unauthorized' }, false, 401)
    const res = await createMpStatsConnector().query(
      { op: 'wb_item_sales', sku: '148471993', d1: '2024-01-01', d2: '2024-01-31' },
      ctx
    ) as { error: string; message: string }
    expect(res.error).toBe('request-failed')
    expect(res.message).toContain('401')
    expect(res.message).toContain('mpstats_token')
  })
})
