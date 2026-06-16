import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createUniSenderConnector } from '../../electron/connectors/unisender'

// Тесты НЕ дёргают реальный UniSender. Проверяют:
// 1. info().
// 2. Понятную ошибку при отсутствии API-ключа.
// 3. unknown op со списком доступных.
// 4. Валидацию аргументов (get_campaign_stats без campaign_id).
// 5. Корректный разбор ответа getLists/getCampaigns/getCampaignCommonStats через мок fetch.
// 6. {error, code} при HTTP 200 -> request-failed.
// 7. HTTP 401 -> request-failed.

const ctx = {
  getSecret: (k: string) => (k === 'unisender_api_key' ? 'test-key' : null),
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

describe('UniSender connector', () => {
  it('info() корректен', () => {
    const info = createUniSenderConnector().info()
    expect(info.id).toBe('unisender')
    expect(info.label).toBe('UniSender')
    expect(info.status).toBe('ready')
  })

  it('без ключа возвращает no-token', async () => {
    const res = await createUniSenderConnector().query({ op: 'get_lists' }, noCredCtx) as { error: string }
    expect(res.error).toBe('no-token')
  })

  it('unknown op возвращает список доступных', async () => {
    const res = await createUniSenderConnector().query({ op: 'foo' }, ctx) as { error: string; message: string }
    expect(res.error).toBe('unknown-op')
    expect(res.message).toContain('get_lists')
    expect(res.message).toContain('get_campaign_stats')
  })

  it('get_campaign_stats без campaign_id — bad-args', async () => {
    const res = await createUniSenderConnector().query({ op: 'get_campaign_stats' }, ctx) as { error: string }
    expect(res.error).toBe('bad-args')
  })

  it('get_lists разбирает адресные базы', async () => {
    mockFetchOnce({ result: [{ id: 55688, title: 'Список 1' }, { id: 224589, title: 'Второй список' }] })
    const res = await createUniSenderConnector().query({ op: 'get_lists' }, ctx) as {
      count: number; lists: Array<{ id: number; title: string }>
    }
    expect(res.count).toBe(2)
    expect(res.lists[0].id).toBe(55688)
    expect(res.lists[0].title).toBe('Список 1')
  })

  it('get_campaigns разбирает рассылки в плоские поля', async () => {
    mockFetchOnce({
      result: [{
        id: 6626556,
        start_time: '2015-09-28 10:03:59',
        status: 'waits_schedule',
        message_id: 3769465,
        list_id: 123,
        subject: 'Тема письма'
      }]
    })
    const res = await createUniSenderConnector().query({ op: 'get_campaigns' }, ctx) as {
      count: number; campaigns: Array<{ id: number; status: string; subject: string; message_id: number }>
    }
    expect(res.count).toBe(1)
    expect(res.campaigns[0].id).toBe(6626556)
    expect(res.campaigns[0].status).toBe('waits_schedule')
    expect(res.campaigns[0].subject).toBe('Тема письма')
    expect(res.campaigns[0].message_id).toBe(3769465)
  })

  it('get_campaign_stats возвращает result со статистикой', async () => {
    mockFetchOnce({
      result: {
        total: 81962, sent: 81962, delivered: 81737,
        read_unique: 6816, read_all: 8940,
        clicked_unique: 447, clicked_all: 545,
        unsubscribed: 184, spam: 86
      }
    })
    const res = await createUniSenderConnector().query({ op: 'get_campaign_stats', campaign_id: '6626556' }, ctx) as {
      sent: number; delivered: number; read_unique: number
    }
    expect(res.sent).toBe(81962)
    expect(res.delivered).toBe(81737)
    expect(res.read_unique).toBe(6816)
  })

  it('{error, code} при HTTP 200 -> request-failed', async () => {
    mockFetchOnce({ error: 'invalid api_key', code: 'invalid_api_key' })
    const res = await createUniSenderConnector().query({ op: 'get_lists' }, ctx) as { error: string; message: string }
    expect(res.error).toBe('request-failed')
    expect(res.message).toContain('invalid api_key')
    expect(res.message).toContain('invalid_api_key')
  })

  it('HTTP 401 пробрасывается понятной ошибкой', async () => {
    mockFetchOnce({ error: 'unauthorized' }, false, 401)
    const res = await createUniSenderConnector().query({ op: 'get_lists' }, ctx) as { error: string; message: string }
    expect(res.error).toBe('request-failed')
    expect(res.message).toContain('401')
  })
})
