import type { WorkflowDefinition } from './types'
import { marketingAudit } from './marketing-audit'
import { ydirectMetrikaAudit } from './ydirect-metrika-audit'
import { bitrixStaleDeals } from './bitrix-stale-deals'
import { onecSheetsReconcile } from './onec-sheets-reconcile'

// Единый источник истины списка workflow'ов. Новый сценарий = одна строка здесь.
export const WORKFLOWS: WorkflowDefinition[] = [
  marketingAudit,
  // F9: RU Agency Pack — готовые сценарии поверх коннекторов.
  ydirectMetrikaAudit,
  bitrixStaleDeals,
  onecSheetsReconcile
]

/** Найти workflow по id (или undefined, если такого нет). */
export function getWorkflow(id: string): WorkflowDefinition | undefined {
  return WORKFLOWS.find(w => w.id === id)
}
