/**
 * Review V2 — парсер структурированных findings + сборка fix-промпта.
 *
 * RENDERER-side (как compose-review-payload.ts): renderer не импортит electron/,
 * поэтому логика разбора живёт здесь. Чистые функции — тестируемы из коробки.
 *
 * Ревьюер (см. electron/ai/review-prompt.ts) выдаёт:
 *  1. человекочитаемый текст с первой строкой «ЗАМЕЧАНИЙ: N» (старый формат V1);
 *  2. fenced ```json блок с массивом findings (V2).
 *
 * parseReviewFindings извлекает (2). Если json-блока нет или он битый —
 * откатывается на старый текстовый формат «1. ...» (best-effort) или пустой
 * массив. Никогда не бросает — UI должен показать хоть что-то.
 */

/** Уровень критичности замечания. P0 — критично, P3 — минор. */
export type FindingSeverity = 'P0' | 'P1' | 'P2' | 'P3'

/** Категория замечания. */
export type FindingCategory =
  | 'bug'
  | 'regression'
  | 'security'
  | 'missing-test'
  | 'architecture'
  | 'UX'

/** Одно структурированное замечание ревьюера. */
export interface ReviewFinding {
  id: string
  file: string
  line: number
  endLine?: number
  severity: FindingSeverity
  category: FindingCategory
  title: string
  detail: string
  suggestedFix?: string
}

const SEVERITIES: ReadonlySet<string> = new Set(['P0', 'P1', 'P2', 'P3'])
const CATEGORIES: ReadonlySet<string> = new Set([
  'bug', 'regression', 'security', 'missing-test', 'architecture', 'UX'
])

/**
 * Извлекает findings из текста ревью.
 *
 * Порядок:
 *  1. Ищем fenced ```json блок, парсим, валидируем каждый элемент.
 *  2. Если json нет/битый — fallback на старый текстовый формат «N. **title**».
 *  3. В крайнем случае — пустой массив.
 *
 * Чистая, не бросает.
 */
export function parseReviewFindings(content: string): ReviewFinding[] {
  if (!content) return []

  const jsonBlock = extractJsonBlock(content)
  if (jsonBlock != null) {
    try {
      const parsed = JSON.parse(jsonBlock)
      const arr = Array.isArray(parsed) ? parsed : null
      if (arr) {
        const out: ReviewFinding[] = []
        for (let i = 0; i < arr.length; i++) {
          const f = normalizeFinding(arr[i], i)
          if (f) out.push(f)
        }
        // Если json был, но ни один элемент не валиден — это не «нет findings»,
        // а битый блок. Падать на старый формат нет смысла (ревьюер уже дал json),
        // отдаём что распарсили (возможно пусто).
        return out
      }
    } catch {
      // битый json → пробуем старый формат ниже
    }
  }

  // Fallback: старый текстовый формат V1 «1. **title** — критичность: high».
  return parseLegacyTextFindings(content)
}

/**
 * Достаёт содержимое первого ```json ... ``` блока. Возвращает null если нет.
 * Толерантен к регистру «json» и к пробелам.
 */
function extractJsonBlock(content: string): string | null {
  const m = content.match(/```json\s*([\s\S]*?)```/i)
  if (m && m[1]) return m[1].trim()
  return null
}

/** Валидирует и нормализует один элемент json-массива в ReviewFinding. */
function normalizeFinding(raw: unknown, index: number): ReviewFinding | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>

  const severity = String(o.severity ?? '').toUpperCase()
  if (!SEVERITIES.has(severity)) return null

  const category = String(o.category ?? '')
  if (!CATEGORIES.has(category)) return null

  const file = typeof o.file === 'string' ? o.file.trim() : ''
  if (!file) return null

  const title = typeof o.title === 'string' ? o.title.trim() : ''
  if (!title) return null

  const line = toLine(o.line)
  const endLineRaw = toLine(o.endLine)

  const finding: ReviewFinding = {
    id: typeof o.id === 'string' && o.id.trim() ? o.id.trim() : `f${index + 1}`,
    file,
    line,
    severity: severity as FindingSeverity,
    category: category as FindingCategory,
    title,
    detail: typeof o.detail === 'string' ? o.detail.trim() : ''
  }
  if (endLineRaw > 0) finding.endLine = endLineRaw
  if (typeof o.suggestedFix === 'string' && o.suggestedFix.trim()) {
    finding.suggestedFix = o.suggestedFix.trim()
  }
  return finding
}

/** number | строку-число → целое, иначе 0. */
function toLine(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.floor(v))
  if (typeof v === 'string') {
    const n = parseInt(v, 10)
    return Number.isFinite(n) ? Math.max(0, n) : 0
  }
  return 0
}

/**
 * Fallback-парсер старого текстового формата V1, когда json-блока нет.
 * Формат: «1. **Заголовок** — критичность: high\n   file.ts:42: деталь».
 * Best-effort — выдёргиваем заголовок, severity и (если есть) file:line.
 * Это не основной путь: при отсутствии findings UI просто покажет markdown.
 */
function parseLegacyTextFindings(content: string): ReviewFinding[] {
  const out: ReviewFinding[] = []
  // Разбиваем на блоки по нумерованным пунктам «N. ».
  const lines = content.split('\n')
  let idx = 0
  for (let i = 0; i < lines.length; i++) {
    const head = lines[i].match(/^\s*\d+\.\s+\*\*(.+?)\*\*(?:\s*[—-]\s*критичность:\s*(high|medium|low))?/i)
    if (!head) continue
    const title = head[1].trim()
    const severity = legacySeverity(head[2])
    // Следующая непустая строка — деталь; пробуем выцепить file:line.
    let detail = ''
    let file = ''
    let line = 0
    for (let j = i + 1; j < lines.length && j < i + 4; j++) {
      const body = lines[j].trim()
      if (!body) continue
      if (/^\s*\d+\.\s+\*\*/.test(lines[j])) break  // начался следующий пункт
      const fl = body.match(/([\w./\\-]+\.[a-z]{1,5}):(\d+)/i)
      if (fl) { file = fl[1]; line = parseInt(fl[2], 10) }
      detail = detail ? `${detail} ${body}` : body
    }
    idx++
    out.push({
      id: `f${idx}`,
      file: file || '(не указан)',
      line,
      severity,
      category: 'bug',
      title,
      detail
    })
  }
  return out
}

/** Маппинг старого high/medium/low → severity. */
function legacySeverity(s: string | undefined): FindingSeverity {
  switch ((s ?? '').toLowerCase()) {
    case 'high': return 'P0'
    case 'medium': return 'P1'
    case 'low': return 'P3'
    default: return 'P2'
  }
}

/**
 * Собирает таргетированный промпт «исправь ТОЛЬКО эти замечания» из принятых
 * findings. Чистая функция, тестируемая. Уходит в основной чат через ai.send.
 *
 * Цель — узкий scope: модель чинит конкретные file:line, не расползаясь.
 */
export function composeFixPrompt(accepted: ReviewFinding[]): string {
  if (accepted.length === 0) return ''
  const lines: string[] = []
  lines.push('Исправь ТОЛЬКО эти замечания ревью, точечно, не расширяя scope.')
  lines.push('Не трогай код, которого нет в списке. Не делай рефакторинг «заодно».')
  lines.push('')
  for (const f of accepted) {
    const loc = f.line > 0
      ? `${f.file}:${f.line}${f.endLine && f.endLine > f.line ? `-${f.endLine}` : ''}`
      : f.file
    let item = `- ${loc} [${f.severity}/${f.category}] ${f.title}`
    if (f.detail) item += `: ${f.detail}`
    if (f.suggestedFix) item += ` (как чинить: ${f.suggestedFix})`
    lines.push(item)
  }
  lines.push('')
  lines.push('После правок коротко перечисли, что изменил по каждому пункту.')
  return lines.join('\n')
}

/**
 * F8: маппит находки ревью в шаги Плана (каждая находка = шаг). Так находки
 * получают persist + жизненный цикл (pending→done/skipped/failed) + связку
 * шаг→прогон→верификация, не плодя новую таблицу. Чистая, тестируемая.
 *
 * title шага: `[P0/security] file:line — заголовок` (помещается в строку плана);
 * detail: подробность находки + предложенный фикс (контекст для исполнителя).
 */
export function findingsToPlanSteps(findings: ReviewFinding[]): Array<{ title: string; detail: string | null }> {
  return findings.map(f => {
    const loc = f.line > 0
      ? `${f.file}:${f.line}${f.endLine && f.endLine > f.line ? `-${f.endLine}` : ''}`
      : f.file
    const title = `[${f.severity}/${f.category}] ${loc} — ${f.title}`
    const detailParts: string[] = []
    if (f.detail) detailParts.push(f.detail)
    if (f.suggestedFix) detailParts.push(`Как чинить: ${f.suggestedFix}`)
    return { title, detail: detailParts.length > 0 ? detailParts.join('\n\n') : null }
  })
}
