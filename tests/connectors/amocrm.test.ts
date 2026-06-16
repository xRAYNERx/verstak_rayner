import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createAmoCrmConnector } from '../../electron/connectors/amocrm'

// Тесты НЕ дёргают реальный amoCRM. Проверяют:
// 1. info().
// 2. Понятную ошибку при отсутствии креды (поддомен / токен).
// 3. unknown op возвращает список доступных.
// 4. Валидацию аргументов (get_lead без lead_id).
// 5. Корректный разбор _embedded ответа (leads / pipelines).
// 6. Проброс 401/403 понятной ошибкой.

const ctx = {
  getSecret: (k: string) =>
    k === 'amocrm_subdomain' ? 'mycompany' : k === 'amocrm_access_token' ? 'test-token' : null,
  signal: new AbortController().signal
}
const noCredCtx = {
  getSecret: (_: string) => null,
  signal: new AbortController().signal
}
const onlySubdomainCtx = {
  getSecret: (k: string) => (k === 'amocrm_subdomain' ? 'mycompany' : null),
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

describe('amoCRM connector', () => {
  it('info() корректен', () => {
    const info = createAmoCrmConnector().info()
    expect(info.id).toBe('amocrm')
    expect(info.label).toBe('amoCRM')
    expect(info.kind).toBe('amocrm')
    expect(info.status).toBe('ready')
  })

  it('без креды возвращает no-credentials', async () => {
    const res = await createAmoCrmConnector().query({ op: 'list_leads' }, noCredCtx) as { error: string }
    expect(res.error).toBe('no-credentials')
  })

  it('только поддомен без токена — тоже no-credentials', async () => {
    const res = await createAmoCrmConnector().query({ op: 'list_leads' }, onlySubdomainCtx) as { error: string }
    expect(res.error).toBe('no-credentials')
  })

  it('unknown op возвращает список доступных', async () => {
    const res = await createAmoCrmConnector().query({ op: 'foo' }, ctx) as { error: string; message: string }
    expect(res.error).toBe('unknown-op')
    expect(res.message).toContain('list_leads')
  })

  it('get_lead без lead_id — bad-args', async () => {
    const res = await createAmoCrmConnector().query({ op: 'get_lead' }, ctx) as { error: string }
    expect(res.error).toBe('bad-args')
  })

  it('list_leads разбирает _embedded.leads', async () => {
    mockFetchOnce({
      _embedded: {
        leads: [{
          id: 100, name: 'Сделка А', price: 50000, status_id: 142,
          pipeline_id: 1, responsible_user_id: 7,
          created_at: 1700000000, updated_at: 1700001000
        }]
      }
    })
    const res = await createAmoCrmConnector().query({ op: 'list_leads', limit: 10 }, ctx) as {
      count: number; leads: Array<{ id: number; name: string; price: number; status_id: number }>
    }
    expect(res.count).toBe(1)
    expect(res.leads[0].id).toBe(100)
    expect(res.leads[0].name).toBe('Сделка А')
    expect(res.leads[0].price).toBe(50000)
    expect(res.leads[0].status_id).toBe(142)
  })

  it('list_contacts разбирает _embedded.contacts', async () => {
    mockFetchOnce({
      _embedded: {
        contacts: [{ id: 5, name: 'Иван Петров', responsible_user_id: 7, created_at: 1700000000 }]
      }
    })
    const res = await createAmoCrmConnector().query({ op: 'list_contacts' }, ctx) as {
      count: number; contacts: Array<{ id: number; name: string }>
    }
    expect(res.count).toBe(1)
    expect(res.contacts[0].name).toBe('Иван Петров')
  })

  it('list_pipelines разворачивает статусы из _embedded.statuses', async () => {
    mockFetchOnce({
      _embedded: {
        pipelines: [{
          id: 1, name: 'Продажи',
          _embedded: { statuses: [{ id: 142, name: 'Успешно' }, { id: 143, name: 'Закрыто' }] }
        }]
      }
    })
    const res = await createAmoCrmConnector().query({ op: 'list_pipelines' }, ctx) as {
      count: number; pipelines: Array<{ id: number; name: string; statuses: Array<{ id: number; name: string }> }>
    }
    expect(res.count).toBe(1)
    expect(res.pipelines[0].name).toBe('Продажи')
    expect(res.pipelines[0].statuses).toHaveLength(2)
    expect(res.pipelines[0].statuses[0].name).toBe('Успешно')
  })

  it('пустой _embedded — пустой список', async () => {
    mockFetchOnce({ _embedded: {} })
    const res = await createAmoCrmConnector().query({ op: 'list_leads' }, ctx) as { count: number; leads: unknown[] }
    expect(res.count).toBe(0)
    expect(res.leads).toEqual([])
  })

  it('get_lead разбирает плоские поля сделки', async () => {
    mockFetchOnce({ id: 100, name: 'Сделка А', price: 50000, status_id: 142, pipeline_id: 1 })
    const res = await createAmoCrmConnector().query({ op: 'get_lead', lead_id: '100' }, ctx) as {
      id: number; name: string; price: number
    }
    expect(res.id).toBe(100)
    expect(res.name).toBe('Сделка А')
    expect(res.price).toBe(50000)
  })

  it('HTTP 401 пробрасывается понятной ошибкой', async () => {
    mockFetchOnce({ title: 'Unauthorized' }, false, 401)
    const res = await createAmoCrmConnector().query({ op: 'list_leads' }, ctx) as { error: string; message: string }
    expect(res.error).toBe('request-failed')
    expect(res.message).toContain('401')
  })

  it('HTTP 403 пробрасывается понятной ошибкой с подсказкой про токен', async () => {
    mockFetchOnce({ title: 'Forbidden' }, false, 403)
    const res = await createAmoCrmConnector().query({ op: 'list_contacts' }, ctx) as { error: string; message: string }
    expect(res.error).toBe('request-failed')
    expect(res.message).toContain('403')
    expect(res.message).toContain('amocrm_access_token')
  })
})
