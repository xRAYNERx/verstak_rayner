import type { WorkflowDefinition } from './types'
import { marketingAudit } from './marketing-audit'

// Единый источник истины списка workflow'ов. Новый сценарий = одна строка здесь.
export const WORKFLOWS: WorkflowDefinition[] = [
  marketingAudit
]

/** Найти workflow по id (или undefined, если такого нет). */
export function getWorkflow(id: string): WorkflowDefinition | undefined {
  return WORKFLOWS.find(w => w.id === id)
}
