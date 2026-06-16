import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createJiraConnector } from '../../electron/connectors/jira'

// Тесты НЕ дёргают реальную Jira. Проверяют:
// 1. info().
// 2. no-credentials при отсутствии любой из трёх кред.
// 3. unknown op со списком доступных.
// 4. Валидацию аргументов (get_issue без issue_key).
// 5. Корректный разбор ответа search/get/projects через мок fetch.
// 6. HTTP 401 → понятная ошибка.

const ctx = {
  getSecret: (k: string) =>
    k === 'jira_base_url' ? 'https://company.atlassian.net' :
    k === 'jira_email' ? 'user@company.ru' :
    k === 'jira_api_token' ? 'test-token' : null,
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

describe('Jira connector', () => {
  it('info() корректен', () => {
    const info = createJiraConnector().info()
    expect(info.id).toBe('jira')
    expect(info.label).toBe('Jira')
    expect(info.status).toBe('ready')
  })

  it('без кред возвращает no-credentials', async () => {
    const res = await createJiraConnector().query({ op: 'search_issues' }, noCredCtx) as { error: string }
    expect(res.error).toBe('no-credentials')
  })

  it('unknown op возвращает список доступных', async () => {
    const res = await createJiraConnector().query({ op: 'foo' }, ctx) as { error: string; message: string }
    expect(res.error).toBe('unknown-op')
    expect(res.message).toContain('search_issues')
  })

  it('get_issue без issue_key — bad-args', async () => {
    const res = await createJiraConnector().query({ op: 'get_issue' }, ctx) as { error: string }
    expect(res.error).toBe('bad-args')
  })

  it('search_issues разбирает задачи', async () => {
    mockFetchOnce({
      issues: [{
        key: 'PROJ-1',
        fields: {
          summary: 'Починить форму',
          status: { name: 'In Progress' },
          assignee: { displayName: 'Иван Иванов' },
          created: '2026-06-01T10:00:00.000+0300'
        }
      }]
    })
    const res = await createJiraConnector().query({ op: 'search_issues', jql: 'project = PROJ', max: 10 }, ctx) as {
      count: number; issues: Array<{ key: string; summary: string; status: string; assignee: string }>
    }
    expect(res.count).toBe(1)
    expect(res.issues[0].key).toBe('PROJ-1')
    expect(res.issues[0].summary).toBe('Починить форму')
    expect(res.issues[0].status).toBe('In Progress')
    expect(res.issues[0].assignee).toBe('Иван Иванов')
  })

  it('search_issues без issues — count:0', async () => {
    mockFetchOnce({ issues: [] })
    const res = await createJiraConnector().query({ op: 'search_issues' }, ctx) as { count: number; issues: unknown[] }
    expect(res.count).toBe(0)
    expect(res.issues).toEqual([])
  })

  it('get_issue возвращает плоские поля', async () => {
    mockFetchOnce({
      key: 'PROJ-42',
      fields: {
        summary: 'Релиз',
        status: { name: 'Done' },
        assignee: null,
        created: '2026-05-20T09:00:00.000+0300'
      }
    })
    const res = await createJiraConnector().query({ op: 'get_issue', issue_key: 'PROJ-42' }, ctx) as {
      key: string; status: string; assignee: string | null
    }
    expect(res.key).toBe('PROJ-42')
    expect(res.status).toBe('Done')
    expect(res.assignee).toBe(null)
  })

  it('list_projects разбирает values', async () => {
    mockFetchOnce({
      values: [
        { id: '10000', key: 'PROJ', name: 'Проект клиента' },
        { id: '10001', key: 'OPS', name: 'Операции' }
      ]
    })
    const res = await createJiraConnector().query({ op: 'list_projects' }, ctx) as {
      count: number; projects: Array<{ id: string; key: string; name: string }>
    }
    expect(res.count).toBe(2)
    expect(res.projects[0].key).toBe('PROJ')
    expect(res.projects[1].name).toBe('Операции')
  })

  it('HTTP 401 пробрасывается понятной ошибкой', async () => {
    mockFetchOnce({ errorMessages: ['Unauthorized'] }, false, 401)
    const res = await createJiraConnector().query({ op: 'search_issues' }, ctx) as { error: string; message: string }
    expect(res.error).toBe('request-failed')
    expect(res.message).toContain('401')
  })
})
