import { ipcMain, type WebContents } from 'electron'
import { createGeminiProvider } from '../ai/gemini'
import type { ChatMessage } from '../ai/types'

let currentSendId = 0

export function registerAiIpc(getApiKey: () => string | null): void {
  ipcMain.handle('ai:send', async (e, messages: ChatMessage[]) => {
    const apiKey = getApiKey()
    if (!apiKey) {
      e.sender.send('ai:event', { id: 0, event: { type: 'error', message: 'API ключ Gemini не задан' } })
      return 0
    }
    const sendId = ++currentSendId
    const provider = createGeminiProvider({ apiKey })
    void streamToRenderer(e.sender, sendId, provider.send(messages, []))
    return sendId
  })
}

async function streamToRenderer(sender: WebContents, id: number, stream: AsyncIterable<unknown>) {
  for await (const event of stream) {
    sender.send('ai:event', { id, event })
  }
}
