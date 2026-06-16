import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createYandexTrackerConnector } from '../../electron/connectors/yandex-tracker'

// Тесты НЕ дёргают реальный Yandex Tracker. Проверяют:
// 1. info().
// 2. Понятную ошибку при отсутствии креды (нужны оба: token + org_id).
// 3. unknown op со списком доступных.
// 4. Валидацию аргументов (list_issues без queue, get_issue без issue_key).
// 5. Корректный разбор ответа list_queues / list_issues / get_issue через мок fetch.
// 6. Проброс HTTP 401.

const ctx = {
  getSecret: (k: string) =>
    k === 'yandex_tracker_token' ? 'test-token' : k === 'yandex_tracker_org_id' ? 'test-org' : null,
  signal: new AbortController().signal
}
const noTokenCtx = {
  getSecret: (k: string) => (k === 'yandex_tracker_org_id' ? 'test-org' : null),
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

describe('Yandex.Tracker connector', () => {
  it('info() корректен', () => {
    const info = createYandexTrackerConnector().info()
    expect(info.id).toBe('yandex_tracker')
    expect(info.label).toBe('Яндекс.Трекер')
    expect(info.status).toBe('ready')
  })

  it('без org_id возвращает no-credentials', async () => {
    const res = await createYandexTrackerConnector().query({ op: 'list_queues' }, noTokenCtx) as { error: string }
    expect(res.error).toBe('no-credentials')
  })

  it('unknown op возвращает список доступных', async () => {
    const res = await createYandexTrackerConnector().query({ op: 'foo' }, ctx) as { error: string; message: string }
    expect(res.error).toBe('unknown-op')
    expect(res.message).toContain('list_queues')
  })

  it('list_issues без queue — bad-args', async () => {
    const res = await createYandexTrackerConnector().query({ op: 'list_issues' }, ctx) as { error: string }
    expect(res.error).toBe('bad-args')
  })

  it('get_issue без issue_key — bad-args', async () => {
    const res = await createYandexTrackerConnector().query({ op: 'get_issue' }, ctx) as { error: string }
    expect(res.error).toBe('bad-args')
  })

  it('list_queues разбирает очереди', async () => {
    mockFetchOnce([
      { id: 1, key: 'DEV', name: 'Разработка' },
      { id: 2, key: 'SUP', name: 'Поддержка' }
    ])
    const res = await createYandexTrackerConnector().query({ op: 'list_queues' }, ctx) as {
      count: number; queues: Array<{ key: string; name: string }>
    }
    expect(res.count).toBe(2)
    expect(res.queues[0].key).toBe('DEV')
    expect(res.queues[0].name).toBe('Разработка')
  })

  it('list_issues разбирает задачи (status.display, assignee.display)', async () => {
    mockFetchOnce([
      {
        key: 'DEV-1',
        summary: 'Починить логин',
        status: { key: 'open', display: 'Открыт' },
        assignee: { display: 'Иван Петров' }
      },
      {
        key: 'DEV-2',
        summary: 'Без исполнителя',
        status: { key: 'inProgress', display: 'В работе' }
      }
    ])
    const res = await createYandexTrackerConnector().query({ op: 'list_issues', queue: 'DEV' }, ctx) as {
      count: number; issues: Array<{ key: string; summary: string; status: string; assignee: string | null }>
    }
    expect(res.count).toBe(2)
    expect(res.issues[0].key).toBe('DEV-1')
    expect(res.issues[0].status).toBe('Открыт')
    expect(res.issues[0].assignee).toBe('Иван Петров')
    expect(res.issues[1].assignee).toBe(null)
  })

  it('get_issue разбирает одну задачу плоско', async () => {
    mockFetchOnce({
      key: 'DEV-1',
      summary: 'Починить логин',
      description: 'Падает на проде',
      status: { key: 'open', display: 'Открыт' },
      assignee: { display: 'Иван Петров' },
      priority: { key: 'critical', display: 'Критичный' }
    })
    const res = await createYandexTrackerConnector().query({ op: 'get_issue', issue_key: 'DEV-1' }, ctx) as {
      key: string; description: string; status: string; priority: string
    }
    expect(res.key).toBe('DEV-1')
    expect(res.description).toBe('Падает на проде')
    expect(res.status).toBe('Открыт')
    expect(res.priority).toBe('Критичный')
  })

  it('HTTP 401 пробрасывается понятной ошибкой', async () => {
    mockFetchOnce({ errors: {}, statusCode: 401 }, false, 401)
    const res = await createYandexTrackerConnector().query({ op: 'list_queues' }, ctx) as { error: string; message: string }
    expect(res.error).toBe('request-failed')
    expect(res.message).toContain('401')
  })
})
