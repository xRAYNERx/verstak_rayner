import { ipcMain } from 'electron'
import { createGeminiProvider } from '../ai/gemini'
import { createFileTools, TOOL_DEFS } from '../ai/tools'
import type { ChatMessage, ToolCall } from '../ai/types'

let currentSendId = 0

export function registerAiIpc(getApiKey: () => string | null): void {
  ipcMain.handle('ai:send', async (e, messages: ChatMessage[], projectPath: string | null) => {
    const apiKey = getApiKey()
    if (!apiKey) {
      e.sender.send('ai:event', { id: 0, event: { type: 'error', message: 'API ключ Gemini не задан' } })
      return 0
    }
    const sendId = ++currentSendId
    const provider = createGeminiProvider({ apiKey })
    const tools = projectPath ? createFileTools(projectPath) : null

    void runConversation(e.sender, sendId, provider, tools, messages)
    return sendId
  })
}

async function runConversation(
  sender: Electron.WebContents,
  sendId: number,
  provider: ReturnType<typeof createGeminiProvider>,
  tools: ReturnType<typeof createFileTools> | null,
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
