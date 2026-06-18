import type { PipelineBrief } from '../types/api'

/** Пустой бриф для инициализации формы визарда. */
export const EMPTY_BRIEF: PipelineBrief = { goal: '', constraints: '', dod: '' }

/**
 * Бриф готов к «Сформировать план», когда заданы цель и Definition of Done.
 * Границы (constraints) опциональны — не каждая задача их требует.
 */
export function isBriefReady(brief: PipelineBrief): boolean {
  return brief.goal.trim().length > 0 && brief.dod.trim().length > 0
}

/**
 * Промпт Plan-шага (спек §3.2). Read-only: модель составляет план и вызывает
 * create_plan, НЕ трогая файлы.
 */
export function buildPlanPrompt(brief: PipelineBrief): string {
  const constraints = brief.constraints.trim() || '—'
  return [
    `Задача: ${brief.goal.trim()}`,
    `Не трогать: ${constraints}`,
    `DoD: ${brief.dod.trim()}`,
    '',
    'Составь план из 3–7 шагов. НЕ вноси изменений в файлы.',
    'Вызови create_plan. В конце — риски и список файлов которые затронешь.',
  ].join('\n')
}

/**
 * Промпт Execute-шага (спек §3.3). Выполнить утверждённый план + обязательный
 * attest_verification по DoD на финале.
 */
export function buildExecutePrompt(brief: PipelineBrief, planId: number): string {
  return [
    `Выполни утверждённый план (plan id=${planId}).`,
    `DoD: ${brief.dod.trim()}`,
    'По завершении ОБЯЗАТЕЛЬНО вызови attest_verification с task_summary и checks из DoD.',
  ].join('\n')
}
