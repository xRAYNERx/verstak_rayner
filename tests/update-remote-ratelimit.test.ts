import { describe, it, expect, vi, afterEach } from 'vitest'

/**
 * У пользователей ломалось автообновление: апдейтер часто дёргал GitHub API
 * (releases/latest + tags + release-notes), у неавторизованного API лимит 60/час
 * на IP → 403 → fetchRemoteVersion возвращал null → «обновлений нет». Фикс:
 * версию берём из raw package.json (CDN, не ест лимит API), кэшируем 20 мин,
 * детектим 403 rate-limit и backoff'имся.
 */
function headers(map: Record<string, string>) {
  return { get: (h: string) => map[h.toLowerCase()] ?? null }
}
function stubFetch(handler: (url: string) => Promise<unknown>) {
  vi.stubGlobal('fetch', vi.fn((url: string) => handler(String(url))))
}

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })

describe('update-remote: устойчивость к GitHub API rate-limit', () => {
  it('версию берёт из raw package.json, БЕЗ вызова api.github.com', async () => {
    const calls: string[] = []
    stubFetch(async (url) => {
      calls.push(url)
      if (url.includes('raw.githubusercontent')) return { ok: true, status: 200, headers: headers({}), json: async () => ({ version: '1.5.11' }) }
      return { ok: true, status: 200, headers: headers({}), json: async () => ({ tag_name: 'v0.0.1' }) }
    })
    const { fetchRemoteVersion } = await import('../electron/update-remote')
    expect(await fetchRemoteVersion()).toBe('1.5.11')
    expect(calls.some(u => u.includes('api.github.com'))).toBe(false)
  })

  it('кэширует версию — повторный вызов в окне TTL не ходит в сеть', async () => {
    let n = 0
    stubFetch(async () => { n++; return { ok: true, status: 200, headers: headers({}), json: async () => ({ version: '1.5.11' }) } })
    const { fetchRemoteVersion } = await import('../electron/update-remote')
    await fetchRemoteVersion()
    const after = n
    await fetchRemoteVersion()
    expect(n).toBe(after)
  })

  it('403 + remaining:0 → isGithubRateLimited становится true', async () => {
    const reset = String(Math.floor(Date.now() / 1000) + 3600)
    stubFetch(async (url) => {
      if (url.includes('raw.githubusercontent')) return { ok: false, status: 404, headers: headers({}), json: async () => ({}) }
      return { ok: false, status: 403, headers: headers({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': reset }), json: async () => ({}) }
    })
    const mod = await import('../electron/update-remote')
    await mod.fetchRemoteVersion() // raw 404 → API 403 → фиксируем rate-limit
    expect(mod.isGithubRateLimited()).toBe(true)
  })
})
