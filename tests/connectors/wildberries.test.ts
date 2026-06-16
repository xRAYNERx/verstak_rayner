import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createWildberriesConnector } from '../../electron/connectors/wildberries'

// Тесты НЕ дёргают реальный Wildberries. Проверяют:
// 1. info().
// 2. Понятную ошибку при отсутствии токена.
// 3. unknown op со списком доступных операций.
// 4. Валидацию аргументов (битый date_from → bad-args).
// 5. Корректный разбор массива продаж/заказов/остатков через мок fetch.
// 6. HTTP 401/403 — понятная ошибка request-failed.

const ctx = {
  getSecret: (k: string) => (k === 'wildberries_token' ? 'test-token' : null),
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

describe('Wildberries connector', () => {
  it('info() корректен', () => {
    const info = createWildberriesConnector().info()
    expect(info.id).toBe('wildberries')
    expect(info.label).toBe('Wildberries')
    expect(info.kind).toBe('wildberries')
    expect(info.status).toBe('ready')
  })

  it('без токена возвращает no-token', async () => {
    const res = await createWildberriesConnector().query({ op: 'get_sales' }, noCredCtx) as { error: string }
    expect(res.error).toBe('no-token')
  })

  it('unknown op возвращает список доступных', async () => {
    const res = await createWildberriesConnector().query({ op: 'foo' }, ctx) as { error: string; message: string }
    expect(res.error).toBe('unknown-op')
    expect(res.message).toContain('get_sales')
    expect(res.message).toContain('get_stocks')
  })

  it('битый date_from — bad-args', async () => {
    const res = await createWildberriesConnector().query({ op: 'get_sales', date_from: '16.06.2026' }, ctx) as { error: string }
    expect(res.error).toBe('bad-args')
  })

  it('get_sales разбирает продажи', async () => {
    mockFetchOnce([{
      date: '2026-06-10T12:00:00',
      lastChangeDate: '2026-06-11T08:00:00',
      supplierArticle: 'ART-001',
      techSize: 'M',
      barcode: '2000000000001',
      totalPrice: 1500,
      discountPercent: 20,
      isRealization: true,
      saleID: 'S123',
      subject: 'Футболка',
      category: 'Одежда',
      brand: 'BrandX',
      finishedPrice: 1200,
      extraGarbageField: 'should be dropped'
    }])
    const res = await createWildberriesConnector().query({ op: 'get_sales', date_from: '2026-06-09' }, ctx) as {
      count: number; sales: Array<{ supplierArticle: string; saleID: string; finishedPrice: number }>
    }
    expect(res.count).toBe(1)
    expect(res.sales[0].supplierArticle).toBe('ART-001')
    expect(res.sales[0].saleID).toBe('S123')
    expect(res.sales[0].finishedPrice).toBe(1200)
    expect(res.sales[0]).not.toHaveProperty('extraGarbageField')
  })

  it('get_orders разбирает заказы', async () => {
    mockFetchOnce([{
      date: '2026-06-10T12:00:00',
      supplierArticle: 'ART-002',
      barcode: '2000000000002',
      totalPrice: 999,
      discountPercent: 10,
      subject: 'Кружка',
      category: 'Посуда',
      brand: 'BrandY',
      oblast: 'Москва'
    }])
    const res = await createWildberriesConnector().query({ op: 'get_orders' }, ctx) as {
      count: number; orders: Array<{ supplierArticle: string; oblast: string }>
    }
    expect(res.count).toBe(1)
    expect(res.orders[0].supplierArticle).toBe('ART-002')
    expect(res.orders[0].oblast).toBe('Москва')
  })

  it('get_stocks разбирает остатки', async () => {
    mockFetchOnce([{
      lastChangeDate: '2026-06-11T08:00:00',
      supplierArticle: 'ART-003',
      barcode: '2000000000003',
      quantity: 42,
      warehouseName: 'Коледино',
      subject: 'Носки',
      category: 'Одежда',
      brand: 'BrandZ'
    }])
    const res = await createWildberriesConnector().query({ op: 'get_stocks' }, ctx) as {
      count: number; stocks: Array<{ quantity: number; warehouseName: string }>
    }
    expect(res.count).toBe(1)
    expect(res.stocks[0].quantity).toBe(42)
    expect(res.stocks[0].warehouseName).toBe('Коледино')
  })

  it('массив ограничен 200 элементами', async () => {
    const big = Array.from({ length: 250 }, (_, i) => ({ supplierArticle: `ART-${i}`, saleID: `S${i}` }))
    mockFetchOnce(big)
    const res = await createWildberriesConnector().query({ op: 'get_sales' }, ctx) as { count: number }
    expect(res.count).toBe(200)
  })

  it('HTTP 401 пробрасывается понятной ошибкой', async () => {
    mockFetchOnce({ message: 'unauthorized' }, false, 401)
    const res = await createWildberriesConnector().query({ op: 'get_sales' }, ctx) as { error: string; message: string }
    expect(res.error).toBe('request-failed')
    expect(res.message).toContain('401')
  })
})
