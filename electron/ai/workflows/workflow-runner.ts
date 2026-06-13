import type { WorkflowDefinition } from './types'

/**
 * buildWorkflowPrompt — собирает пошаговый промпт для агента из определения
 * workflow и брифа пользователя. Pure-функция (без побочных эффектов), легко
 * тестируется.
 *
 * Промпт явно требует от агента два каркасных действия:
 *  - в начале вызвать create_plan по шагам workflow (фиксирует прогресс в Plan);
 *  - в конце вызвать generate_html с итоговым артефактом-лендингом.
 */
export function buildWorkflowPrompt(def: WorkflowDefinition, brief: string): string {
  const trimmedBrief = brief.trim()
  const briefBlock = trimmedBrief.length > 0 ? trimmedBrief : '(бриф не указан — уточни недостающее у пользователя или сделай разумные допущения)'

  const stepsBlock = def.steps.map((step, i) => {
    const tools = step.suggestedTools && step.suggestedTools.length > 0
      ? ` (рекомендуемые инструменты: ${step.suggestedTools.join(', ')})`
      : ''
    return `${i + 1}. ${step.title}${tools}\n   ${step.instruction}`
  }).join('\n\n')

  return [
    `Запусти workflow «${def.name}». ${def.description}`,
    '',
    'Бриф клиента:',
    briefBlock,
    '',
    `Выполни последовательно все ${def.steps.length} шагов:`,
    '',
    stepsBlock,
    '',
    'Требования к прогону:',
    '- Начни с вызова инструмента create_plan: создай план по шагам выше, чтобы прогресс был виден в разделе Plan.',
    '- Проходи шаги по порядку, отмечая прогресс.',
    '- Заверши прогон обязательным вызовом инструмента generate_html с итоговым артефактом-лендингом из последнего шага.'
  ].join('\n')
}
