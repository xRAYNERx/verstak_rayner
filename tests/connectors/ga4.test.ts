import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createGa4Connector } from '../../electron/connectors/ga4'

// Тесты НЕ дёргают реальный GA4 Data API. Проверяют:
// 1. info().
// 2. Понятную ошибку при отсутствии креды (token/property_id).
// 3. unknown op.
// 4. Валидацию аргументов (пустой список метрик).
// 5. Корректный разбор rows[] через мок fetch (run_report / get_realtime).
// 6. Проброс HTTP 401.

const ctx = {
  getSecret: (k: string) =>
    (k === 'ga4_access_token' ? 'test-token' : k === 'ga4_property_id' ? '123456789' : null),
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

describe('GA4 connector', () => {
  it('info() корректен', () => {
    const info = createGa4Connector().info()
    expect(info.id).toBe('ga4')
    expect(info.label).toBe('Google Analytics 4')
    expect(info.status).toBe('ready')
  })

  it('без креды возвращает no-credentials', async () => {
    const res = await createGa4Connector().query({ op: 'run_report' }, noCredCtx) as { error: string }
    expect(res.error).toBe('no-credentials')
  })

  it('unknown op возвращает список доступных', async () => {
    const res = await createGa4Connector().query({ op: 'foo' }, ctx) as { error: string; message: string }
    expect(res.error).toBe('unknown-op')
    expect(res.message).toContain('run_report')
  })

  it('run_report с пустым списком метрик — bad-args', async () => {
    const res = await createGa4Connector().query({ op: 'run_report', metrics: [] }, ctx) as { error: string }
    expect(res.error).toBe('bad-args')
  })

  it('run_report разворачивает rows в плоские записи', async () => {
    mockFetchOnce({
      rows: [
        { dimensionValues: [{ value: '20260615' }], metricValues: [{ value: '42' }, { value: '50' }, { value: '120' }] },
        { dimensionValues: [{ value: '20260616' }], metricValues: [{ value: '38' }, { value: '44' }, { value: '101' }] }
      ],
      rowCount: 2
    })
    const res = await createGa4Connector().query({ op: 'run_report' }, ctx) as {
      rows: number; rowCount: number
      data: Array<{ date: string; activeUsers: string; sessions: string; screenPageViews: string }>
    }
    expect(res.rows).toBe(2)
    expect(res.rowCount).toBe(2)
    expect(res.data[0].date).toBe('20260615')
    expect(res.data[0].activeUsers).toBe('42')
    expect(res.data[0].sessions).toBe('50')
    expect(res.data[0].screenPageViews).toBe('120')
    expect(res.data[1].date).toBe('20260616')
  })

  it('run_report с кастомными метриками/измерениями использует их как колонки', async () => {
    mockFetchOnce({
      rows: [{ dimensionValues: [{ value: 'organic' }], metricValues: [{ value: '7' }] }],
      rowCount: 1
    })
    const res = await createGa4Connector().query(
      { op: 'run_report', metrics: ['conversions'], dimensions: ['sessionSource'] }, ctx
    ) as { data: Array<{ sessionSource: string; conversions: string }> }
    expect(res.data[0].sessionSource).toBe('organic')
    expect(res.data[0].conversions).toBe('7')
  })

  it('get_realtime разбирает активных пользователей по экранам', async () => {
    mockFetchOnce({
      rows: [{ dimensionValues: [{ value: '/home' }], metricValues: [{ value: '5' }] }],
      rowCount: 1
    })
    const res = await createGa4Connector().query({ op: 'get_realtime' }, ctx) as {
      rows: number; data: Array<{ unifiedScreenName: string; activeUsers: string }>
    }
    expect(res.rows).toBe(1)
    expect(res.data[0].unifiedScreenName).toBe('/home')
    expect(res.data[0].activeUsers).toBe('5')
  })

  it('пустой ответ rows — нулевые записи без ошибки', async () => {
    mockFetchOnce({ rowCount: 0 })
    const res = await createGa4Connector().query({ op: 'run_report' }, ctx) as { rows: number; data: unknown[] }
    expect(res.rows).toBe(0)
    expect(res.data).toEqual([])
  })

  it('HTTP 401 пробрасывается понятной ошибкой', async () => {
    mockFetchOnce({ error: { message: 'invalid credentials' } }, false, 401)
    const res = await createGa4Connector().query({ op: 'run_report' }, ctx) as { error: string; message: string }
    expect(res.error).toBe('request-failed')
    expect(res.message).toContain('401')
  })
})
