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
  it('raw-CDN даёт версию даже когда GitHub API под rate-limit (403)', async () => {
    // Ядро фикса 1.5.12: версия берётся из raw package.json (CDN, не ест лимит),
    // поэтому даже когда api.github.com отвечает 403 rate-limit — версия найдена.
    stubFetch(async (url) => {
      if (url.includes('raw.githubusercontent')) {
        return { ok: true, status: 200, headers: headers({}), json: async () => ({ version: '1.5.11' }) }
      }
      // latest.yml redirect + api.github.com — всё под rate-limit.
      return {
        ok: false, status: 403,
        headers: headers({ 'x-ratelimit-remaining': '0' }),
        text: async () => '', json: async () => ({}),
        clone: () => ({ text: async () => '' }),
      }
    })
    const { fetchRemoteVersion } = await import('../electron/update-remote')
    const probe = await fetchRemoteVersion()
    expect(probe.version).toBe('1.5.11')
  })

  it('parseGithubRateLimit: 403 + remaining:0 → возвращает rate-limit info', async () => {
    const reset = Math.floor(Date.now() / 1000) + 3600
    const res = {
      status: 403,
      headers: headers({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) }),
      clone: () => ({ text: async () => '' }),
    } as unknown as Response
    const { parseGithubRateLimit, rateLimitWaitMinutes } = await import('../electron/update-remote')
    const info = await parseGithubRateLimit(res)
    expect(info).not.toBeNull()
    expect(info!.retryAfterSec).toBeGreaterThan(0)
    expect(rateLimitWaitMinutes(info!)).toBeGreaterThanOrEqual(1)
  })
})
