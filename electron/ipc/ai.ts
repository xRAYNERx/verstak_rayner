import { ipcMain } from 'electron'
import { createFileTools, TOOL_DEFS } from '../ai/tools'
import { createProvider, PROVIDERS, type ProviderId } from '../ai/registry'
import { loadUserLayer } from '../ai/user-layer'
import { composeSystemPrompt } from '../ai/compose-prompt'
import type { ChatMessage, ToolCall, ToolResult, ChatProvider } from '../ai/types'

export type { ProviderId } from '../ai/registry'

interface AiDeps {
  getSecret: (key: string) => string | null
  getProviderId: () => ProviderId
  getProviderModel: (id: ProviderId) => string | null
  /** Persist a write so the user can ↶ revert it later. */
  recordWrite: (projectPath: string, filePath: string, before: string, after: string) => void
}

let currentSendId = 0
const activeAborts = new Map<number, AbortController>()

interface PendingWrite { resolve: (accept: boolean) => void }
const pendingWrites = new Map<string, PendingWrite>()

interface PendingCommand { resolve: (accept: boolean) => void }
const pendingCommands = new Map<string, PendingCommand>()

export function registerAiIpc(deps: AiDeps): void {
  ipcMain.handle('ai:send', async (e, messages: ChatMessage[], projectPath: string | null) => {
    const providerId = deps.getProviderId()
    const descriptor = PROVIDERS[providerId]
    const sendId = ++currentSendId
    const ctrl = new AbortController()
    activeAborts.set(sendId, ctrl)
    const cleanup = () => { activeAborts.delete(sendId) }

    // Load project's user-layer (AGENTS.md / CLAUDE.md / GEMINI.md / our RULES.md)
    // and prepend the immutable system layer + user layer as a single system message.
    // CLI providers run their own agent inside, so we don't inject for them — the
    // user's AGENTS.md is already picked up by Claude Code / Codex / Grok Build natively.
    const injectSystem = descriptor.transport === 'API'
    let messagesWithSystem = messages
    if (injectSystem) {
      const userLayer = await loadUserLayer(projectPath)
      const composed = composeSystemPrompt(userLayer)
      messagesWithSystem = [{ role: 'system', content: composed.system }, ...messages]
    }

    // Resolve API key (or null for CLI)
    const apiKey = descriptor.secretKey ? deps.getSecret(descriptor.secretKey) : null
    if (descriptor.secretKey && !apiKey) {
      e.sender.send('ai:event', {
        id: 0,
        event: {
          type: 'error',
          message: `API ключ для ${descriptor.name} не задан. Открой настройки и добавь ключ или переключи провайдера.`
        }
      })
      cleanup()
      return 0
    }

    const model = deps.getProviderModel(providerId) ?? descriptor.defaultModel
    let provider: ChatProvider
    try {
      provider = createProvider(providerId, {
        apiKey,
        model,
        cwd: projectPath ?? process.cwd(),
        signal: ctrl.signal
      })
    } catch (err) {
      e.sender.send('ai:event', {
        id: 0,
        event: { type: 'error', message: err instanceof Error ? err.message : String(err) }
      })
      cleanup()
      return 0
    }

    if (descriptor.supportsTools && projectPath) {
      const tools = createFileTools(projectPath)
      void runApiConversation(e.sender, sendId, provider, tools, projectPath, messagesWithSystem, ctrl.signal, deps.recordWrite).finally(cleanup)
    } else {
      void runPlainConversation(e.sender, sendId, provider, messagesWithSystem, ctrl.signal).finally(cleanup)
    }
    return sendId
  })

  ipcMain.handle('ai:stop', (_e, sendId: number) => {
    const ctrl = activeAborts.get(sendId)
    if (!ctrl) return false
    ctrl.abort()
    activeAborts.delete(sendId)
    for (const [k, p] of pendingWrites) { p.resolve(false); pendingWrites.delete(k) }
    for (const [k, p] of pendingCommands) { p.resolve(false); pendingCommands.delete(k) }
    return true
  })

  ipcMain.handle('ai:resolve-write', (_e, callId: string, accept: boolean) => {
    const p = pendingWrites.get(callId)
    if (p) { p.resolve(accept); pendingWrites.delete(callId) }
  })

  ipcMain.handle('ai:resolve-command', (_e, callId: string, accept: boolean) => {
    const p = pendingCommands.get(callId)
    if (p) { p.resolve(accept); pendingCommands.delete(callId) }
  })
}

/**
 * Plain streaming conversation — no tools, no multi-turn. Used for providers
 * that don't support function calling yet (Claude/Grok/OpenAI/Gemini CLI).
 */
async function runPlainConversation(
  sender: Electron.WebContents,
  sendId: number,
  provider: ChatProvider,
  messages: ChatMessage[],
  signal: AbortSignal
): Promise<void> {
  for await (const event of provider.send(messages, [])) {
    if (signal.aborted) {
      sender.send('ai:event', { id: sendId, event: { type: 'done' } })
      return
    }
    sender.send('ai:event', { id: sendId, event })
    if (event.type === 'done' || event.type === 'error') return
  }
  sender.send('ai:event', { id: sendId, event: { type: 'done' } })
}

// Type re-exports for renderer (api.d.ts)
export type { UsageDelta } from '../ai/types'

/**
 * Full agentic loop with file tools + diff confirmation + command sandbox.
 * Only providers that support function calling go through here.
 */
const MAX_AGENT_TURNS = 8

function callSignature(call: ToolCall): string {
  return `${call.name}::${JSON.stringify(call.args)}`
}

async function runApiConversation(
  sender: Electron.WebContents,
  sendId: number,
  provider: ChatProvider,
  tools: ReturnType<typeof createFileTools>,
  projectPath: string,
  initialMessages: ChatMessage[],
  signal: AbortSignal,
  recordWrite: (projectPath: string, filePath: string, before: string, after: string) => void
): Promise<void> {
  const currentMessages = [...initialMessages]
  // Loop detection — same tool+args appearing 2+ times in a row is a bad sign.
  const recentSignatures: string[] = []

  for (let turn = 0; turn < MAX_AGENT_TURNS; turn++) {
    if (signal.aborted) {
      sender.send('ai:event', { id: sendId, event: { type: 'done' } })
      return
    }
    const toolCalls: ToolCall[] = []
    let assistantText = ''
    for await (const event of provider.send(currentMessages, TOOL_DEFS)) {
      if (signal.aborted) {
        sender.send('ai:event', { id: sendId, event: { type: 'done' } })
        return
      }
      if (event.type === 'text') {
        assistantText += event.text
        sender.send('ai:event', { id: sendId, event })
      } else if (event.type === 'tool-call') {
        toolCalls.push(event.call)
      } else if (event.type === 'usage') {
        sender.send('ai:event', { id: sendId, event })
      } else if (event.type === 'done') {
        if (toolCalls.length === 0) {
          sender.send('ai:event', { id: sendId, event })
          return
        }
      } else if (event.type === 'error') {
        sender.send('ai:event', { id: sendId, event })
        return
      }
    }
    if (toolCalls.length === 0) {
      sender.send('ai:event', { id: sendId, event: { type: 'done' } })
      return
    }

    // Loop detection — check if AI repeated the same tool call this turn
    const loopHits: ToolCall[] = []
    for (const c of toolCalls) {
      const sig = callSignature(c)
      const seen = recentSignatures.filter(s => s === sig).length
      if (seen >= 2) loopHits.push(c)
      recentSignatures.push(sig)
    }
    // Keep window small
    while (recentSignatures.length > 8) recentSignatures.shift()

    currentMessages.push({ role: 'assistant', content: assistantText, toolCalls })

    if (loopHits.length > 0) {
      sender.send('ai:event', {
        id: sendId,
        event: {
          type: 'tool-blocked',
          callId: loopHits[0].id,
          name: loopHits[0].name,
          reason: `Зацикливание: один и тот же вызов повторён 3+ раза подряд. Цикл остановлен.`
        }
      })
      // Feed back a supervisor note instead of executing again
      currentMessages.push({
        role: 'user',
        content: '',
        toolResults: loopHits.map(c => ({
          id: c.id,
          name: c.name,
          result: '',
          error: 'Supervisor: вы зациклились — этот же вызов повторён несколько раз. Смените подход или сообщите пользователю что нужна помощь.'
        }))
      })
      sender.send('ai:event', { id: sendId, event: { type: 'done' } })
      return
    }

    const toolResults: ToolResult[] = []
    for (const call of toolCalls) {
      if (call.name === 'write_file') {
        toolResults.push(await handleWriteFile(sender, sendId, tools, call, projectPath, recordWrite))
        continue
      }
      if (call.name === 'run_command') {
        toolResults.push(await handleRunCommand(sender, sendId, tools, call))
        continue
      }
      try {
        const result = await tools.execute(call.name, call.args)
        toolResults.push({ id: call.id, name: call.name, result })
      } catch (err) {
        toolResults.push({
          id: call.id,
          name: call.name,
          result: '',
          error: err instanceof Error ? err.message : String(err)
        })
      }
    }
    currentMessages.push({ role: 'user', content: '', toolResults })
  }
  // Max turns reached — warn user and exit
  sender.send('ai:event', {
    id: sendId,
    event: {
      type: 'tool-blocked',
      callId: 'maxturns',
      name: 'agent-loop',
      reason: `Достигнут лимит ${MAX_AGENT_TURNS} итераций агента. Цикл остановлен — задача может быть не завершена.`
    }
  })
  sender.send('ai:event', { id: sendId, event: { type: 'done' } })
}

async function handleWriteFile(
  sender: Electron.WebContents,
  sendId: number,
  tools: ReturnType<typeof createFileTools>,
  call: ToolCall,
  projectPath: string,
  recordWrite: (projectPath: string, filePath: string, before: string, after: string) => void
): Promise<ToolResult> {
  const path = String(call.args.path)
  const after = String(call.args.content)
  let before = ''
  try { before = await tools.execute('read_file', { path }) as string } catch { before = '' }
  sender.send('ai:event', { id: sendId, event: { type: 'pending-write', callId: call.id, path, before, after } })
  const accepted = await new Promise<boolean>(resolve => { pendingWrites.set(call.id, { resolve }) })
  if (accepted) {
    try {
      await tools.execute('write_file', call.args)
      // Save the before/after pair so the user can ↶ revert this write later
      try { recordWrite(projectPath, path, before, after) } catch { /* undo storage failure shouldn't block the write */ }
      return { id: call.id, name: call.name, result: `Applied write to ${path}` }
    } catch (err) {
      return { id: call.id, name: call.name, result: '', error: err instanceof Error ? err.message : String(err) }
    }
  }
  return { id: call.id, name: call.name, result: `User rejected write to ${path}`, error: 'User rejected' }
}

async function handleRunCommand(
  sender: Electron.WebContents,
  sendId: number,
  tools: ReturnType<typeof createFileTools>,
  call: ToolCall
): Promise<ToolResult> {
  const command = String(call.args.command ?? '')
  const verdict = tools.classifyCommand(command)
  if (!verdict.allowed) {
    sender.send('ai:event', {
      id: sendId,
      event: { type: 'tool-blocked', callId: call.id, name: 'run_command', command, reason: verdict.reason ?? 'denylist' }
    })
    return {
      id: call.id,
      name: call.name,
      result: `Command: ${command}`,
      error: `Blocked by safety policy: ${verdict.reason ?? 'denylist'}`
    }
  }

  sender.send('ai:event', { id: sendId, event: { type: 'pending-command', callId: call.id, command } })
  const accepted = await new Promise<boolean>(resolve => { pendingCommands.set(call.id, { resolve }) })
  if (!accepted) {
    sender.send('ai:event', {
      id: sendId,
      event: { type: 'command-result', callId: call.id, command, status: 'rejected' }
    })
    return { id: call.id, name: call.name, result: `Command: ${command}`, error: 'User rejected' }
  }

  try {
    const result = await tools.runCommand(command)
    sender.send('ai:event', {
      id: sendId,
      event: { type: 'command-result', callId: call.id, command, status: 'ok', exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr }
    })
    return { id: call.id, name: call.name, result }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    sender.send('ai:event', {
      id: sendId,
      event: { type: 'command-result', callId: call.id, command, status: 'error', error: msg }
    })
    return { id: call.id, name: call.name, result: '', error: msg }
  }
}
