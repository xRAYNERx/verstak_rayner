import { describe, it, expect, vi } from 'vitest'
import { runSubAgentLoop } from '../../electron/ai/sub-agent-loop'
import type { ToolContext } from '../../electron/ipc/tool-handlers'
import type { ChatProvider, ChatEvent, ChatMessage, ToolDefinition } from '../../electron/ai/types'

/**
 * Регресс багу: суб-executor с write_file в ask-режиме виснет, потому что
 * pending-write Promise в diffConfirmWrite не был привязан к ctx.signal —
 * per-task таймаут/abort не разрывал ожидание подтверждения.
 *
 * Фикс: ожидание pending-write слушает ctx.signal → abort трактуется как reject,
 * суб-loop корректно завершается (не виснет до ручного действия пользователя).
 */

/** Мок-провайдер: на первой итерации модель зовёт write_file, дальше — текст. */
function makeWriteProvider(): ChatProvider {
  let turn = 0
  return {
    id: 'mock',
    name: 'Mock',
    models: ['mock'],
    async *send(_messages: ChatMessage[], _tools: ToolDefinition[]): AsyncGenerator<ChatEvent> {
      turn++
      if (turn === 1) {
        yield { type: 'tool-call', call: { id: 'w1', name: 'write_file', args: { path: 'foo.txt', content: 'hello' } } }
        yield { type: 'done' }
        return
      }
      yield { type: 'text', text: 'готово' }
      yield { type: 'done' }
    }
  }
}

/** Минимальный ToolContext: пишет через мок tools.execute, не трогая ФС. */
function makeCtx(signal: AbortSignal): ToolContext {
  const pendingWrites = new Map<string, { sendId: number; resolve: (a: boolean) => void }>()
  return {
    sender: { send: vi.fn(), exec: vi.fn() },
    sendId: 1,
    signal,
    projectPath: '/tmp/project',
    tools: {
      // read_file (before) → '', write_file → ok. classifyCommand/runCommand не нужны.
      execute: vi.fn(async (name: string) => (name === 'read_file' ? '' : 'ok')),
      runCommand: vi.fn(),
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
    pendingWrites,
    pendingCommands: new Map(),
    scopedKey: (sendId: number, callId: string) => `${sendId}::${callId}`,
    agentMode: 'ask'  // ask → decide(write_file) = 'confirm' → pending-write Promise
  } as unknown as ToolContext
}

describe('sub-agent write в ask-режиме привязан к ctx.signal (регресс)', () => {
  it('abort/timeout субзадачи разрывает ожидание pending-write — суб НЕ виснет', async () => {
    const ac = new AbortController()
    const ctx = makeCtx(ac.signal)
    // Имитируем per-task таймаут: абортим вскоре после старта (pendingWrites
    // НИКОГДА не резолвится вручную — нет UI-подтверждения).
    const timer = setTimeout(() => ac.abort(), 50)

    const result = await runSubAgentLoop({
      provider: makeWriteProvider(),
      messages: [
        { role: 'system', content: 'sub' },
        { role: 'user', content: 'напиши файл' }
      ],
      allowedToolNames: ['write_file'],
      ctx,
      signal: ac.signal,
      role: 'executor'
    })
    clearTimeout(timer)

    // Главное: вернулись (не зависли), и не 'completed' — abort разорвал write.
    expect(result.exitReason).not.toBe('completed')
    // pendingWrites не должен утечь — finish() удаляет запись на abort.
    expect((ctx.pendingWrites as Map<string, unknown>).size).toBe(0)
  }, 3000)  // таймаут теста 3с: без фикса завис бы и упал по таймауту

  it('явный resolve pending-write (accept) тоже работает — write применяется', async () => {
    const ac = new AbortController()
    const ctx = makeCtx(ac.signal)
    // Эмулируем пользователя: как только появилась pending-write — принимаем.
    const poll = setInterval(() => {
      for (const [, p] of ctx.pendingWrites) p.resolve(true)
    }, 10)

    const result = await runSubAgentLoop({
      provider: makeWriteProvider(),
      messages: [
        { role: 'system', content: 'sub' },
        { role: 'user', content: 'напиши файл' }
      ],
      allowedToolNames: ['write_file'],
      ctx,
      signal: ac.signal,
      role: 'executor'
    })
    clearInterval(poll)

    expect(result.exitReason).toBe('completed')
    // write_file реально вызван через tools.execute.
    expect(ctx.tools.execute).toHaveBeenCalledWith('write_file', { path: 'foo.txt', content: 'hello' })
    expect((ctx.pendingWrites as Map<string, unknown>).size).toBe(0)
  }, 3000)
})
