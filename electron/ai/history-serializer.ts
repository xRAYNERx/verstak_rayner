/**
 * History serializer — единый источник правды сериализации ИСТОРИИ диалога
 * в текстовый транскрипт для CLI-провайдеров (claude-cli / gemini-cli /
 * grok-cli / codex-cli).
 *
 * Почему отдельный модуль: раньше эта логика жила приватной функцией
 * `serializeMsg` внутри `buildCliPrompt` (cli-prompt.ts). При добавлении новых
 * полей в ChatMessage / ToolResult формат дрейфовал, а тесты на сериализацию
 * было некуда повесить. Теперь — экспортируемые `serializeHistory`,
 * `formatToolResult`, `describeAttachments`.
 *
 * ВАЖНО: это про сериализацию СЕРЕДИНЫ payload (история turn'ов), а НЕ про
 * сборку всего payload. Обёртка <current_user_request> и argv-cap budget
 * остаются в cli-prompt.ts.
 */

import type { Attachment, ChatMessage, ToolResult } from './types'
import { smartCompressResult } from './compact-history'

/** Параметры сериализации истории. Все опциональны — есть разумные дефолты. */
export interface SerializeHistoryOpts {
  /** Бюджет символов на всю историю. Walk идёт от свежих к старым. */
  charBudget?: number
  /** Минимум turn'ов, включаемых ВСЕГДА, даже если пробивают бюджет. */
  minTurns?: number
  /** Кап на тело (content) одного сообщения. */
  perMsgBodyCap?: number
  /** Кап на один tool result (после умного сжатия). */
  perToolResultCap?: number
  /** Кап на args одного tool call. */
  perToolCallArgsCap?: number
}

const DEFAULTS: Required<SerializeHistoryOpts> = {
  charBudget: 40_000,
  minTurns: 4,
  perMsgBodyCap: 4000,
  perToolResultCap: 1500,
  perToolCallArgsCap: 300
}

/**
 * Формат одного tool result для транскрипта.
 *
 * Ключевое отличие от прежней логики: учитываем `r.error`. Раньше serializeMsg
 * показывал только `result`, ИГНОРИРУЯ `error` — CLI был слеп к тому, что tool
 * упал, и мог считать неудачную операцию успешной. Теперь при наличии error
 * показываем «[ОШИБКА] {error}».
 *
 * Длинный result сжимаем умно через smartCompressResult (read_file = голова+хвост,
 * run_command = хвост и т.п.) вместо тупого slice.
 */
export function formatToolResult(r: ToolResult, cap: number = DEFAULTS.perToolResultCap): string {
  if (r.error) {
    // result при ошибке несёт контекст ошибки (см. types.ts ToolResult.error).
    const ctx = r.result == null ? '' : (typeof r.result === 'string' ? r.result : JSON.stringify(r.result))
    let body = `[ОШИБКА] ${r.error}`
    if (ctx.trim()) {
      const ctxTrimmed = ctx.length > cap ? smartCompressResult(r.name, ctx, cap) : ctx
      body += `\n${ctxTrimmed}`
    }
    return body
  }
  const raw = typeof r.result === 'string' ? r.result : JSON.stringify(r.result)
  return raw.length > cap ? smartCompressResult(r.name, raw, cap) : raw
}

/**
 * Единый текст-хинт о прикреплённых файлах. CLI в режиме stream-json не
 * принимает inline-картинки, поэтому называем имена и просим описать словами.
 *
 *  - 'text'   — детальный построчный хинт (используется при сборке user-message).
 *  - 'inline' — компактный однострочный список (для краткой пометки).
 */
export function describeAttachments(att: Attachment[] | undefined, mode: 'text' | 'inline' = 'text'): string {
  if (!att || att.length === 0) return ''
  if (mode === 'inline') {
    return att.map(a => `[файл: ${a.name}]`).join('\n')
  }
  return att
    .map(a => `[прикреплён файл: ${a.name} (${a.mimeType}) — CLI не видит содержимое, опиши что нужно сделать]`)
    .join('\n')
}

/**
 * Сериализовать одно сообщение в строку транскрипта. Tool calls и results
 * несут обрезанные args/body, чтобы follow-up turn не был слеп к тому, что
 * агент уже делал.
 */
export function serializeMessage(m: ChatMessage, opts: SerializeHistoryOpts = {}): string {
  const o = { ...DEFAULTS, ...opts }
  const role = m.role === 'assistant' ? 'ASSISTANT' : 'USER'
  let body = (m.content ?? '').slice(0, o.perMsgBodyCap)
  if (m.toolCalls?.length) {
    const calls = m.toolCalls.map(c => {
      let argSummary = ''
      try {
        const args = typeof c.args === 'string' ? c.args : JSON.stringify(c.args)
        if (args && args !== '{}') argSummary = ` ${args.slice(0, o.perToolCallArgsCap)}`
      } catch { /* args не сериализуется — ничего страшного */ }
      return `${c.name}${argSummary}`
    }).join('\n  · ')
    body = body ? `${body}\n[tool_calls]\n  · ${calls}` : `[tool_calls]\n  · ${calls}`
  }
  if (m.toolResults?.length) {
    const results = m.toolResults.map(r => {
      return `${r.name} →\n${formatToolResult(r, o.perToolResultCap)}`
    }).join('\n---\n')
    body = body ? `${body}\n[tool_results]\n${results}` : `[tool_results]\n${results}`
  }
  return `[${role}]: ${body}`
}

/** Результат сериализации истории: готовый блок + статистика для отладки. */
export interface SerializedHistory {
  /** Сериализованный транскрипт (без обёртки <conversation_history>). Пусто
   *  если включать нечего. */
  transcript: string
  /** Сколько turn'ов реально включено. */
  includedCount: number
  /** Сколько отброшено по бюджету. */
  droppedCount: number
}

/**
 * Сериализовать историю turn'ов (БЕЗ system-сообщений) в транскрипт.
 *
 * Walk идёт от свежих к старым, пушим пока есть бюджет. Всегда включаем
 * minTurns даже если они пробивают бюджет — терять свежий контекст хуже, чем
 * чуть превысить лимит.
 *
 * @param messages turn'ы для сериализации (system-сообщения отфильтровываем
 *                 сами; последний user обычно отдают отдельно — вызывающий код
 *                 решает что передать).
 */
export function serializeHistory(messages: ChatMessage[], opts: SerializeHistoryOpts = {}): SerializedHistory {
  const o = { ...DEFAULTS, ...opts }
  const candidates = messages.filter(m => m.role !== 'system')

  const reversed: string[] = []
  let usedChars = 0
  for (let i = candidates.length - 1; i >= 0; i--) {
    const wire = serializeMessage(candidates[i], o)
    const within = usedChars + wire.length <= o.charBudget
    const isFloor = reversed.length < o.minTurns
    if (!within && !isFloor) break
    reversed.push(wire)
    usedChars += wire.length
  }
  const includedCount = reversed.length
  const droppedCount = candidates.length - includedCount
  const transcript = includedCount > 0 ? reversed.reverse().join('\n\n') : ''
  return { transcript, includedCount, droppedCount }
}
