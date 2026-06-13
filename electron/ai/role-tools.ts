/**
 * Whitelist инструментов по роли субагента (Фаза 1 спринта мультиагентности).
 *
 * Субагенты теперь крутят agent-loop с инструментами, но НЕ полным набором
 * главного агента — каждая роль получает только то, что ей нужно по смыслу.
 * Это и безопасность (researcher не должен писать файлы), и защита от взрыва
 * стоимости/рекурсии (никто не может делегировать дальше).
 *
 * Контракт зафиксирован тестами в tests/ai/role-tools.test.ts — если кто-то
 * случайно даст read-only роли write-tool, тест упадёт.
 */

/** Базовый read-only набор — доступен всем ролям. */
const READ_ONLY_TOOLS = [
  'read_file',
  'list_directory',
  'search_project',
  'find_files',
  'get_project_map',
  'impact_analysis'
] as const

/**
 * Дополнительные безопасные read-tools verstak (нет write/команд) — даём
 * researcher'у, чтобы он мог исследовать не только код, но и журнал, документы,
 * память и внешние коннекторы. Все они read-only по природе:
 * - read_journal / conversation_search / memory_search — чтение истории/памяти;
 * - read_spreadsheet / read_document / convert_file — чтение не-текстовых файлов;
 * - list_connectors / connector_query — запрос данных из внешних систем (1С/HTTP),
 *   сам по себе не пишет в проект;
 * - browser_read_page — чтение содержимого открытой страницы встроенного браузера.
 */
const RESEARCH_READ_TOOLS = [
  'read_journal',
  'conversation_search',
  'memory_search',
  'read_spreadsheet',
  'read_document',
  'convert_file',
  'list_connectors',
  'connector_query',
  'browser_read_page'
] as const

/**
 * Артефактные tools verstak (generate_html / generate_docx / render_chart) —
 * пишут только в .verstak/artifacts/, не трогают код проекта. Даём executor'у:
 * узкая подзадача может включать «собери HTML-отчёт / docx / диаграмму».
 */
const ARTIFACT_TOOLS = ['generate_html', 'generate_docx', 'render_chart'] as const

/**
 * Инструменты, которые субагенту НИКОГДА нельзя давать — независимо от роли.
 * delegate_* = рекурсивное делегирование (Фаза 4), запрещено как защита от
 * бесконечной рекурсии и взрыва стоимости. Остальное — тяжёлые/побочные
 * операции, не относящиеся к узкой подзадаче субагента.
 */
export const SUBAGENT_FORBIDDEN_TOOLS: ReadonlySet<string> = new Set([
  'delegate_task',
  'delegate_parallel'
])

/**
 * Вернуть список разрешённых tool-имён для роли субагента.
 *
 * - researcher → read-only + безопасные read-tools verstak (журнал, документы,
 *   память, коннекторы, страница браузера). Анализ без записи и команд.
 * - critic / planner → строго READ-ONLY (анализ кода, без записи и команд).
 * - verifier → read-only + check_diagnostics + run_command (но run_command
 *   ограничен whitelist'ом проверочных команд в command-policy.isVerifierCommand).
 * - executor → read-only + apply_patch + write_file (через mode-policy.decide) +
 *   run_command (через command-policy denylist, как у главного агента) +
 *   артефактные tools (html/docx/chart — пишут только в .verstak/artifacts).
 * - роль не задана (delegate_task без роли) → безопасный read-only default.
 *
 * delegate_task / delegate_parallel исключаются ВСЕГДА (SUBAGENT_FORBIDDEN_TOOLS).
 */
export function getRoleToolset(role?: string | null): string[] {
  let tools: string[]
  switch (role) {
    case 'executor':
      tools = [...READ_ONLY_TOOLS, ...RESEARCH_READ_TOOLS, 'apply_patch', 'write_file', 'run_command', 'check_diagnostics', ...ARTIFACT_TOOLS]
      break
    case 'verifier':
      tools = [...READ_ONLY_TOOLS, 'check_diagnostics', 'run_command']
      break
    case 'researcher':
      tools = [...READ_ONLY_TOOLS, ...RESEARCH_READ_TOOLS]
      break
    case 'critic':
    case 'planner':
    default:
      // critic/planner и неизвестная/пустая роль — строго read-only
      tools = [...READ_ONLY_TOOLS]
      break
  }
  // Defence-in-depth: даже если выше кто-то добавит delegate_* — вырезаем.
  return tools.filter(t => !SUBAGENT_FORBIDDEN_TOOLS.has(t))
}
