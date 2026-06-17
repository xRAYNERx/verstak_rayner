/**
 * Яндекс.Wordstat connector — новый Wordstat API (2025+).
 *
 * Официальный хост: https://api.wordstat.yandex.net
 * Auth: Authorization: Bearer {OAuth token}
 *
 * Сертификат выдан на wordstat.yandex.ru, поэтому запросы идут с SNI
 * wordstat.yandex.ru (иначе Node/Electron падает на TLS hostname mismatch).
 *
 * Credentials (settings keys):
 *   yandex_wordstat_token — OAuth token приложения с доступом к Wordstat API
 *                         (oauth.yandex.ru + заявка на доступ по ClientID).
 *
 * Операции (args.op):
 *   get_wordstat      — совместимость: phrases[] → topRequests по каждой фразе.
 *   get_top_requests  — топ запросов с фразой (phrase, regions?, devices?, num_phrases?).
 *   get_dynamics      — динамика спроса (phrase, period, from, to, regions?, devices?).
 *   get_regions       — разбивка по регионам (phrase, region_type?, regions?, devices?).
 *   get_regions_tree  — дерево регионов (без расхода дневной квоты).
 */

import https from 'node:https'
import tls from 'node:tls'
import type { Connector, ConnectorInfo, ConnectorContext } from './types'

export const WORDSTAT_API_HOST = 'api.wordstat.yandex.net'
export const WORDSTAT_TLS_SERVERNAME = 'wordstat.yandex.ru'
const API_PREFIX = '/v1'

type WordstatDevice = 'all' | 'desktop' | 'phone' | 'tablet'
type WordstatPeriod = 'weekly' | 'monthly'
type WordstatRegionType = 'all' | 'cities' | 'regions'

interface PhraseCount {
  phrase: string
  count: number
}

export function createYandexWordstatConnector(): Connector {
  return {
    info(): ConnectorInfo {
      return {
        id: 'yandex_wordstat',
        label: 'Яндекс.Wordstat',
        kind: 'yandex_wordstat',
        status: 'ready',
        detail: 'Частотность ключевых слов. OAuth token в settings (yandex_wordstat_token), Wordstat API.'
      }
    },

    async query(args: Record<string, unknown>, ctx: ConnectorContext): Promise<unknown> {
      const op = String(args.op ?? '')
      const token = ctx.getSecret('yandex_wordstat_token')
      if (!token) {
        return {
          error: 'no-token',
          message: 'Wordstat token не настроен. Settings → Яндекс.Wordstat. ' +
                   'Создайте OAuth-приложение на oauth.yandex.ru и подайте заявку на доступ к API Вордстата (ClientID).'
        }
      }
      try {
        switch (op) {
          case 'get_wordstat':
            return await getWordstatBatch(token, args, ctx)
          case 'get_top_requests':
            return await getTopRequests(token, args, ctx)
          case 'get_dynamics':
            return await getDynamics(token, args, ctx)
          case 'get_regions':
            return await getRegions(token, args, ctx)
          case 'get_regions_tree':
            return await getRegionsTree(token, ctx)
          default:
            return {
              error: 'unknown-op',
              message: `Неизвестная op «${op}». Доступно: get_wordstat, get_top_requests, get_dynamics, get_regions, get_regions_tree.`
            }
        }
      } catch (err) {
        return { error: 'request-failed', message: err instanceof Error ? err.message : String(err), op }
      }
    }
  }
}

// ----------------------------------------------------------------- ops

async function getWordstatBatch(token: string, args: Record<string, unknown>, ctx: ConnectorContext): Promise<unknown> {
  // phrases переданный строкой/числом раньше ронял .filter (?. не спасает от не-массива) —
  // приводим к массиву, не-массив → пустой → понятный bad-args ниже (C5).
  const phrases = (Array.isArray(args.phrases) ? args.phrases : [])
    .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
  if (phrases.length === 0) {
    return { error: 'bad-args', message: 'get_wordstat требует phrases: string[] (ключевые фразы).' }
  }
  const regions = readRegions(args)
  const devices = readDevices(args)
  const numPhrases = readNumPhrases(args)
  const results = []
  for (let i = 0; i < Math.min(phrases.length, 10); i++) {
    const phrase = phrases[i].trim()
    const raw = await getTopRequests(token, {
      phrase,
      regions,
      geo_id: regions,
      devices,
      num_phrases: numPhrases
    }, ctx) as Record<string, unknown>
    if (raw.error) return raw
    results.push(raw)
    if (i < phrases.length - 1) await sleep(120)
  }
  return { count: results.length, results }
}

async function getTopRequests(token: string, args: Record<string, unknown>, ctx: ConnectorContext): Promise<unknown> {
  const phrase = String(args.phrase ?? '').trim()
  if (!phrase) return { error: 'bad-args', message: 'get_top_requests требует phrase: string.' }

  const body: Record<string, unknown> = {
    phrase,
    devices: readDevices(args),
    numPhrases: readNumPhrases(args)
  }
  const regions = readRegions(args)
  if (regions.length > 0) body.regions = regions

  const data = await wordstatApiPost('/topRequests', token, body, ctx) as Record<string, unknown>
  return normalizeTopRequests(phrase, data)
}

async function getDynamics(token: string, args: Record<string, unknown>, ctx: ConnectorContext): Promise<unknown> {
  const phrase = String(args.phrase ?? '').trim()
  const period = String(args.period ?? 'monthly').toLowerCase() as WordstatPeriod
  const from = String(args.from ?? args.date_from ?? '').trim()
  const to = String(args.to ?? args.date_to ?? '').trim()
  if (!phrase) return { error: 'bad-args', message: 'get_dynamics требует phrase: string.' }
  if (!from || !to) return { error: 'bad-args', message: 'get_dynamics требует from и to (YYYY-MM-DD).' }
  if (period !== 'weekly' && period !== 'monthly') {
    return { error: 'bad-args', message: 'period должен быть weekly или monthly.' }
  }

  const body: Record<string, unknown> = {
    phrase,
    period,
    from,
    to,
    devices: readDevices(args)
  }
  const regions = readRegions(args)
  if (regions.length > 0) body.regions = regions

  const data = await wordstatApiPost('/dynamics', token, body, ctx)
  return { phrase, period, from, to, ...flattenDynamics(data) }
}

async function getRegions(token: string, args: Record<string, unknown>, ctx: ConnectorContext): Promise<unknown> {
  const phrase = String(args.phrase ?? '').trim()
  if (!phrase) return { error: 'bad-args', message: 'get_regions требует phrase: string.' }

  const regionType = String(args.region_type ?? args.regionType ?? 'all').toLowerCase() as WordstatRegionType
  if (!['all', 'cities', 'regions'].includes(regionType)) {
    return { error: 'bad-args', message: 'region_type должен быть all, cities или regions.' }
  }

  const body: Record<string, unknown> = {
    phrase,
    regionType,
    devices: readDevices(args)
  }
  const regions = readRegions(args)
  if (regions.length > 0) body.regions = regions

  const data = await wordstatApiPost('/regions', token, body, ctx)
  return { phrase, region_type: regionType, ...flattenRegions(data) }
}

async function getRegionsTree(token: string, ctx: ConnectorContext): Promise<unknown> {
  const data = await wordstatApiPost('/getRegionsTree', token, {}, ctx)
  return { tree: data }
}

// ----------------------------------------------------------------- HTTP

export async function wordstatApiPost(
  pathSuffix: string,
  token: string,
  body: Record<string, unknown>,
  ctx: ConnectorContext
): Promise<unknown> {
  const path = `${API_PREFIX}${pathSuffix.startsWith('/') ? pathSuffix : `/${pathSuffix}`}`
  const payload = JSON.stringify(body ?? {})
  const text = await wordstatHttpsText(path, token, payload, ctx.signal)
  let json: Record<string, unknown>
  try {
    json = JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new Error(`Wordstat вернул не-JSON (${text.slice(0, 200)})`)
  }

  if (json.error || json.error_code || json.code) {
    const code = json.error_code ?? json.code ?? json.error
    const message = String(json.error_str ?? json.message ?? json.error_description ?? json.error ?? 'Wordstat API error')
    const detail = String(json.error_detail ?? json.details ?? '')
    throw new Error(formatWordstatApiError(Number(code) || 0, message, detail))
  }

  return json
}

function wordstatHttpsText(path: string, token: string, payload: string, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: WORDSTAT_API_HOST,
      servername: WORDSTAT_TLS_SERVERNAME,
      path,
      method: 'POST',
      checkServerIdentity(_host, cert) {
        return tls.checkServerIdentity(WORDSTAT_TLS_SERVERNAME, cert)
      },
      headers: {
        Authorization: `Bearer ${token}`,
        'Accept-Language': 'ru',
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(formatWordstatHttpError(res.statusCode, text)))
          return
        }
        resolve(text)
      })
    })

    const onAbort = () => {
      req.destroy(new Error('aborted'))
    }
    if (signal.aborted) {
      onAbort()
      return
    }
    signal.addEventListener('abort', onAbort, { once: true })
    req.on('error', (err) => {
      signal.removeEventListener('abort', onAbort)
      reject(err)
    })
    req.on('close', () => signal.removeEventListener('abort', onAbort))
    req.write(payload)
    req.end()
  })
}

function formatWordstatHttpError(status: number, text: string): string {
  let detail = text.slice(0, 300)
  try {
    const json = JSON.parse(text) as Record<string, unknown>
    detail = String(json.message ?? json.error ?? json.error_str ?? detail)
  } catch { /* raw text */ }

  if (status === 401 || status === 403) {
    return `Wordstat HTTP ${status}: неверный или просроченный OAuth-токен. ${detail}`
  }
  if (status === 404) {
    return `Wordstat HTTP 404: метод не найден или ClientID не одобрен для Wordstat API. ${detail}`
  }
  if (status === 429) {
    return `Wordstat HTTP 429: превышена квота (10 req/s, 1000/сутки). ${detail}`
  }
  return `Wordstat HTTP ${status}: ${detail}`
}

function formatWordstatApiError(code: number, message: string, detail: string): string {
  const suffix = detail ? ` (${detail})` : ''
  if (code === 53) {
    return `Wordstat error ${code}: недействительный OAuth-токен или нет доступа к API${suffix}`
  }
  return `Wordstat error ${code}: ${message}${suffix}`.trim()
}

// ----------------------------------------------------------------- parsing

function normalizeTopRequests(fallbackPhrase: string, data: Record<string, unknown>) {
  const top = mapPhraseCounts(data.topRequests ?? data.top_requests)
  const assoc = mapPhraseCounts(data.associations ?? data.searchedAlso ?? data.searched_also)
  const phrase = String(data.requestPhrase ?? data.phrase ?? fallbackPhrase)
  const totalCount = Number(data.totalCount ?? data.total_count ?? top[0]?.count ?? 0)

  return {
    phrase,
    total_count: totalCount,
    top_requests: top,
    associations: assoc,
    // Алиасы под старый формат коннектора / агентские промпты.
    searched_with: top.map(item => ({ phrase: item.phrase, shows: item.count })),
    searched_also: assoc.map(item => ({ phrase: item.phrase, shows: item.count }))
  }
}

function flattenDynamics(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object') return { dynamics: [] }
  const obj = data as Record<string, unknown>
  const series = obj.dynamics ?? obj.points ?? obj.data ?? obj
  return { dynamics: series }
}

function flattenRegions(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object') return { regions: [] }
  const obj = data as Record<string, unknown>
  const rows = obj.regions ?? obj.regionStats ?? obj.data ?? obj
  return { regions: rows }
}

function mapPhraseCounts(raw: unknown): PhraseCount[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const row = item as Record<string, unknown>
      const phrase = String(row.phrase ?? row.query ?? '').trim()
      const count = Number(row.count ?? row.shows ?? row.value ?? 0)
      if (!phrase) return null
      return { phrase, count }
    })
    .filter((x): x is PhraseCount => x != null)
}

function readRegions(args: Record<string, unknown>): number[] {
  const raw = (args.regions ?? args.geo_id ?? args.geoId) as unknown
  if (!Array.isArray(raw)) return []
  return raw.map(n => Number(n)).filter(n => Number.isFinite(n) && n > 0)
}

function readDevices(args: Record<string, unknown>): WordstatDevice[] {
  const raw = args.devices
  if (!Array.isArray(raw) || raw.length === 0) return ['all']
  const allowed = new Set<WordstatDevice>(['all', 'desktop', 'phone', 'tablet'])
  const out = raw
    .map(v => String(v).toLowerCase() as WordstatDevice)
    .filter(v => allowed.has(v))
  return out.length > 0 ? out : ['all']
}

function readNumPhrases(args: Record<string, unknown>): number {
  const n = Number(args.num_phrases ?? args.numPhrases ?? 50)
  if (!Number.isFinite(n) || n <= 0) return 50
  return Math.min(Math.floor(n), 2000)
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}