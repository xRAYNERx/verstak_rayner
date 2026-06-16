/**
 * Яндекс.Wordstat connector — частотность ключевых слов для семантики РК.
 *
 * Своя реализация поверх Яндекс.Директ API v4 (live JSON) — Wordstat там
 * асинхронный: CreateNewWordstatReport → опрос GetWordstatReportList до
 * StatusReport=Done → GetWordstatReport → DeleteWordstatReport (чистим слот,
 * их лимит ~5 на аккаунт).
 *
 * Зачем агентству: подбор и оценка частотности ключевых фраз при настройке
 * рекламных кампаний (что и сколько ищут, связанные запросы).
 *
 * Credentials (settings keys):
 *   yandex_wordstat_token — OAuth token (scope direct). Если не задан —
 *                           fallback на yandex_direct_token (Wordstat = часть Директа).
 *
 * Операции (args.op):
 *   get_wordstat — частотность по фразам (phrases: string[], geo_id?: number[]).
 */

import type { Connector, ConnectorInfo, ConnectorContext } from './types'

const LIVE_V4 = 'https://api.direct.yandex.ru/live/v4/json/'
const POLL_ATTEMPTS = 8
const POLL_DELAY_MS = 2500

export function createYandexWordstatConnector(): Connector {
  return {
    info(): ConnectorInfo {
      return {
        id: 'yandex_wordstat',
        label: 'Яндекс.Wordstat',
        kind: 'yandex_wordstat',
        status: 'ready',
        detail: 'Частотность ключевых слов. Token в settings (yandex_wordstat_token или yandex_direct_token).'
      }
    },

    async query(args: Record<string, unknown>, ctx: ConnectorContext): Promise<unknown> {
      const op = String(args.op ?? '')
      const token = ctx.getSecret('yandex_wordstat_token') ?? ctx.getSecret('yandex_direct_token')
      if (!token) {
        return {
          error: 'no-token',
          message: 'Wordstat token не настроен. Settings → Яндекс.Wordstat (или Яндекс.Директ). ' +
                   'OAuth с доступом к Директу: oauth.yandex.ru, scope direct.'
        }
      }
      if (op !== 'get_wordstat') {
        return { error: 'unknown-op', message: `Неизвестная op «${op}». Доступно: get_wordstat.` }
      }
      try {
        return await getWordstat(token, args, ctx)
      } catch (err) {
        return { error: 'request-failed', message: err instanceof Error ? err.message : String(err), op }
      }
    }
  }
}

// ----------------------------------------------------------------- op

async function getWordstat(token: string, args: Record<string, unknown>, ctx: ConnectorContext): Promise<unknown> {
  const phrases = (args.phrases as string[] | undefined)?.filter(p => typeof p === 'string' && p.trim()) ?? []
  if (phrases.length === 0) {
    return { error: 'bad-args', message: 'get_wordstat требует phrases: string[] (ключевые фразы).' }
  }
  const geoId = (args.geo_id as number[] | undefined) ?? []
  const param: Record<string, unknown> = { Phrases: phrases.slice(0, 10) }
  if (geoId.length > 0) param.GeoID = geoId

  // 1. Создаём отчёт → ReportID.
  const reportId = await call(token, 'CreateNewWordstatReport', param, ctx) as number
  if (typeof reportId !== 'number') throw new Error('Wordstat не вернул ReportID')

  try {
    // 2. Опрашиваем список отчётов до готовности.
    let ready = false
    for (let i = 0; i < POLL_ATTEMPTS; i++) {
      const list = await call(token, 'GetWordstatReportList', null, ctx) as Array<{ ReportID: number; StatusReport: string }>
      const mine = Array.isArray(list) ? list.find(r => r.ReportID === reportId) : undefined
      if (mine && mine.StatusReport === 'Done') { ready = true; break }
      await new Promise(r => setTimeout(r, POLL_DELAY_MS))
    }
    if (!ready) {
      return { processing: true, report_id: reportId, message: 'Отчёт Wordstat ещё готовится. Повтори запрос чуть позже.' }
    }

    // 3. Забираем данные.
    const data = await call(token, 'GetWordstatReport', reportId, ctx) as Array<Record<string, any>>
    const results = (Array.isArray(data) ? data : []).map(item => ({
      phrase: item.Phrase,
      searched_with: (item.SearchedWith ?? []).slice(0, 30).map((s: any) => ({ phrase: s.Phrase, shows: s.Shows })),
      searched_also: (item.SearchedAlso ?? []).slice(0, 15).map((s: any) => ({ phrase: s.Phrase, shows: s.Shows }))
    }))
    return { count: results.length, results }
  } finally {
    // 4. Освобождаем слот отчёта (лимит ~5 на аккаунт) — best effort.
    try { await call(token, 'DeleteWordstatReport', reportId, ctx) } catch { /* not critical */ }
  }
}

// ----------------------------------------------------------------- helper

async function call(token: string, method: string, param: unknown, ctx: ConnectorContext): Promise<unknown> {
  const payload: Record<string, unknown> = { method, token, locale: 'ru' }
  if (param !== null && param !== undefined) payload.param = param
  const res = await fetch(LIVE_V4, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
    signal: ctx.signal
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Wordstat ${method} HTTP ${res.status}: ${text.slice(0, 250)}`)
  let json: { data?: unknown; error_code?: number; error_str?: string; error_detail?: string }
  try { json = JSON.parse(text) } catch { throw new Error('Wordstat вернул не-JSON ответ') }
  if (json.error_code) {
    throw new Error(`Wordstat error ${json.error_code}: ${json.error_str ?? ''} ${json.error_detail ?? ''}`.trim())
  }
  return json.data
}
