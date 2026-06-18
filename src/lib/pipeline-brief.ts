import type { PipelineBrief, PipelineStep } from '../types/api'

/** Шаги «N/5» для баннера: brief(1) собирается в визарде, дальше plan→proof. */
const STEP_ORDER: Record<PipelineStep, number> = {
  brief: 1, plan: 2, execute: 3, verify: 4, proof: 5, completed: 5, cancelled: 5,
}

/** {index 1-based, total} шага для баннера «Pipeline · N/5». */
export function pipelineStepIndex(step: PipelineStep): { index: number; total: number } {
  return { index: STEP_ORDER[step] ?? 1, total: 5 }
}

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

/** Режим агента для авто-send шага pipeline. */
export type PipelineSendMode = 'plan' | 'accept-edits'

/**
 * Параметры авто-send для шага pipeline: текст промпта + режим агента.
 *  - plan → read-only (mode 'plan'), buildPlanPrompt;
 *  - execute → правки (mode 'accept-edits'), buildExecutePrompt с planId;
 *  - остальные шаги (verify/proof/…) авто-send не делают → null.
 */
export function buildPipelineSend(
  step: PipelineStep,
  brief: PipelineBrief,
  planId: number | null,
): { text: string; mode: PipelineSendMode } | null {
  if (step === 'plan') return { text: buildPlanPrompt(brief), mode: 'plan' }
  if (step === 'execute') return { text: buildExecutePrompt(brief, planId ?? 0), mode: 'accept-edits' }
  return null
}
