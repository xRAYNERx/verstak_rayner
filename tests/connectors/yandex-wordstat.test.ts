import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createYandexWordstatConnector,
  wordstatApiPost,
  WORDSTAT_API_HOST,
} from '../../electron/connectors/yandex-wordstat'
import https from 'node:https'
import { EventEmitter } from 'node:events'

const ctx = {
  getSecret: (k: string) => (k === 'yandex_wordstat_token' ? 'tok-wordstat' : null),
  signal: new AbortController().signal
}
const noCred = { getSecret: (_: string) => null, signal: new AbortController().signal }

type MockResponse = { statusCode: number; body: string }

function mockWordstatHttps(handler: (path: string, payload: string) => MockResponse) {
  vi.spyOn(https, 'request').mockImplementation((_opts, cb) => {
    const req = new EventEmitter() as EventEmitter & {
      write: ReturnType<typeof vi.fn>
      end: ReturnType<typeof vi.fn>
      destroy: ReturnType<typeof vi.fn>
    }
    req.write = vi.fn()
    req.end = vi.fn(() => {
      const opts = _opts as { path?: string }
      const path = String(opts.path ?? '')
      let payload = ''
      if (req.write.mock.calls.length > 0) payload = String(req.write.mock.calls[0][0] ?? '')
      const mock = handler(path, payload)
      const res = new EventEmitter() as EventEmitter & { statusCode: number }
      res.statusCode = mock.statusCode
      queueMicrotask(() => {
        // https.request overload: cb выводится как RequestOptions — кастуем к колбэку.
        ;(cb as unknown as ((res: import('node:http').IncomingMessage) => void) | undefined)?.(res as unknown as import('node:http').IncomingMessage)
        res.emit('data', Buffer.from(mock.body, 'utf8'))
        res.emit('end')
      })
    })
    req.destroy = vi.fn((err?: Error) => {
      if (err) req.emit('error', err)
    })
    queueMicrotask(() => req.emit('socket'))
    return req as unknown as ReturnType<typeof https.request>
  })
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('Yandex.Wordstat connector (new API)', () => {
  it('info() корректен', () => {
    expect(createYandexWordstatConnector().info().id).toBe('yandex_wordstat')
  })

  it('без токена — no-token', async () => {
    const r = await createYandexWordstatConnector().query({ op: 'get_top_requests', phrase: 'x' }, noCred) as { error: string }
    expect(r.error).toBe('no-token')
  })

  it('unknown op', async () => {
    const r = await createYandexWordstatConnector().query({ op: 'legacy_direct' }, ctx) as { error: string }
    expect(r.error).toBe('unknown-op')
  })

  it('get_top_requests без phrase — bad-args', async () => {
    const r = await createYandexWordstatConnector().query({ op: 'get_top_requests' }, ctx) as { error: string }
    expect(r.error).toBe('bad-args')
  })

  it('get_wordstat без phrases — bad-args', async () => {
    const r = await createYandexWordstatConnector().query({ op: 'get_wordstat' }, ctx) as { error: string }
    expect(r.error).toBe('bad-args')
  })

  // C5: phrases строкой (а не массивом) раньше ронял .filter (?. не спасает) →
  // request-failed «filter is not a function» вместо понятного bad-args.
  it('get_wordstat с phrases-строкой — bad-args, не краш', async () => {
    const r = await createYandexWordstatConnector().query({ op: 'get_wordstat', phrases: 'купить диван' }, ctx) as { error: string }
    expect(r.error).toBe('bad-args')
  })

  it('get_top_requests парсит topRequests и associations', async () => {
    mockWordstatHttps((path) => {
      expect(path).toBe('/v1/topRequests')
      return {
        statusCode: 200,
        body: JSON.stringify({
          requestPhrase: 'купить диван',
          totalCount: 5400,
          topRequests: [
            { phrase: 'купить диван', count: 5400 },
            { phrase: 'купить диван москва', count: 800 }
          ],
          associations: [{ phrase: 'диван недорого', count: 1200 }]
        })
      }
    })
    const r = await createYandexWordstatConnector().query({
      op: 'get_top_requests',
      phrase: 'купить диван',
      regions: [213],
      num_phrases: 100
    }, ctx) as {
      phrase: string
      total_count: number
      top_requests: Array<{ phrase: string; count: number }>
      searched_also: Array<{ phrase: string; shows: number }>
    }
    expect(r.phrase).toBe('купить диван')
    expect(r.total_count).toBe(5400)
    expect(r.top_requests[1].count).toBe(800)
    expect(r.searched_also[0].shows).toBe(1200)
  })

  it('get_wordstat батчит несколько phrases', async () => {
    const seen: string[] = []
    mockWordstatHttps((path, payload) => {
      const body = JSON.parse(payload) as { phrase: string }
      seen.push(body.phrase)
      return {
        statusCode: 200,
        body: JSON.stringify({
          requestPhrase: body.phrase,
          totalCount: 10,
          topRequests: [{ phrase: body.phrase, count: 10 }],
          associations: []
        })
      }
    })
    const r = await createYandexWordstatConnector().query({
      op: 'get_wordstat',
      phrases: ['диван', 'кресло']
    }, ctx) as { count: number; results: Array<{ phrase: string }> }
    expect(r.count).toBe(2)
    expect(r.results.map(x => x.phrase)).toEqual(['диван', 'кресло'])
    expect(seen).toEqual(['диван', 'кресло'])
  })

  it('get_regions_tree', async () => {
    mockWordstatHttps((path) => {
      expect(path).toBe('/v1/getRegionsTree')
      return { statusCode: 200, body: JSON.stringify([{ value: '225', label: 'Россия', children: [] }]) }
    })
    const r = await createYandexWordstatConnector().query({ op: 'get_regions_tree' }, ctx) as { tree: unknown[] }
    expect(Array.isArray(r.tree)).toBe(true)
  })

  it('HTTP 401 даёт понятную ошибку', async () => {
    mockWordstatHttps(() => ({ statusCode: 401, body: '{"message":"unauthorized"}' }))
    const r = await createYandexWordstatConnector().query({ op: 'get_top_requests', phrase: 'x' }, ctx) as { error: string; message: string }
    expect(r.error).toBe('request-failed')
    expect(r.message).toContain('401')
  })

  it('wordstatApiPost использует api.wordstat.yandex.net', async () => {
    mockWordstatHttps(() => ({ statusCode: 200, body: '{"ok":true}' }))
    await wordstatApiPost('/getRegionsTree', 'tok', {}, ctx)
    expect(https.request).toHaveBeenCalled()
    const opts = vi.mocked(https.request).mock.calls[0][0] as { hostname?: string; servername?: string }
    expect(opts.hostname).toBe(WORDSTAT_API_HOST)
    expect(opts.servername).toBe('wordstat.yandex.ru')
  })
})