/**
 * Agency Workflows — типы предопределённых production-сценариев.
 *
 * Workflow — это «рецепт» многошаговой задачи агентства (аудит конкурентов,
 * подготовка КП и т.п.): фиксированный набор шагов с инструкциями, который
 * запускается одной кнопкой. Прогон идёт штатным agent-loop'ом — workflow лишь
 * формирует пошаговый промпт и детерминированно создаёт план.
 */

/** Один шаг workflow: что агент делает на этом шаге. */
export interface WorkflowStep {
  id: string
  title: string
  // instruction — конкретное действие агента на этом шаге (попадает в промпт).
  instruction: string
  // Подсказка какими тулзами шаг удобнее делать (browser-tools, generate_html…).
  suggestedTools?: string[]
}

/** Определение workflow: каталожная карточка + список шагов. */
export interface WorkflowDefinition {
  id: string
  name: string
  description: string
  icon?: string
  steps: WorkflowStep[]
}

/** Состояние одного прогона workflow (минимально для UI/возврата из IPC). */
export interface WorkflowRunState {
  workflowId: string
  status: 'pending' | 'running' | 'done' | 'error'
  currentStep: number
  startedAt: number
  // planId — id детерминированно созданного плана (для связки с WorkflowView).
  planId?: number
  // brief — исходный бриф пользователя, с которого стартует прогон.
  brief?: string
}
