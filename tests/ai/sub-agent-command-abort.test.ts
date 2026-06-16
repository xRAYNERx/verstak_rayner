import { describe, it, expect, vi } from 'vitest'
import { runSubAgentLoop } from '../../electron/ai/sub-agent-loop'
import type { ToolContext } from '../../electron/ipc/tool-handlers'
import type { ChatProvider, ChatEvent, ChatMessage, ToolDefinition } from '../../electron/ai/types'

/**
 * Аудит B2 (регресс): подтверждение run_command в ask-режиме виснет, потому что
 * Promise ожидания не был привязан к ctx.signal — per-task таймаут субагента и
 * групповая отмена роя (delegate/orchestrate/swarm) НЕ разрывали ожидание, и
 * весь ai:send висел до ручного Stop.
 *
 * Фикс: awaitCommandConfirm слушает ctx.signal → abort трактуется как reject,
 * суб-loop корректно завершается ('aborted'), а pendingCommands не утекает.
 * Тот же паттерн, что уже был у write_file (sub-agent-write-abort.test.ts).
 */

/** Мок-провайдер: первая итерация зовёт run_command, дальше — текст. */
function makeCommandProvider(): ChatProvider {
  let turn = 0
  return {
    id: 'mock',
    name: 'Mock',
    models: ['mock'],
    async *send(_messages: ChatMessage[], _tools: ToolDefinition[]): AsyncGenerator<ChatEvent> {
      turn++
      if (turn === 1) {
        yield { type: 'tool-call', call: { id: 'c1', name: 'run_command', args: { command: 'echo hi' } } }
        yield { type: 'done' }
        return
      }
      yield { type: 'text', text: 'готово' }
      yield { type: 'done' }
    }
  }
}

/** Минимальный ToolContext: classifyCommand разрешает, runCommand — мок (не должен вызваться при abort). */
function makeCtx(signal: AbortSignal): ToolContext {
  const pendingCommands = new Map<string, { sendId: number; resolve: (a: boolean) => void }>()
  return {
    sender: { send: vi.fn(), exec: vi.fn() },
    sendId: 1,
    signal,
    projectPath: '/tmp/project',
    tools: {
      execute: vi.fn(async () => 'ok'),
      runCommand: vi.fn(async () => ({ stdout: 'hi', stderr: '', exitCode: 0 })),
      classifyCommand: vi.fn(() => ({ allowed: true })) as never
    } as never,
    recordWrite: vi.fn(),
    recordPlan: vi.fn(),
    recordJournal: vi.fn(),
    readJournal: vi.fn(() => []),
    saveMemory: vi.fn(() => ({ id: 'm1' })),
    searchMemories: vi.fn(() => []),
    searchConversations: vi.fn(() => []),
    connectors: { list: () => [], query: async () => ({}) },
    pendingAttachments: [],
    pendingWrites: new Map(),
    pendingCommands,
    scopedKey: (sendId: number, callId: string) => `${sendId}::${callId}`,
    agentMode: 'ask'  // ask → decide(run_command) = 'confirm' → awaitCommandConfirm
  } as unknown as ToolContext
}

describe('sub-agent run_command в ask-режиме привязан к ctx.signal (регресс B2)', () => {
  it('abort/timeout субзадачи разрывает ожидание confirm — суб НЕ виснет', async () => {
    const ac = new AbortController()
    const ctx = makeCtx(ac.signal)
    // Имитируем per-task таймаут: абортим вскоре после старта (pendingCommands
    // НИКОГДА не резолвится вручную — нет UI-подтверждения).
    const timer = setTimeout(() => ac.abort(), 50)

    const result = await runSubAgentLoop({
      provider: makeCommandProvider(),
      messages: [
        { role: 'system', content: 'sub' },
        { role: 'user', content: 'запусти команду' }
      ],
      allowedToolNames: ['run_command'],
      ctx,
      signal: ac.signal,
      role: 'executor'
    })
    clearTimeout(timer)

    // Главное: вернулись (не зависли), и не 'completed' — abort разорвал confirm.
    expect(result.exitReason).not.toBe('completed')
    // runCommand НЕ должен был выполниться — команда не подтверждена.
    expect(ctx.tools.runCommand).not.toHaveBeenCalled()
    // pendingCommands не должен утечь — finish() удаляет запись на abort.
    expect((ctx.pendingCommands as Map<string, unknown>).size).toBe(0)
  }, 3000)  // таймаут теста 3с: без фикса завис бы и упал по таймауту

  it('явный resolve confirm (accept) тоже работает — команда выполняется', async () => {
    const ac = new AbortController()
    const ctx = makeCtx(ac.signal)
    // Эмулируем пользователя: как только появилась pending-command — принимаем.
    const poll = setInterval(() => {
      for (const [, p] of ctx.pendingCommands) p.resolve(true)
    }, 10)

    const result = await runSubAgentLoop({
      provider: makeCommandProvider(),
      messages: [
        { role: 'system', content: 'sub' },
        { role: 'user', content: 'запусти команду' }
      ],
      allowedToolNames: ['run_command'],
      ctx,
      signal: ac.signal,
      role: 'executor'
    })
    clearInterval(poll)

    expect(result.exitReason).toBe('completed')
    // run_command реально вызван через tools.runCommand.
    expect(ctx.tools.runCommand).toHaveBeenCalledWith('echo hi')
    expect((ctx.pendingCommands as Map<string, unknown>).size).toBe(0)
  }, 3000)
})
