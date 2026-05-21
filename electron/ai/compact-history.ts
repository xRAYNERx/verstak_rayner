/**
 * Context Sliding Window — сжимает старые tool-results в истории сообщений,
 * чтобы длинные сессии не пробивали context window.
 *
 * Источник: ночной рефактор V3 (Pavel), recommendation #6 из аудита Grok.
 *
 * ПРОБЛЕМА:
 * Каждый turn агент-цикла добавляет в currentMessages результаты тулзов:
 * содержимое прочитанных файлов, stdout команд, project_map'ы и т.п. После
 * 10 turns с большими read_file (по 5-50KB) история раздувается до сотен KB.
 * Это:
 *   1) Бьёт лимит context window провайдеров (особенно на claude-haiku /
 *      gpt-4o-mini, где окно меньше).
 *   2) Замедляет каждый последующий turn (модель читает всё больше истории).
 *   3) Стоит денег — input_tokens растут квадратично с длиной сессии.
 *
 * СТРАТЕГИЯ:
 * Для каждой ai-сессии держим окно «последние KEEP_RECENT_TURNS turn'ов
 * целиком, старше — суммаризируем». Tool result text заменяется на короткий
 * маркер с метаданными (имя тулзы, длина оригинала, номер turn'а).
 *
 * Что НЕ трогаем:
 * - assistant content (текст ответов — нужен для continuity).
 * - tool calls (имя + args — нужны чтобы модель понимала что уже делала).
 * - user messages (это сам разговор).
 *
 * Возвращаем НОВЫЙ массив сообщений (immutable) — оригинал не модифицируем.
 */

import type { ChatMessage } from './types'

/** Сколько последних turn'ов оставляем целиком. */
const KEEP_RECENT_TURNS = 3

/** Максимальный размер ОДНОГО tool result в свежих turn'ах. Старше — режется
 *  до маркера. На свежих — оставляем но обрезаем до этого лимита если жирные. */
const FRESH_RESULT_HARD_CAP = 12_000

/** Размер маркера для старых tool results. Короче — экономнее токены. */
function makeOldMarker(name: string, originalLen: number, turnIdx: number): string {
  return `[compacted: ${name} (${originalLen} симв., turn ${turnIdx + 1}) — обрезано sliding window, перечитай если нужно]`
}

/** Грубо отрезаем середину если жирный, но в окне keep — оставляем хвост. */
function tailTruncate(text: string, cap: number): string {
  if (text.length <= cap) return text
  const headLen = Math.floor(cap * 0.3)
  const tailLen = cap - headLen - 60
  return `${text.slice(0, headLen)}\n[…вырезано ${text.length - cap + 60} симв., см. оригинал в исходном файле…]\n${text.slice(text.length - tailLen)}`
}

/**
 * Возвращает компактную копию messages для отправки провайдеру.
 *
 * Логика turn-индекса: каждое user-сообщение с toolResults представляет
 * собой завершение одного агент-turn (где модель вызвала тулзы и получила
 * результаты). Мы их нумеруем, и turns ниже currentTurn - KEEP_RECENT_TURNS
 * получают сжатие.
 *
 * @param messages исходная история (не модифицируется)
 * @param currentTurn сколько turn'ов уже сделано в текущей сессии
 * @returns новая история, готовая для provider.send
 */
export function compactToolHistory(messages: ChatMessage[], currentTurn: number): ChatMessage[] {
  const cutoff = currentTurn - KEEP_RECENT_TURNS
  if (cutoff < 0) {
    // Свежая сессия — есть смысл только подрезать гигантские свежие result'ы.
    return messages.map(m => capFreshResults(m))
  }
  // Считаем индекс tool-results-сообщений (это и есть turn-маркеры).
  let toolResultTurnIdx = -1
  return messages.map(m => {
    if (m.toolResults && m.toolResults.length > 0) {
      toolResultTurnIdx++
      if (toolResultTurnIdx <= cutoff) {
        return compactOldResults(m, toolResultTurnIdx)
      }
      return capFreshResults(m)
    }
    return m
  })
}

function compactOldResults(m: ChatMessage, turnIdx: number): ChatMessage {
  if (!m.toolResults?.length) return m
  return {
    ...m,
    toolResults: m.toolResults.map(r => {
      const raw = typeof r.result === 'string' ? r.result : JSON.stringify(r.result)
      // Совсем мелкие результаты не трогаем — экономия копеечная, а сигнал
      // полезный (например, мелкий read_file у конфига).
      if (raw.length < 400) return r
      return { ...r, result: makeOldMarker(r.name, raw.length, turnIdx) }
    })
  }
}

function capFreshResults(m: ChatMessage): ChatMessage {
  if (!m.toolResults?.length) return m
  let changed = false
  const next = m.toolResults.map(r => {
    const raw = typeof r.result === 'string' ? r.result : JSON.stringify(r.result)
    if (raw.length <= FRESH_RESULT_HARD_CAP) return r
    changed = true
    return { ...r, result: tailTruncate(raw, FRESH_RESULT_HARD_CAP) }
  })
  return changed ? { ...m, toolResults: next } : m
}

/** Статистика сжатия — для журнала / отладки. */
export function diffSize(before: ChatMessage[], after: ChatMessage[]): { savedChars: number; pct: number } {
  const charsOf = (msgs: ChatMessage[]): number =>
    msgs.reduce((sum, m) => {
      let s = (m.content ?? '').length
      if (m.toolResults) {
        for (const r of m.toolResults) {
          const raw = typeof r.result === 'string' ? r.result : JSON.stringify(r.result)
          s += raw.length
        }
      }
      return sum + s
    }, 0)
  const a = charsOf(before)
  const b = charsOf(after)
  const saved = Math.max(0, a - b)
  return { savedChars: saved, pct: a > 0 ? Math.round((saved / a) * 100) : 0 }
}
