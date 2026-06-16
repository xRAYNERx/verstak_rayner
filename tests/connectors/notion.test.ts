import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createNotionConnector } from '../../electron/connectors/notion'

// Тесты НЕ дёргают реальный Notion. Проверяют:
// 1. info().
// 2. Понятную ошибку при отсутствии токена.
// 3. unknown op со списком доступных операций.
// 4. Валидацию аргументов (query_database/get_page без id).
// 5. Корректный разбор ответа search/query_database через мок fetch.
// 6. Проброс HTTP 401 понятной ошибкой.

const ctx = {
  getSecret: (k: string) => (k === 'notion_token' ? 'test-token' : null),
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

describe('Notion connector', () => {
  it('info() корректен', () => {
    const info = createNotionConnector().info()
    expect(info.id).toBe('notion')
    expect(info.label).toBe('Notion')
    expect(info.status).toBe('ready')
  })

  it('без токена возвращает no-token', async () => {
    const res = await createNotionConnector().query({ op: 'search' }, noCredCtx) as { error: string }
    expect(res.error).toBe('no-token')
  })

  it('unknown op возвращает список доступных', async () => {
    const res = await createNotionConnector().query({ op: 'foo' }, ctx) as { error: string; message: string }
    expect(res.error).toBe('unknown-op')
    expect(res.message).toContain('search')
    expect(res.message).toContain('query_database')
    expect(res.message).toContain('get_page')
  })

  it('query_database без database_id — bad-args', async () => {
    const res = await createNotionConnector().query({ op: 'query_database' }, ctx) as { error: string }
    expect(res.error).toBe('bad-args')
  })

  it('get_page без page_id — bad-args', async () => {
    const res = await createNotionConnector().query({ op: 'get_page' }, ctx) as { error: string }
    expect(res.error).toBe('bad-args')
  })

  it('search вытаскивает title из properties и url', async () => {
    mockFetchOnce({
      results: [{
        object: 'page',
        id: 'page-123',
        url: 'https://www.notion.so/page-123',
        properties: {
          Name: {
            type: 'title',
            title: [{ plain_text: 'Бриф клиента Альфа' }]
          }
        }
      }]
    })
    const res = await createNotionConnector().query({ op: 'search', query: 'бриф' }, ctx) as {
      count: number; results: Array<{ id: string; object: string; title: string; url: string }>
    }
    expect(res.count).toBe(1)
    expect(res.results[0].id).toBe('page-123')
    expect(res.results[0].object).toBe('page')
    expect(res.results[0].title).toBe('Бриф клиента Альфа')
    expect(res.results[0].url).toContain('notion.so')
  })

  it('query_database компактит properties по типам', async () => {
    mockFetchOnce({
      results: [{
        id: 'row-1',
        url: 'https://www.notion.so/row-1',
        properties: {
          Задача: { type: 'title', title: [{ plain_text: 'Сверстать лендинг' }] },
          Статус: { type: 'status', status: { name: 'В работе' } },
          Приоритет: { type: 'select', select: { name: 'Высокий' } },
          Готово: { type: 'checkbox', checkbox: false },
          Срок: { type: 'date', date: { start: '2026-06-20' } }
        }
      }]
    })
    const res = await createNotionConnector().query({ op: 'query_database', database_id: 'db-xyz' }, ctx) as {
      count: number; results: Array<{ id: string; properties: Record<string, unknown> }>
    }
    expect(res.count).toBe(1)
    expect(res.results[0].id).toBe('row-1')
    expect(res.results[0].properties.Задача).toBe('Сверстать лендинг')
    expect(res.results[0].properties.Статус).toBe('В работе')
    expect(res.results[0].properties.Приоритет).toBe('Высокий')
    expect(res.results[0].properties.Готово).toBe(false)
    expect(res.results[0].properties.Срок).toBe('2026-06-20')
  })

  it('get_page возвращает id/url/properties', async () => {
    mockFetchOnce({
      object: 'page',
      id: 'page-777',
      url: 'https://www.notion.so/page-777',
      properties: {
        Name: { type: 'title', title: [{ plain_text: 'Контент-план июнь' }] }
      }
    })
    const res = await createNotionConnector().query({ op: 'get_page', page_id: 'page-777' }, ctx) as {
      id: string; url: string; properties: Record<string, unknown>
    }
    expect(res.id).toBe('page-777')
    expect(res.url).toContain('notion.so')
    expect(res.properties.Name).toBe('Контент-план июнь')
  })

  it('HTTP 401 пробрасывается понятной ошибкой', async () => {
    mockFetchOnce({ message: 'unauthorized' }, false, 401)
    const res = await createNotionConnector().query({ op: 'search', query: 'x' }, ctx) as { error: string; message: string }
    expect(res.error).toBe('request-failed')
    expect(res.message).toContain('401')
  })
})
