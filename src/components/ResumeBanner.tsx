import { useMemo, useState } from 'react'
import { useProject } from '../store/projectStore'
import type { ResumableRun } from '../types/api'

function isPlaceholderRun(run: ResumableRun) {
  return run.runId.startsWith('chat-placeholder:')
}

function truncate(text: string, limit = 90) {
  return text.length > limit ? `${text.slice(0, limit)}...` : text
}

function buildRecoveryAuditPrompt(userRequest: string, partialAnswer: string, partialThinking: string) {
  const lines = [
    'An AI task was interrupted when the desktop app closed.',
    'Do NOT blindly continue the previous reasoning and do NOT restart the task from scratch.',
    'Your first job is to audit what was actually completed for the latest user request.',
    'Use the chat history, visible partial answer, saved reasoning/state, tool results, files, project state, and any available external state as evidence.',
    'Treat saved reasoning as a hint only. It is not proof that an action was completed.',
    'Before doing more work, briefly identify: confirmed completed work, uncertain work that needs checking, and remaining work.',
    'Do not repeat actions that are already confirmed completed.',
    'Continue only with the remaining confirmed-not-done part of the task.',
    'If you cannot verify external state safely, say what must be checked before proceeding.',
    '',
    'Latest user request:',
    userRequest
  ]

  if (partialAnswer) {
    lines.push('', 'Visible assistant fragment before interruption:', partialAnswer)
  }
  if (partialThinking) {
    lines.push('', 'Saved assistant reasoning/state before interruption, for audit context only:', partialThinking)
  }

  lines.push('', 'Audit the task state now, then continue only the unfinished part:')
  return lines.join('\n')
}

export function ResumeBanner() {
  const resumableRuns = useProject(s => s.resumableRuns)
  const messages = useProject(s => s.messages)
  const path = useProject(s => s.path)
  const activeChatId = useProject(s => s.activeChatId)
  const isStreaming = useProject(s => s.isStreaming)
  const streamStartedAt = useProject(s => s.streamStartedAt)
  const sendOwners = useProject(s => s.sendOwners)
  const dismissResumableRun = useProject(s => s.dismissResumableRun)
  const setActiveView = useProject(s => s.setActiveView)
  const switchChatSession = useProject(s => s.switchChatSession)
  const setStreaming = useProject(s => s.setStreaming)
  const [dismissedLocal, setDismissedLocal] = useState<Set<string>>(() => new Set())

  const fallbackRun = useMemo<ResumableRun | null>(() => {
    if (!path || activeChatId == null || messages.length < 2) return null
    const hasLiveOwner = Object.values(sendOwners).some(
      owner => owner.kind === 'chat' && !owner.isHelp && owner.chatId === activeChatId
    )
    const last = messages[messages.length - 1]
    if (last.role !== 'assistant') return null

    const partialAnswer = last.content.trim()
    const partialThinking = last.thinking?.trim() ?? ''
    const freshStreaming = isStreaming && streamStartedAt != null && Date.now() - streamStartedAt < 15000
    if (freshStreaming) return null
    if (isStreaming && hasLiveOwner) return null
    const staleStreaming = isStreaming && !hasLiveOwner
    if (partialAnswer && !staleStreaming) return null

    const prevUser = [...messages.slice(0, -1)].reverse().find(m => m.role === 'user' && m.content.trim())
    if (!prevUser) return null

    return {
      runId: `chat-placeholder:${activeChatId}:${last.dbId ?? messages.length}`,
      projectPath: path,
      chatId: activeChatId,
      title: partialAnswer || partialThinking ? 'Частично сохраненный ответ' : 'Ответ не успел сохраниться',
      lastUserRequest: prevUser.content,
      turnIndex: messages.filter(m => m.role === 'user').length,
      lastToolName: null,
      agentMode: null,
      startedAt: last.createdAt ?? Date.now(),
      autoResumable: true
    }
  }, [activeChatId, isStreaming, messages, path, sendOwners, streamStartedAt])

  const runs = useMemo(() => {
    const actual = resumableRuns.filter(run => !dismissedLocal.has(run.runId))
    if (!fallbackRun || dismissedLocal.has(fallbackRun.runId)) return actual
    if (actual.some(run => run.chatId === fallbackRun.chatId)) return actual
    return [fallbackRun, ...actual]
  }, [dismissedLocal, fallbackRun, resumableRuns])

  if (runs.length === 0) return null

  function dismiss(run: ResumableRun) {
    if (isPlaceholderRun(run)) {
      setDismissedLocal(prev => new Set(prev).add(run.runId))
      return
    }
    dismissResumableRun(run.runId)
  }

  async function resume(run: ResumableRun) {
    try {
      if (run.chatId != null) await switchChatSession(run.chatId)
    } catch {
      // Best effort: if the chat was removed, the re-send stays in the current chat.
    }

    setActiveView('chat')
    setStreaming(false)

    const current = useProject.getState()
    const last = current.messages[current.messages.length - 1]
    const partialAnswer = last?.role === 'assistant' ? last.content.trim() : ''
    const partialThinking = last?.role === 'assistant' ? (last.thinking?.trim() ?? '') : ''
    const hasSavedWork = !!(partialAnswer || partialThinking)

    const resumeText = buildRecoveryAuditPrompt(run.lastUserRequest, partialAnswer, partialThinking)
    dismiss(run)
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('gg-resume-send', {
        detail: {
          modelText: resumeText
        }
      }))
    }, 0)
  }

  function showWhatWasDone(run: ResumableRun) {
    setActiveView('tasks-manager')
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('gg-open-agent-run', { detail: run.runId }))
    }, 0)
    dismiss(run)
  }

  return (
    <div className="gg-resume-banner-stack">
      {runs.map(run => {
        const toolNote = run.lastToolName ? `, последний инструмент: ${run.lastToolName}` : ''
        const last = messages[messages.length - 1]
        const partialAnswer = isPlaceholderRun(run) && run.chatId === activeChatId && last?.role === 'assistant'
          ? last.content.trim()
          : ''
        const partialThinking = isPlaceholderRun(run) && run.chatId === activeChatId && last?.role === 'assistant'
          ? (last.thinking?.trim() ?? '')
          : ''
        const hasSavedWork = !!(partialAnswer || partialThinking)
        const primaryLabel = '↻ Проверить и продолжить'
        const primaryTitle = 'Сначала проверить, что уже было сделано по последней задаче, затем продолжить только остаток'

        return (
          <div key={run.runId} className="gg-resume-banner" role="status">
            <span className="gg-resume-banner-icon">⏸</span>
            <div className="gg-resume-banner-body">
              <div className="gg-resume-banner-title">Задача была прервана</div>
              <div className="gg-resume-banner-detail">
                «{truncate(run.lastUserRequest)}» (ход {run.turnIndex}{toolNote})
              </div>
              {!run.autoResumable && (
                <div className="gg-resume-banner-warn">
                  Последнее действие могло менять файлы или систему. Автоматическое продолжение отключено, но можно вручную переотправить запрос.
                </div>
              )}
              {isPlaceholderRun(run) && !hasSavedWork && (
                <div className="gg-resume-banner-warn">
                  Ответ прервался. При продолжении модель сначала проверит, что уже было сделано, и продолжит только оставшуюся часть.
                </div>
              )}
            </div>
            <div className="gg-resume-banner-actions">
              <button
                type="button"
                className="gg-btn gg-btn-primary"
                onClick={() => void resume(run)}
                title={primaryTitle}
              >
                {primaryLabel}
              </button>
              {!run.autoResumable && !isPlaceholderRun(run) && (
                <button
                  type="button"
                  className="gg-btn"
                  onClick={() => showWhatWasDone(run)}
                  title="Открыть задачу: timeline, затронутые файлы и проверки"
                >
                  Показать что было
                </button>
              )}
              <button
                type="button"
                className="gg-btn"
                onClick={() => dismiss(run)}
                title="Скрыть на этот запуск"
              >
                Отклонить
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
