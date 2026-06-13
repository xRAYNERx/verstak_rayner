import { ipcMain } from 'electron'
import { WORKFLOWS, getWorkflow } from '../ai/workflows/registry'
import { buildWorkflowPrompt } from '../ai/workflows/workflow-runner'
import type { WorkflowRunState } from '../ai/workflows/types'

/**
 * IPC для Agency Workflows.
 *
 *  - workflows:list  → каталог workflow'ов (id/name/description/icon/кол-во шагов).
 *  - workflows:start → собирает промпт через buildWorkflowPrompt, детерминированно
 *    создаёт план из шагов workflow (видим сразу в WorkflowView) и возвращает
 *    { prompt, planId, runState }. Сам прогон стартует в renderer штатным
 *    window.api.ai.send — core send-путь не трогаем.
 */

export interface WorkflowsIpcDeps {
  // Детерминированное создание плана (та же функция, что recordPlan/create_plan).
  createPlan: (projectPath: string, title: string, steps: Array<{ title: string; detail?: string | null }>) => { id: number }
}

export function registerWorkflowsIpc(deps: WorkflowsIpcDeps): void {
  ipcMain.handle('workflows:list', () => {
    return WORKFLOWS.map(w => ({
      id: w.id,
      name: w.name,
      description: w.description,
      icon: w.icon ?? null,
      stepCount: w.steps.length
    }))
  })

  ipcMain.handle('workflows:start', (_e, workflowId: string, projectPath: string, brief: string) => {
    const def = getWorkflow(workflowId)
    if (!def) {
      return { error: 'unknown-workflow', message: `Нет workflow "${workflowId}"` }
    }

    const prompt = buildWorkflowPrompt(def, brief ?? '')

    // Детерминированно создаём план из шагов workflow — чтобы он сразу появился
    // в WorkflowView, не дожидаясь, пока агент вызовет create_plan.
    const plan = deps.createPlan(
      projectPath,
      def.name,
      def.steps.map(s => ({ title: s.title, detail: s.instruction }))
    )

    const runState: WorkflowRunState = {
      workflowId: def.id,
      status: 'pending',
      currentStep: 0,
      startedAt: Date.now(),
      planId: plan.id,
      brief: brief ?? ''
    }

    return { prompt, planId: plan.id, runState }
  })
}
