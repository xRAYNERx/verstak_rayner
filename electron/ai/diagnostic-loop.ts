/**
 * Diagnostic Loop v2 — после принятых правок .ts/.tsx агентный цикл АВТОМАТИЧЕСКИ
 * прогоняет check_diagnostics (tsc) и подсовывает реальные ошибки в следующий ход,
 * а не просто мягкий нудж «запусти проверку». Цель: правка → diagnostics → fix до green
 * без надежды на то, что модель сама вспомнит проверить.
 *
 * Здесь только ЧИСТАЯ логика (решение + форматирование). Запуск tsc и инъекция в
 * контекст — в ai.ts через существующий verifyHint + checkDiagnosticsHandler.
 */

/** Файл, который имеет смысл проверять через tsc. */
export function isTypeScriptFile(path: string): boolean {
  return /\.(ts|tsx)$/i.test(path.trim())
}

/**
 * Запускать ли авто-диагностику в этом ходу:
 *  - фича включена (diagnostic_loop !== 'false');
 *  - были приняты правки .ts/.tsx файлов;
 *  - модель НЕ вызвала check_diagnostics сама в этом ходу (не дублируем tsc).
 */
export function shouldAutoDiagnose(opts: {
  enabled: boolean
  tsWritesThisTurn: number
  modelCheckedThisTurn: boolean
}): boolean {
  return opts.enabled && opts.tsWritesThisTurn > 0 && !opts.modelCheckedThisTurn
}

/**
 * Превратить вывод check_diagnostics в system-нудж для следующего хода.
 * Возвращает null, если ошибок нет (нудж не нужен) — тогда ai.ts откатится на
 * мягкий verify-hint.
 *
 * check_diagnostics отдаёт либо «✅ Нет ошибок TypeScript.», либо
 * «Found N errors:\n\n path:line:col — TSxxxx: msg».
 */
export function formatDiagnosticHint(diagResult: string): string | null {
  const r = (diagResult ?? '').trim()
  if (!r) return null
  // Чисто / нет tsconfig / не запустилось — нудж не нужен.
  if (r.startsWith('✅') || r.includes('Нет ошибок') || r.includes('tsconfig.json не найден')) return null
  if (!/error/i.test(r) && !/TS\d+/.test(r)) return null
  return (
    '[system: авто-проверка типов (tsc) после твоих правок нашла ошибки. '
    + 'ОБЯЗАТЕЛЬНО почини их перед тем как сказать «готово»:\n\n'
    + r
    + '\n\nЕсли какая-то ошибка не связана с твоими правками — явно это отметь.]'
  )
}
