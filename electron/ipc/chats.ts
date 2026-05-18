import { ipcMain } from 'electron'
import type { Chats } from '../storage/chats'

export function registerChatsIpc(chats: Chats): void {
  ipcMain.handle('chats:list', (_e, projectPath: string) => chats.list(projectPath))
  ipcMain.handle('chats:append', (_e, projectPath: string, role: 'user' | 'assistant', content: string) => {
    chats.append(projectPath, role, content)
  })
}
