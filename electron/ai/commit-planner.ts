/**
 * Conventional Commit Planner (Dev Task Flow, Фаза 4) — ЧИСТАЯ функция.
 *
 * Берёт diff-stat задачи (изменённые файлы) + опц. affectedZones/summary и
 * раскладывает правки на микрокоммиты `type(scope): subject` по путям. Без ML —
 * чистая эвристика, поэтому покрыта тестами (CLAUDE.md п.7).
 *
 * Эвристика разбивки (по префиксу пути):
 *   electron/ai|ipc|storage|connectors → backend-группы (scope из подпапки);
 *   src/components|store|lib            → frontend;
 *   tests/                             → test;
 *   docs/                              → docs;
 *   прочее                            → chore (misc).
 *
 * type коммита эвристически из summary/preflight (feat/fix/chore/test/docs/refactor).
 * commitMessage и prSummary генерятся из получившихся групп.
 *
 * Логика не трогает файловую систему / git — только трансформация данных, чтобы
 * её можно было дёрнуть из теста без окружения.
 */

import type { GitDiffStatEntry } from '../ipc/git'

/** Conventional-тип коммита. */
export type CommitType = 'feat' | 'fix' | 'chore' | 'test' | 'docs' | 'refactor'

/** Группа = один потенциальный микрокоммит. */
export interface CommitGroup {
  type: CommitType
  scope: string
  subject: string
  files: string[]
}

export interface CommitPlanInput {
  diffStat: GitDiffStatEntry[]
  affectedZones?: string[]
  summary?: string
}

export interface CommitPlan {
  groups: CommitGroup[]
  commitMessage: string
  prSummary: string
}

/** Внутренний ключ зоны — определяет группу + дефолтный scope. */
interface ZoneInfo {
  /** Стабильный ключ зоны для группировки. */
  key: string
  /** Тип по умолчанию для зоны (может быть переопределён summary-эвристикой). */
  defaultType: CommitType
  /** Conventional scope (например 'ipc', 'storage', 'ui'). */
  scope: string
}

/**
 * Классифицирует путь файла в зону. Порядок проверок важен: более специфичные
 * префиксы (tests/, docs/) идут до общих, чтобы tests/ не утёк в backend.
 */
function classifyPath(path: string): ZoneInfo {
  const p = path.replace(/\\/g, '/')
  if (p.startsWith('tests/')) return { key: 'test', defaultType: 'test', scope: 'tests' }
  if (p.startsWith('docs/')) return { key: 'docs', defaultType: 'docs', scope: 'docs' }
  // Backend: electron/{ai,ipc,storage,connectors}/... — scope из второй части пути.
  if (p.startsWith('electron/ai/')) return { key: 'backend:ai', defaultType: 'feat', scope: 'ai' }
  if (p.startsWith('electron/ipc/')) return { key: 'backend:ipc', defaultType: 'feat', scope: 'ipc' }
  if (p.startsWith('electron/storage/')) return { key: 'backend:storage', defaultType: 'feat', scope: 'storage' }
  if (p.startsWith('electron/connectors/')) return { key: 'backend:connectors', defaultType: 'feat', scope: 'connectors' }
  if (p.startsWith('electron/')) return { key: 'backend:misc', defaultType: 'chore', scope: 'electron' }
  // Frontend: src/{components,store,lib}/...
  if (p.startsWith('src/components/')) return { key: 'frontend:components', defaultType: 'feat', scope: 'ui' }
  if (p.startsWith('src/store/')) return { key: 'frontend:store', defaultType: 'feat', scope: 'store' }
  if (p.startsWith('src/lib/')) return { key: 'frontend:lib', defaultType: 'feat', scope: 'lib' }
  if (p.startsWith('src/')) return { key: 'frontend:misc', defaultType: 'feat', scope: 'ui' }
  return { key: 'chore', defaultType: 'chore', scope: 'misc' }
}

/**
 * Эвристика conventional-типа из текста summary/preflight. Если в summary есть
 * явный сигнал (fix/баг, docs/документация, …) — берём его; иначе null (тогда
 * остаётся defaultType зоны).
 */
function detectTypeFromSummary(summary: string | undefined): CommitType | null {
  if (!summary) return null
  const s = summary.toLowerCase()
  // \b ненадёжен перед кириллицей в JS-regex (ASCII-only \w), поэтому
  // кириллические маркеры матчим как подстроки без границы слова.
  if (/(fix|fixes|fixed|bug)\b/.test(s) || /(баг|почини|исправ|чин)/.test(s)) return 'fix'
  if (/(doc|docs|readme)\b/.test(s) || /документ/.test(s)) return 'docs'
  if (/(test)\b/.test(s) || /(тест|покрыт)/.test(s)) return 'test'
  if (/(refactor)\b/.test(s) || /(рефактор|переписать|вынести|вынос)/.test(s)) return 'refactor'
  if (/(chore|bump|cleanup)\b/.test(s) || /(версия|чистка)/.test(s)) return 'chore'
  if (/(feat|feature)\b/.test(s) || /(фича|добав|реализ|новый)/.test(s)) return 'feat'
  return null
}

/** Человекочитаемый subject для группы по её зоне. */
function subjectForZone(key: string, scope: string): string {
  switch (key) {
    case 'test': return 'тесты'
    case 'docs': return 'документация'
    case 'backend:ai': return 'логика агента / провайдеры'
    case 'backend:ipc': return 'IPC-хендлеры'
    case 'backend:storage': return 'слой хранения'
    case 'backend:connectors': return 'коннекторы'
    case 'backend:misc': return 'main-процесс'
    case 'frontend:components': return 'UI-компоненты'
    case 'frontend:store': return 'состояние (store)'
    case 'frontend:lib': return 'renderer-утилиты'
    case 'frontend:misc': return 'renderer'
    default: return `правки ${scope}`
  }
}

/**
 * buildCommitPlan — разложить diff на conventional-группы + собрать
 * commitMessage и prSummary. Пустой diff → пустой план с дефолтным сообщением.
 */
export function buildCommitPlan(input: CommitPlanInput): CommitPlan {
  const overrideType = detectTypeFromSummary(input.summary)
  // Группируем файлы по зоне, сохраняя порядок первого появления.
  const order: string[] = []
  const byZone = new Map<string, { info: ZoneInfo; files: string[] }>()
  for (const entry of input.diffStat) {
    const info = classifyPath(entry.path)
    let bucket = byZone.get(info.key)
    if (!bucket) {
      bucket = { info, files: [] }
      byZone.set(info.key, bucket)
      order.push(info.key)
    }
    bucket.files.push(entry.path)
  }

  const groups: CommitGroup[] = order.map(key => {
    const bucket = byZone.get(key)!
    const info = bucket.info
    // Тип: явный override из summary применяем к «продуктовым» группам
    // (backend/frontend); test/docs-группы сохраняют свой тип независимо от
    // summary — тестовый коммит остаётся test даже если фича = feat.
    const isProductZone = info.defaultType !== 'test' && info.defaultType !== 'docs'
    const type = overrideType && isProductZone ? overrideType : info.defaultType
    return {
      type,
      scope: info.scope,
      subject: subjectForZone(info.key, info.scope),
      files: bucket.files
    }
  })

  const commitMessage = buildCommitMessage(groups, input.summary)
  const prSummary = buildPrSummary(groups, input)
  return { groups, commitMessage, prSummary }
}

/**
 * Итоговое сообщение коммита. Если групп нет — нейтральная заглушка. Если одна
 * группа — однострочный conventional header. Если несколько — header по
 * доминирующей группе (больше всего файлов) + тело со списком всех групп.
 */
function buildCommitMessage(groups: CommitGroup[], summary: string | undefined): string {
  if (groups.length === 0) {
    return summary?.trim() || 'chore: правки без отслеженных файлов'
  }
  if (groups.length === 1) {
    const g = groups[0]
    return `${g.type}(${g.scope}): ${summary?.trim() || g.subject}`
  }
  // Доминирующая группа — по числу файлов (детерминированно: при равенстве
  // выигрывает более ранняя, т.к. reduce идёт по порядку).
  const head = groups.reduce((a, b) => (b.files.length > a.files.length ? b : a))
  const headLine = `${head.type}(${head.scope}): ${summary?.trim() || head.subject}`
  const body = groups
    .map(g => `- ${g.type}(${g.scope}): ${g.subject} (${g.files.length})`)
    .join('\n')
  return `${headLine}\n\n${body}`
}

/** Markdown-сводка для PR: заголовок + список групп с файлами + зоны. */
function buildPrSummary(groups: CommitGroup[], input: CommitPlanInput): string {
  const lines: string[] = []
  const title = input.summary?.trim() || 'Изменения'
  lines.push(`## ${title}`, '')
  if (groups.length === 0) {
    lines.push('_Нет отслеженных изменений в рабочем дереве._')
    return lines.join('\n')
  }
  lines.push('### Состав изменений', '')
  for (const g of groups) {
    lines.push(`**${g.type}(${g.scope})** — ${g.subject}`)
    for (const f of g.files) lines.push(`- \`${f}\``)
    lines.push('')
  }
  if (input.affectedZones && input.affectedZones.length > 0) {
    lines.push('### Затронутые зоны', '')
    lines.push(input.affectedZones.map(z => `\`${z}\``).join(', '))
  }
  return lines.join('\n').trimEnd()
}
