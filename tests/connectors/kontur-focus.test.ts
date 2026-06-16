import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createKonturFocusConnector } from '../../electron/connectors/kontur-focus'

// Тесты НЕ дёргают реальный Контур.Фокус. Проверяют:
// 1. info().
// 2. Понятную ошибку при отсутствии ключа (no-token).
// 3. Валидацию аргументов (нет inn/ogrn, unknown op).
// 4. Корректный разбор ответа /req (UL и IP) и /analytics через мок fetch.
// 5. Проброс HTTP 401 понятной ошибкой.

const ctx = {
  getSecret: (k: string) => (k === 'kontur_focus_api_key' ? 'test-key' : null),
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

describe('Kontur.Focus connector', () => {
  it('info() корректен', () => {
    const info = createKonturFocusConnector().info()
    expect(info.id).toBe('kontur_focus')
    expect(info.label).toBe('Контур.Фокус')
    expect(info.status).toBe('ready')
  })

  it('без ключа возвращает no-token', async () => {
    const res = await createKonturFocusConnector().query({ op: 'req', inn: '6663003127' }, noCredCtx) as { error: string }
    expect(res.error).toBe('no-token')
  })

  it('unknown op возвращает список доступных', async () => {
    const res = await createKonturFocusConnector().query({ op: 'foo' }, ctx) as { error: string; message: string }
    expect(res.error).toBe('unknown-op')
    expect(res.message).toContain('req')
    expect(res.message).toContain('analytics')
  })

  it('req без inn/ogrn — bad-args', async () => {
    const res = await createKonturFocusConnector().query({ op: 'req' }, ctx) as { error: string }
    expect(res.error).toBe('bad-args')
  })

  it('analytics без inn/ogrn — bad-args', async () => {
    const res = await createKonturFocusConnector().query({ op: 'analytics' }, ctx) as { error: string }
    expect(res.error).toBe('bad-args')
  })

  it('req разбирает реквизиты юрлица (UL)', async () => {
    mockFetchOnce([{
      inn: '6663003127',
      ogrn: '1026605606620',
      focusHref: 'https://focus.kontur.ru/entity?query=6663003127',
      UL: {
        legalName: { short: 'ООО «РОМАШКА»', full: 'Общество с ограниченной ответственностью «РОМАШКА»' },
        kpp: '666301001',
        status: { statusString: 'Действующая' },
        legalAddress: { parsedAddressRF: { regionName: 'Свердловская область', city: 'г Екатеринбург', street: 'ул Ленина', house: 'д 1' } },
        heads: [{ fio: 'Иванов Иван Иванович', position: 'Генеральный директор' }]
      }
    }])
    const res = await createKonturFocusConnector().query({ op: 'req', inn: '6663003127' }, ctx) as {
      found: boolean; parties: Array<{ type: string; name: string; status: string; address: string; manager: { fio: string } }>
    }
    expect(res.found).toBe(true)
    expect(res.parties[0].type).toBe('UL')
    expect(res.parties[0].name).toBe('ООО «РОМАШКА»')
    expect(res.parties[0].status).toBe('Действующая')
    expect(res.parties[0].address).toContain('Екатеринбург')
    expect(res.parties[0].manager.fio).toContain('Иванов')
  })

  it('req разбирает ИП (IP) по ОГРН', async () => {
    mockFetchOnce([{
      inn: '660300000000',
      ogrn: '304660300000000',
      IP: { fio: 'Петров Пётр Петрович', ogrnip: '304660300000000', status: { statusString: 'Действующий' } }
    }])
    const res = await createKonturFocusConnector().query({ op: 'req', ogrn: '304660300000000' }, ctx) as {
      found: boolean; parties: Array<{ type: string; name: string; status: string }>
    }
    expect(res.found).toBe(true)
    expect(res.parties[0].type).toBe('IP')
    expect(res.parties[0].name).toContain('Петров')
    expect(res.parties[0].status).toBe('Действующий')
  })

  it('req с пустым массивом — found:false', async () => {
    mockFetchOnce([])
    const res = await createKonturFocusConnector().query({ op: 'req', inn: '0000000000' }, ctx) as { found: boolean }
    expect(res.found).toBe(false)
  })

  it('analytics разбирает плоские флаги риска', async () => {
    mockFetchOnce([{
      inn: '6663003127',
      ogrn: '1026605606620',
      focusHref: 'https://focus.kontur.ru/entity?query=6663003127',
      isMSP: true,
      isRNP: false,
      hasArbitration: true,
      hasBlockedAccounts: false,
      briefReport: { summary: { greenStatements: 5, yellowStatements: 1, redStatements: 0 } }
    }])
    const res = await createKonturFocusConnector().query({ op: 'analytics', inn: '6663003127' }, ctx) as {
      found: boolean; analytics: Array<{ hasArbitration: boolean; isMSP: boolean; redStatements: number }>
    }
    expect(res.found).toBe(true)
    expect(res.analytics[0].hasArbitration).toBe(true)
    expect(res.analytics[0].isMSP).toBe(true)
    expect(res.analytics[0].redStatements).toBe(0)
  })

  it('HTTP 401 пробрасывается понятной ошибкой', async () => {
    mockFetchOnce({ message: 'unauthorized' }, false, 401)
    const res = await createKonturFocusConnector().query({ op: 'req', inn: '6663003127' }, ctx) as { error: string; message: string }
    expect(res.error).toBe('request-failed')
    expect(res.message).toContain('401')
  })
})
