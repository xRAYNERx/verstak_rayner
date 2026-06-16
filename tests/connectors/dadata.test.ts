import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createDaDataConnector } from '../../electron/connectors/dadata'

// Тесты НЕ дёргают реальный DaData. Проверяют:
// 1. Понятную ошибку при отсутствии токена / секрета.
// 2. Валидацию аргументов (пустой query, unknown op).
// 3. info().
// 4. Корректный разбор ответа suggest/findById через мок fetch.

const ctx = {
  getSecret: (k: string) => (k === 'dadata_api_key' ? 'test-token' : null),
  signal: new AbortController().signal
}
const ctxWithSecret = {
  getSecret: (k: string) => (k === 'dadata_api_key' ? 'test-token' : k === 'dadata_secret' ? 'test-secret' : null),
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

describe('DaData connector', () => {
  it('info() корректен', () => {
    const info = createDaDataConnector().info()
    expect(info.id).toBe('dadata')
    expect(info.label).toBe('DaData')
  })

  it('без токена возвращает no-token', async () => {
    const res = await createDaDataConnector().query({ op: 'find_party', query: '7707083893' }, noCredCtx) as { error: string }
    expect(res.error).toBe('no-token')
  })

  it('unknown op возвращает список доступных', async () => {
    const res = await createDaDataConnector().query({ op: 'foo' }, ctx) as { error: string; message: string }
    expect(res.error).toBe('unknown-op')
    expect(res.message).toContain('find_party')
  })

  it('find_party без query — bad-args', async () => {
    const res = await createDaDataConnector().query({ op: 'find_party' }, ctx) as { error: string }
    expect(res.error).toBe('bad-args')
  })

  it('clean_address без секрета — no-secret', async () => {
    const res = await createDaDataConnector().query({ op: 'clean_address', query: 'мск тверская 1' }, ctx) as { error: string }
    expect(res.error).toBe('no-secret')
  })

  it('find_party разбирает реквизиты контрагента', async () => {
    mockFetchOnce({
      suggestions: [{
        value: 'ПАО СБЕРБАНК',
        data: {
          inn: '7707083893', kpp: '773601001', ogrn: '1027700132195', type: 'LEGAL',
          name: { short_with_opf: 'ПАО СБЕРБАНК' },
          state: { status: 'ACTIVE' },
          management: { name: 'Греф Герман Оскарович' },
          address: { unrestricted_value: 'г Москва, ул Вавилова, д 19' }
        }
      }]
    })
    const res = await createDaDataConnector().query({ op: 'find_party', query: '7707083893' }, ctx) as {
      found: boolean; parties: Array<{ inn: string; status: string; management: string }>
    }
    expect(res.found).toBe(true)
    expect(res.parties[0].inn).toBe('7707083893')
    expect(res.parties[0].status).toBe('ACTIVE')
    expect(res.parties[0].management).toContain('Греф')
  })

  it('find_party без совпадений — found:false', async () => {
    mockFetchOnce({ suggestions: [] })
    const res = await createDaDataConnector().query({ op: 'find_party', query: '0000000000' }, ctx) as { found: boolean }
    expect(res.found).toBe(false)
  })

  it('suggest_address возвращает нормализованные поля', async () => {
    mockFetchOnce({
      suggestions: [{
        value: 'г Москва, ул Тверская',
        unrestricted_value: 'г Москва, ул Тверская',
        data: { postal_code: '125009', city_with_type: 'г Москва', street_with_type: 'ул Тверская', qc: 1 }
      }]
    })
    const res = await createDaDataConnector().query({ op: 'suggest_address', query: 'тверская' }, ctx) as {
      suggestions: Array<{ postal_code: string; city: string }>
    }
    expect(res.suggestions[0].postal_code).toBe('125009')
    expect(res.suggestions[0].city).toBe('г Москва')
  })

  it('HTTP 403 пробрасывается понятной ошибкой', async () => {
    mockFetchOnce({ message: 'forbidden' }, false, 403)
    const res = await createDaDataConnector().query({ op: 'suggest_party', query: 'сбер' }, ctx) as { error: string; message: string }
    expect(res.error).toBe('request-failed')
    expect(res.message).toContain('403')
  })

  it('clean_address с секретом стандартизует адрес', async () => {
    mockFetchOnce([{ result: 'г Москва, ул Тверская, д 1', postal_code: '125009', qc: 0 }])
    const res = await createDaDataConnector().query({ op: 'clean_address', query: 'мск тверская 1' }, ctxWithSecret) as {
      cleaned: boolean; result: { value: string; postal_code: string }
    }
    expect(res.cleaned).toBe(true)
    expect(res.result.postal_code).toBe('125009')
  })
})
