import { ipcMain } from 'electron'
import { createGeminiProvider } from '../ai/gemini'
import { createGeminiCliProvider } from '../ai/gemini-cli'
import { createFileTools, TOOL_DEFS } from '../ai/tools'
import type { ChatMessage, ToolCall, ChatProvider } from '../ai/types'

export type ProviderId = 'gemini-api' | 'gemini-cli'

interface AiDeps {
  getApiKey: () => string | null
  getProviderId: () => ProviderId
}

let currentSendId = 0

interface PendingWrite {
  resolve: (accept: boolean) => void
}
const pendingWrites = new Map<string, PendingWrite>()

interface PendingCommand {
  resolve: (accept: boolean) => void
}
const pendingCommands = new Map<string, PendingCommand>()

export function registerAiIpc(deps: AiDeps): void {
  ipcMain.handle('ai:send', async (e, messages: ChatMessage[], projectPath: string | null) => {
    const providerId = deps.getProviderId()
    const sendId = ++currentSendId

    if (providerId === 'gemini-cli') {
      const provider = createGeminiCliProvider({ cwd: projectPath ?? process.cwd() })
      void runCliConversation(e.sender, sendId, provider, messages)
      return sendId
    }

    // API path
    const apiKey = deps.getApiKey()
    if (!apiKey) {
      e.sender.send('ai:event', { id: 0, event: { type: 'error', message: 'API ключ Gemini не задан. Открой настройки и вставь ключ или переключись на режим CLI (подписка).' } })
      return 0
    }
    const provider = createGeminiProvider({ apiKey })
    const tools = projectPath ? createFileTools(projectPath) : null
    void runApiConversation(e.sender, sendId, provider, tools, projectPath, messages)
    return sendId
  })

  ipcMain.handle('ai:resolve-write', (_e, callId: string, accept: boolean) => {
    const p = pendingWrites.get(callId)
    if (p) {
      p.resolve(accept)
      pendingWrites.delete(callId)
    }
  })

  ipcMain.handle('ai:resolve-command', (_e, callId: string, accept: boolean) => {
    const p = pendingCommands.get(callId)
    if (p) {
      p.resolve(accept)
      pendingCommands.delete(callId)
    }
  })
}

async function runCliConversation(
  sender: Electron.WebContents,
  sendId: number,
  provider: ChatProvider,
  messages: ChatMessage[]
): Promise<void> {
  for await (const event of provider.send(messages, [])) {
    sender.send('ai:event', { id: sendId, event })
    if (event.type === 'done' || event.type === 'error') return
  }
  sender.send('ai:event', { id: sendId, event: { type: 'done' } })
}

async function runApiConversation(
  sender: Electron.WebContents,
  sendId: number,
  provider: ChatProvider,
  tools: ReturnType<typeof createFileTools> | null,
  projectPath: string | null,
  initialMessages: ChatMessage[]
): Promise<void> {
  const currentMessages = [...initialMessages]
  const maxTurns = 5
  for (let turn = 0; turn < maxTurns; turn++) {
    const toolCalls: ToolCall[] = []
    let assistantText = ''
    for await (const event of provider.send(currentMessages, tools ? TOOL_DEFS : [])) {
      if (event.type === 'text') {
        assistantText += event.text
        sender.send('ai:event', { id: sendId, event })
      } else if (event.type === 'tool-call') {
        toolCalls.push(event.call)
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
    if (!tools || toolCalls.length === 0) {
      sender.send('ai:event', { id: sendId, event: { type: 'done' } })
      return
    }
    if (assistantText) currentMessages.push({ role: 'assistant', content: assistantText })

    for (const call of toolCalls) {
      if (call.name === 'write_file' && projectPath) {
        await handleWriteFile(sender, sendId, tools, call, currentMessages)
        continue
      }
      if (call.name === 'run_command' && projectPath) {
        await handleRunCommand(sender, sendId, tools, call, currentMessages)
        continue
      }
      try {
        const result = await tools.execute(call.name, call.args)
        currentMessages.push({
          role: 'user',
          content: `[tool ${call.name} result]\n${JSON.stringify(result).slice(0, 5000)}`
        })
      } catch (err) {
        currentMessages.push({
          role: 'user',
          content: `[tool ${call.name} error]\n${err instanceof Error ? err.message : String(err)}`
        })
      }
    }
  }
  sender.send('ai:event', { id: sendId, event: { type: 'done' } })
}

async function handleWriteFile(
  sender: Electron.WebContents,
  sendId: number,
  tools: ReturnType<typeof createFileTools>,
  call: ToolCall,
  messages: ChatMessage[]
): Promise<void> {
  const path = String(call.args.path)
  const after = String(call.args.content)
  let before = ''
  try {
    before = await tools.execute('read_file', { path }) as string
  } catch {
    before = ''
  }
  sender.send('ai:event', { id: sendId, event: { type: 'pending-write', callId: call.id, path, before, after } })
  const accepted = await new Promise<boolean>(resolve => {
    pendingWrites.set(call.id, { resolve })
  })
  if (accepted) {
    try {
      await tools.execute('write_file', call.args)
      messages.push({ role: 'user', content: `[tool write_file applied to ${path}]` })
    } catch (err) {
      messages.push({ role: 'user', content: `[tool write_file error]\n${err instanceof Error ? err.message : String(err)}` })
    }
  } else {
    messages.push({ role: 'user', content: `[user rejected write to ${path}]` })
  }
}

async function handleRunCommand(
  sender: Electron.WebContents,
  sendId: number,
  tools: ReturnType<typeof createFileTools>,
  call: ToolCall,
  messages: ChatMessage[]
): Promise<void> {
  const command = String(call.args.command ?? '')
  // Layer 1: hard denylist
  const verdict = tools.classifyCommand(command)
  if (!verdict.allowed) {
    sender.send('ai:event', {
      id: sendId,
      event: { type: 'tool-blocked', callId: call.id, name: 'run_command', command, reason: verdict.reason ?? 'denylist' }
    })
    messages.push({
      role: 'user',
      content: `[tool run_command blocked by safety policy]\nКоманда: ${command}\nПричина: ${verdict.reason ?? 'denylist'}`
    })
    return
  }

  // Layer 2: user confirmation
  sender.send('ai:event', { id: sendId, event: { type: 'pending-command', callId: call.id, command } })
  const accepted = await new Promise<boolean>(resolve => {
    pendingCommands.set(call.id, { resolve })
  })
  if (!accepted) {
    sender.send('ai:event', {
      id: sendId,
      event: { type: 'command-result', callId: call.id, command, status: 'rejected' }
    })
    messages.push({ role: 'user', content: `[user rejected run_command]\nКоманда: ${command}` })
    return
  }

  // Execute and report
  try {
    const result = await tools.runCommand(command)
    sender.send('ai:event', {
      id: sendId,
      event: { type: 'command-result', callId: call.id, command, status: 'ok', exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr }
    })
    messages.push({
      role: 'user',
      content: `[tool run_command result]\n${JSON.stringify(result).slice(0, 5000)}`
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    sender.send('ai:event', {
      id: sendId,
      event: { type: 'command-result', callId: call.id, command, status: 'error', error: message }
    })
    messages.push({ role: 'user', content: `[tool run_command error]\n${message}` })
  }
}
