import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createYooKassaConnector } from '../../electron/connectors/yookassa'

// Тесты НЕ дёргают реальный YooKassa API. Проверяют:
// 1. info().
// 2. Понятную ошибку при отсутствии креды (no-credentials).
// 3. Валидацию аргументов (unknown op, get_payment без payment_id).
// 4. Корректный разбор ответа list_payments / get_payment / list_refunds через мок fetch.
// 5. Проброс HTTP 401 понятной ошибкой.

const ctx = {
  getSecret: (k: string) =>
    k === 'yookassa_shop_id' ? 'test-shop' : k === 'yookassa_secret_key' ? 'test-secret' : null,
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

describe('YooKassa connector', () => {
  it('info() корректен', () => {
    const info = createYooKassaConnector().info()
    expect(info.id).toBe('yookassa')
    expect(info.label).toBe('ЮКасса')
    expect(info.kind).toBe('yookassa')
    expect(info.status).toBe('ready')
  })

  it('без креды возвращает no-credentials', async () => {
    const res = await createYooKassaConnector().query({ op: 'list_payments' }, noCredCtx) as { error: string }
    expect(res.error).toBe('no-credentials')
  })

  it('unknown op возвращает список доступных', async () => {
    const res = await createYooKassaConnector().query({ op: 'foo' }, ctx) as { error: string; message: string }
    expect(res.error).toBe('unknown-op')
    expect(res.message).toContain('list_payments')
  })

  it('get_payment без payment_id — bad-args', async () => {
    const res = await createYooKassaConnector().query({ op: 'get_payment' }, ctx) as { error: string }
    expect(res.error).toBe('bad-args')
  })

  it('list_payments разбирает платежи', async () => {
    mockFetchOnce({
      items: [{
        id: '2c8f...001',
        status: 'succeeded',
        amount: { value: '1500.00', currency: 'RUB' },
        description: 'Заказ №42',
        created_at: '2026-06-01T10:00:00.000Z',
        paid: true,
        payment_method: { type: 'bank_card' }
      }],
      next_cursor: 'cursor123'
    })
    const res = await createYooKassaConnector().query({ op: 'list_payments' }, ctx) as {
      count: number; payments: Array<{ id: string; status: string; amount: { value: string }; payment_method: { type: string } }>
    }
    expect(res.count).toBe(1)
    expect(res.payments[0].id).toBe('2c8f...001')
    expect(res.payments[0].status).toBe('succeeded')
    expect(res.payments[0].amount.value).toBe('1500.00')
    expect(res.payments[0].payment_method.type).toBe('bank_card')
  })

  it('get_payment возвращает плоский платёж с captured_at и refunded_amount', async () => {
    mockFetchOnce({
      id: '2c8f...001',
      status: 'succeeded',
      amount: { value: '1500.00', currency: 'RUB' },
      description: 'Заказ №42',
      created_at: '2026-06-01T10:00:00.000Z',
      captured_at: '2026-06-01T10:05:00.000Z',
      paid: true,
      refunded_amount: { value: '500.00', currency: 'RUB' },
      payment_method: { type: 'bank_card' }
    })
    const res = await createYooKassaConnector().query({ op: 'get_payment', payment_id: '2c8f...001' }, ctx) as {
      id: string; captured_at: string; refunded_amount: { value: string }
    }
    expect(res.id).toBe('2c8f...001')
    expect(res.captured_at).toBe('2026-06-01T10:05:00.000Z')
    expect(res.refunded_amount.value).toBe('500.00')
  })

  it('list_refunds разбирает возвраты', async () => {
    mockFetchOnce({
      items: [{
        id: 'ref...001',
        status: 'succeeded',
        amount: { value: '500.00', currency: 'RUB' },
        created_at: '2026-06-02T12:00:00.000Z',
        payment_id: '2c8f...001'
      }]
    })
    const res = await createYooKassaConnector().query({ op: 'list_refunds' }, ctx) as {
      count: number; refunds: Array<{ id: string; payment_id: string; amount: { value: string } }>
    }
    expect(res.count).toBe(1)
    expect(res.refunds[0].id).toBe('ref...001')
    expect(res.refunds[0].payment_id).toBe('2c8f...001')
    expect(res.refunds[0].amount.value).toBe('500.00')
  })

  it('HTTP 401 пробрасывается понятной ошибкой', async () => {
    mockFetchOnce({ type: 'error', code: 'invalid_credentials' }, false, 401)
    const res = await createYooKassaConnector().query({ op: 'list_payments' }, ctx) as { error: string; message: string }
    expect(res.error).toBe('request-failed')
    expect(res.message).toContain('401')
  })
})
