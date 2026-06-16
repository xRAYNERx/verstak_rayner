import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createTrelloConnector } from '../../electron/connectors/trello'

// Тесты НЕ дёргают реальный Trello. Проверяют:
// 1. info().
// 2. Понятную ошибку при отсутствии key/token.
// 3. unknown op + список доступных.
// 4. Валидацию аргументов (нет board_id / list_id).
// 5. Корректный разбор ответа list_boards/list_lists/list_cards через мок fetch.
// 6. HTTP 401 → понятная request-failed ошибка.

const ctx = {
  getSecret: (k: string) => (k === 'trello_api_key' ? 'test-key' : k === 'trello_token' ? 'test-token' : null),
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

describe('Trello connector', () => {
  it('info() корректен', () => {
    const info = createTrelloConnector().info()
    expect(info.id).toBe('trello')
    expect(info.label).toBe('Trello')
    expect(info.status).toBe('ready')
  })

  it('без креды возвращает no-credentials', async () => {
    const res = await createTrelloConnector().query({ op: 'list_boards' }, noCredCtx) as { error: string }
    expect(res.error).toBe('no-credentials')
  })

  it('unknown op возвращает список доступных', async () => {
    const res = await createTrelloConnector().query({ op: 'foo' }, ctx) as { error: string; message: string }
    expect(res.error).toBe('unknown-op')
    expect(res.message).toContain('list_boards')
  })

  it('list_lists без board_id — bad-args', async () => {
    const res = await createTrelloConnector().query({ op: 'list_lists' }, ctx) as { error: string }
    expect(res.error).toBe('bad-args')
  })

  it('list_cards без list_id — bad-args', async () => {
    const res = await createTrelloConnector().query({ op: 'list_cards' }, ctx) as { error: string }
    expect(res.error).toBe('bad-args')
  })

  it('list_boards разбирает доски', async () => {
    mockFetchOnce([
      { id: '5f1', name: 'Клиент Альфа', url: 'https://trello.com/b/5f1', closed: false, desc: 'лишнее' },
      { id: '5f2', name: 'Архив', url: 'https://trello.com/b/5f2', closed: true }
    ])
    const res = await createTrelloConnector().query({ op: 'list_boards' }, ctx) as {
      count: number; boards: Array<{ id: string; name: string; url: string; closed: boolean }>
    }
    expect(res.count).toBe(2)
    expect(res.boards[0].id).toBe('5f1')
    expect(res.boards[0].name).toBe('Клиент Альфа')
    expect(res.boards[1].closed).toBe(true)
    // лишние поля не протекают
    expect((res.boards[0] as Record<string, unknown>).desc).toBeUndefined()
  })

  it('list_lists разбирает списки доски', async () => {
    mockFetchOnce([
      { id: 'l1', name: 'To Do', closed: false, idBoard: '5f1' },
      { id: 'l2', name: 'Done' }
    ])
    const res = await createTrelloConnector().query({ op: 'list_lists', board_id: '5f1' }, ctx) as {
      count: number; lists: Array<{ id: string; name: string }>
    }
    expect(res.count).toBe(2)
    expect(res.lists[0].id).toBe('l1')
    expect(res.lists[1].name).toBe('Done')
  })

  it('list_cards разбирает карточки списка', async () => {
    mockFetchOnce([
      { id: 'c1', name: 'Сверстать лендинг', due: '2026-07-01T12:00:00.000Z', closed: false, idMembers: ['m1', 'm2'], desc: 'игнор' },
      { id: 'c2', name: 'Настроить РК', due: null, closed: false, idMembers: [] }
    ])
    const res = await createTrelloConnector().query({ op: 'list_cards', list_id: 'l1' }, ctx) as {
      count: number; cards: Array<{ id: string; name: string; due: string | null; idMembers: string[] }>
    }
    expect(res.count).toBe(2)
    expect(res.cards[0].id).toBe('c1')
    expect(res.cards[0].due).toBe('2026-07-01T12:00:00.000Z')
    expect(res.cards[0].idMembers).toEqual(['m1', 'm2'])
    expect(res.cards[1].due).toBeNull()
  })

  it('HTTP 401 пробрасывается понятной ошибкой', async () => {
    mockFetchOnce({ message: 'invalid token' }, false, 401)
    const res = await createTrelloConnector().query({ op: 'list_boards' }, ctx) as { error: string; message: string }
    expect(res.error).toBe('request-failed')
    expect(res.message).toContain('401')
  })
})
