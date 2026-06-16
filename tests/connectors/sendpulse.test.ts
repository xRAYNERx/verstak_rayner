import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSendPulseConnector } from '../../electron/connectors/sendpulse'

// Тесты НЕ дёргают реальный SendPulse. Проверяют:
// 1. info().
// 2. Понятную ошибку при отсутствии креды (no-credentials).
// 3. Валидацию op (unknown-op).
// 4. Корректный разбор ответов addressbooks / campaigns / balance через мок fetch
//    (первый ответ — OAuth токен, далее — данные операции).
// 5. Проброс HTTP 401 понятной ошибкой.

const ctx = {
  getSecret: (k: string) =>
    k === 'sendpulse_client_id' ? 'test-id' : k === 'sendpulse_client_secret' ? 'test-secret' : null,
  signal: new AbortController().signal
}
const noCredCtx = {
  getSecret: (_: string) => null,
  signal: new AbortController().signal
}

// Очередь ответов fetch: первый вызов — OAuth, последующие — данные операции.
function mockFetchSequence(responses: Array<{ payload: unknown; ok?: boolean; status?: number }>) {
  const queue = [...responses]
  vi.stubGlobal('fetch', vi.fn(async () => {
    const next = queue.shift() ?? { payload: {}, ok: true, status: 200 }
    return {
      ok: next.ok ?? true,
      status: next.status ?? 200,
      text: async () => JSON.stringify(next.payload)
    }
  }) as unknown as typeof fetch)
}

const TOKEN_OK = { payload: { access_token: 'tok-123', token_type: 'Bearer', expires_in: 3600 } }

beforeEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('SendPulse connector', () => {
  it('info() корректен', () => {
    const info = createSendPulseConnector().info()
    expect(info.id).toBe('sendpulse')
    expect(info.label).toBe('SendPulse')
    expect(info.status).toBe('ready')
  })

  it('без креды возвращает no-credentials', async () => {
    const res = await createSendPulseConnector().query({ op: 'get_balance' }, noCredCtx) as { error: string }
    expect(res.error).toBe('no-credentials')
  })

  it('unknown op возвращает список доступных', async () => {
    mockFetchSequence([TOKEN_OK])
    const res = await createSendPulseConnector().query({ op: 'foo' }, ctx) as { error: string; message: string }
    expect(res.error).toBe('unknown-op')
    expect(res.message).toContain('list_mailing_lists')
  })

  it('list_mailing_lists разбирает адресные книги', async () => {
    mockFetchSequence([
      TOKEN_OK,
      { payload: [
        { id: 1, name: 'База клиентов', all_email_qty: 1200, active_email_qty: 1100, extra: 'ignored' },
        { id: 2, name: 'Лиды', all_email_qty: 300, active_email_qty: 280 }
      ] }
    ])
    const res = await createSendPulseConnector().query({ op: 'list_mailing_lists' }, ctx) as {
      count: number; mailing_lists: Array<{ id: number; name: string; active_email_qty: number }>
    }
    expect(res.count).toBe(2)
    expect(res.mailing_lists[0].name).toBe('База клиентов')
    expect(res.mailing_lists[0].active_email_qty).toBe(1100)
    expect((res.mailing_lists[0] as any).extra).toBeUndefined()
  })

  it('list_campaigns разбирает кампании', async () => {
    mockFetchSequence([
      TOKEN_OK,
      { payload: [
        { id: 99, name: 'Акция мая', status: 3, send_date: '2026-05-01 10:00:00', all_email_qty: 500 }
      ] }
    ])
    const res = await createSendPulseConnector().query({ op: 'list_campaigns' }, ctx) as {
      count: number; campaigns: Array<{ id: number; status: number; send_date: string }>
    }
    expect(res.count).toBe(1)
    expect(res.campaigns[0].id).toBe(99)
    expect(res.campaigns[0].send_date).toBe('2026-05-01 10:00:00')
  })

  it('get_balance разбирает баланс (плоский ответ)', async () => {
    mockFetchSequence([
      TOKEN_OK,
      { payload: { currency: 'RUB', balance_main: 1500.5, balance_bonus: 0 } }
    ])
    const res = await createSendPulseConnector().query({ op: 'get_balance' }, ctx) as {
      currency: string; balance_main: number; balance_bonus: number
    }
    expect(res.currency).toBe('RUB')
    expect(res.balance_main).toBe(1500.5)
    expect(res.balance_bonus).toBe(0)
  })

  it('get_balance понимает вложенный detail-ответ', async () => {
    mockFetchSequence([
      TOKEN_OK,
      { payload: { balance: { main: 200, bonus: 50, currency: 'USD' } } }
    ])
    const res = await createSendPulseConnector().query({ op: 'get_balance' }, ctx) as {
      currency: string; balance_main: number; balance_bonus: number
    }
    expect(res.currency).toBe('USD')
    expect(res.balance_main).toBe(200)
    expect(res.balance_bonus).toBe(50)
  })

  it('HTTP 401 пробрасывается понятной ошибкой', async () => {
    mockFetchSequence([
      TOKEN_OK,
      { payload: { error: 'unauthorized' }, ok: false, status: 401 }
    ])
    const res = await createSendPulseConnector().query({ op: 'list_campaigns' }, ctx) as { error: string; message: string }
    expect(res.error).toBe('request-failed')
    expect(res.message).toContain('401')
  })

  it('ошибка OAuth (неверный secret) пробрасывается понятной ошибкой', async () => {
    mockFetchSequence([
      { payload: { error: 'invalid_client' }, ok: false, status: 401 }
    ])
    const res = await createSendPulseConnector().query({ op: 'get_balance' }, ctx) as { error: string; message: string }
    expect(res.error).toBe('request-failed')
    expect(res.message).toContain('auth')
  })
})
