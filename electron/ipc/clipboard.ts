import { clipboard, ipcMain } from 'electron'

export function registerClipboardIpc() {
  ipcMain.handle('clipboard:write-text', (_e, text: string) => {
    clipboard.writeText(String(text ?? ''))
    return { ok: true }
  })
}
