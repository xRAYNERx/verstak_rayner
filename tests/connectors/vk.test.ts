import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createVkConnector } from '../../electron/connectors/vk'

// Тесты НЕ дёргают реальный VK. Проверяют:
// 1. info().
// 2. Понятную ошибку при отсутствии токена.
// 3. unknown op со списком операций.
// 4. Валидацию аргументов (пустой group_id / owner_id / user_ids).
// 5. Корректный разбор ответа group_info / wall_get / users_get через мок fetch.
// 6. Проброс VK error и HTTP 401/403.

const ctx = {
  getSecret: (k: string) => (k === 'vk_access_token' ? 'test-token' : null),
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

describe('VK connector', () => {
  it('info() корректен', () => {
    const info = createVkConnector().info()
    expect(info.id).toBe('vk')
    expect(info.label).toBe('VK')
    expect(info.status).toBe('ready')
  })

  it('без токена возвращает no-token', async () => {
    const res = await createVkConnector().query({ op: 'group_info', group_id: '1' }, noCredCtx) as { error: string }
    expect(res.error).toBe('no-token')
  })

  it('unknown op возвращает список доступных', async () => {
    const res = await createVkConnector().query({ op: 'foo' }, ctx) as { error: string; message: string }
    expect(res.error).toBe('unknown-op')
    expect(res.message).toContain('group_info')
  })

  it('group_info без group_id — bad-args', async () => {
    const res = await createVkConnector().query({ op: 'group_info' }, ctx) as { error: string }
    expect(res.error).toBe('bad-args')
  })

  it('wall_get без owner_id — bad-args (с напоминанием про отрицательный id)', async () => {
    const res = await createVkConnector().query({ op: 'wall_get' }, ctx) as { error: string; message: string }
    expect(res.error).toBe('bad-args')
    expect(res.message).toContain('отрицательный')
  })

  it('users_get без user_ids — bad-args', async () => {
    const res = await createVkConnector().query({ op: 'users_get' }, ctx) as { error: string }
    expect(res.error).toBe('bad-args')
  })

  it('group_info разбирает данные сообщества', async () => {
    mockFetchOnce({
      response: [{
        id: 1, name: 'Команда ВКонтакте', screen_name: 'team',
        members_count: 1234567, description: 'Официальное сообщество', activity: 'Открытая группа'
      }]
    })
    const res = await createVkConnector().query({ op: 'group_info', group_id: 'team' }, ctx) as {
      id: number; name: string; members_count: number; screen_name: string
    }
    expect(res.id).toBe(1)
    expect(res.name).toBe('Команда ВКонтакте')
    expect(res.members_count).toBe(1234567)
    expect(res.screen_name).toBe('team')
  })

  it('wall_get разбирает посты с метриками', async () => {
    mockFetchOnce({
      response: {
        count: 2,
        items: [{
          id: 100, date: 1700000000, text: 'Пост',
          likes: { count: 10 }, reposts: { count: 3 }, views: { count: 500 }, comments: { count: 2 }
        }]
      }
    })
    const res = await createVkConnector().query({ op: 'wall_get', owner_id: '-1', count: 5 }, ctx) as {
      count: number; posts: Array<{ id: number; likes: number; views: number; comments: number }>
    }
    expect(res.count).toBe(1)
    expect(res.posts[0].id).toBe(100)
    expect(res.posts[0].likes).toBe(10)
    expect(res.posts[0].views).toBe(500)
    expect(res.posts[0].comments).toBe(2)
  })

  it('users_get разбирает пользователей', async () => {
    mockFetchOnce({
      response: [{
        id: 1, first_name: 'Павел', last_name: 'Дуров',
        followers_count: 9999999, city: { id: 2, title: 'Санкт-Петербург' }
      }]
    })
    const res = await createVkConnector().query({ op: 'users_get', user_ids: 'durov' }, ctx) as {
      count: number; users: Array<{ first_name: string; followers_count: number; city: string }>
    }
    expect(res.count).toBe(1)
    expect(res.users[0].first_name).toBe('Павел')
    expect(res.users[0].followers_count).toBe(9999999)
    expect(res.users[0].city).toBe('Санкт-Петербург')
  })

  it('VK error пробрасывается понятной ошибкой', async () => {
    mockFetchOnce({ error: { error_code: 5, error_msg: 'User authorization failed' } })
    const res = await createVkConnector().query({ op: 'users_get', user_ids: 'durov' }, ctx) as { error: string; message: string }
    expect(res.error).toBe('request-failed')
    expect(res.message).toContain('VK error 5')
    expect(res.message).toContain('User authorization failed')
  })

  it('HTTP 403 пробрасывается понятной ошибкой', async () => {
    mockFetchOnce({ error_msg: 'forbidden' }, false, 403)
    const res = await createVkConnector().query({ op: 'group_info', group_id: 'team' }, ctx) as { error: string; message: string }
    expect(res.error).toBe('request-failed')
    expect(res.message).toContain('403')
  })
})
