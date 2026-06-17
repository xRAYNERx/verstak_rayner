import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'

/**
 * C3: get_file для директории — GitHub Contents API отдаёт МАССИВ записей, у
 * которого нет поля .type. Ветка `if (file.type === 'dir')` была мёртвой →
 * dir-листинг не работал (падал в file-обработку). Фикс: Array.isArray(data).
 *
 * github.ts использует native https.request (import * as https from 'https') —
 * ESM-namespace нельзя spyOn, поэтому мокаем модуль через vi.mock + vi.hoisted.
 */
const { requestMock } = vi.hoisted(() => ({ requestMock: vi.fn() }))
vi.mock('https', () => ({ request: requestMock, default: { request: requestMock } }))

const { createGitHubConnector } = await import('../../electron/connectors/github')

const ctx = {
  getSecret: (k: string) => (k === 'github_token' ? 'ghtok' : null),
  signal: new AbortController().signal,
}

function mockGithubResponse(body: unknown, statusCode = 200) {
  requestMock.mockImplementation((_opts: unknown, cb: (res: unknown) => void) => {
    const req = new EventEmitter() as EventEmitter & { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }
    req.write = vi.fn()
    req.end = vi.fn(() => {
      const res = new EventEmitter() as EventEmitter & { statusCode: number; headers: Record<string, string> }
      res.statusCode = statusCode
      res.headers = { 'x-ratelimit-remaining': '5000', 'x-ratelimit-reset': '0' }
      queueMicrotask(() => {
        cb(res)
        res.emit('data', Buffer.from(JSON.stringify(body), 'utf8'))
        res.emit('end')
      })
    })
    req.destroy = vi.fn()
    return req
  })
}

beforeEach(() => { requestMock.mockReset() })

describe('GitHub connector', () => {
  it('get_file директории → листинг (массив-ответ распознан как dir)', async () => {
    mockGithubResponse([
      { name: 'a.ts', type: 'file', size: 10, path: 'src/a.ts' },
      { name: 'b.ts', type: 'file', size: 20, path: 'src/b.ts' },
    ])
    const r = await createGitHubConnector().query(
      { op: 'get_file', repo: 'owner/repo', path: 'src' }, ctx,
    ) as { type?: string; count?: number; entries?: unknown[] }
    expect(r.type).toBe('dir')
    expect(r.count).toBe(2)
    expect(r.entries).toHaveLength(2)
  })
})
