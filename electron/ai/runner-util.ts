// Мелкие чистые хелперы runner'ов (распил ai.ts, 1.9.8 #1, срез 3).
// Вынесено из ipc/ai.ts БЕЗ изменения логики.

/**
 * Псевдо-имена в tools_allow скиллов: id коннекторов / «логические» ярлыки,
 * которые НЕ совпадают с именами TOOL_DEFS. Раньше смесь
 * `yandex_wordstat` + `connector_query` давала partial match → у модели
 * оставался только connector_query (без list_connectors/read_file), и агент
 * писал «Вордстат недоступен», хотя коннектор жив.
 *
 * Если в allow есть такие псевдо-имена — fail-open (как при полном mismatch).
 */
const PSEUDO_TOOL_ALLOW = new Set([
  'yandex_wordstat',
  'yandex_direct',
  'yandex_metrika',
  'yandex_disk',
  'yandex_webmaster',
  'yandex_tracker',
  'ywordstat',
  'yandex_wordstat_api',
  'bitrix24',
  'gsheets',
  'telegram',
  'ozon',
  'wildberries',
  'files',
  'shell',
  'read_project',
  'read_skill'
])

/**
 * Отфильтровать доступные инструменты по skill `tools_allow` (M4 enforcement).
 * Пусто/нет allow → все base+mcp. Есть allow → только совпавшие по имени.
 * Fail-open + warn, если НИ ОДНО имя не совпало (broken-скилл не должен стать
 * молчаливым кирпичом). Если совпали только mcp — валидное mcp-only ограничение.
 * Fail-open также при псевдо-именах (id коннекторов / files / shell) в allow —
 * иначе partial match ломает операционные скиллы.
 */
export function selectAllowedToolDefs<T extends { name: string }>(
  baseDefs: readonly T[],
  mcpDefs: readonly T[],
  toolsAllow?: string[] | null
): T[] {
  const allowList = Array.isArray(toolsAllow) && toolsAllow.length > 0 ? toolsAllow : null
  if (!allowList) return mcpDefs.length > 0 ? [...baseDefs, ...mcpDefs] : [...baseDefs]

  const pseudo = allowList.filter(t => PSEUDO_TOOL_ALLOW.has(t.trim()))
  if (pseudo.length > 0) {
    console.warn(
      `[agent] tools_allow содержит псевдо-имена [${pseudo.join(', ')}] ` +
        `(id коннектора / files / shell) — ограничение пропущено; ` +
        `в allow указывай реальные tool-имена: connector_query, list_connectors, read_file, …`
    )
    return mcpDefs.length > 0 ? [...baseDefs, ...mcpDefs] : [...baseDefs]
  }

  const allowSet = new Set(allowList)
  const base = baseDefs.filter(t => allowSet.has(t.name))
  const mcp = mcpDefs.filter(t => allowSet.has(t.name))
  if (base.length === 0 && mcp.length === 0) {
    console.warn(`[agent] tools_allow=[${allowList.join(', ')}] не совпал ни с одним инструментом — ограничение пропущено (проверь имена в скилле)`)
    return mcpDefs.length > 0 ? [...baseDefs, ...mcpDefs] : [...baseDefs]
  }
  return mcp.length > 0 ? [...base, ...mcp] : [...base]
}

/** Событие провайдера типа 'error' → Error (для fallback/retry), иначе null. */
export function retriableErrorEvent(ev: { type?: string; message?: unknown }): Error | null {
  return ev && ev.type === 'error' ? new Error(String(ev.message ?? '')) : null
}
