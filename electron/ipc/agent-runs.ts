import { ipcMain } from 'electron'
import type { AgentRuns, AgentRunStatus, AgentRunOwner } from '../storage/agent-runs'
import type { SubSessions } from '../storage/sub-sessions'
import type { SessionTodos } from '../storage/session-todos'

/**
 * IPC для вкладки «Задачи» (Multi-agent Manager V1, Фаза 3) — read-only.
 *
 * Один ai:send = одна строка agent_runs. Эта вкладка — высокоуровневый
 * командный центр прогонов (в отличие от низкоуровневого AgentsPanel,
 * который инспектит суб-сессии). Stop/Resume — Фаза 4, здесь только чтение.
 *
 *  - agent-runs:list → прогоны проекта (новейшие первыми, фильтры status/owner)
 *  - agent-runs:get  → агрегат одного прогона: run + events (Timeline) +
 *    субы (parentChatId == run.chatId) + todos (sessionId == run.chatId)
 */
export function registerAgentRunsIpc(
  agentRuns: AgentRuns,
  subSessions: SubSessions,
  sessionTodos: SessionTodos
): void {
  ipcMain.handle(
    'agent-runs:list',
    (_e, projectPath: string, opts?: { status?: AgentRunStatus; owner?: AgentRunOwner; limit?: number }) =>
      agentRuns.list(projectPath, opts)
  )

  ipcMain.handle('agent-runs:get', (_e, runId: string) => {
    const run = agentRuns.get(runId)
    // Прогона нет (удалён / неизвестный id) — отдаём пустой агрегат, чтобы
    // панель показала «не найдено» без падения.
    if (!run) return { run: null, events: [], subs: [], todos: [] }
    const events = agentRuns.getEvents(runId)
    // Субы этого прогона: суб-сессии проекта, чей parentChatId совпадает с
    // chatId прогона. Если у прогона нет chatId — субов нет.
    const subs = run.chatId != null
      ? subSessions.listByProject(run.projectPath).filter(s => s.parentChatId === run.chatId)
      : []
    // Todos прогона — оркестрационный лист той же сессии (chatId).
    const todos = run.chatId != null
      ? sessionTodos.list(run.projectPath, run.chatId)
      : []
    return { run, events, subs, todos }
  })
}
