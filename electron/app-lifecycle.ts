import { app, BrowserWindow } from 'electron'
import { abortSend } from './ipc/ai'
import { killAllTerminalSessions } from './ipc/terminal'
import { destroyNotificationWindow } from './notification-window'
import { mcpClient } from './mcp/client'

/** Имя в диспетчере задач / process.title (Windows). */
export const APP_DISPLAY_NAME = 'VERSTAK'

export function installAppIdentity(): void {
  app.setName(APP_DISPLAY_NAME)
  process.title = APP_DISPLAY_NAME
}

let shutdownDone = false

/** Освобождает вспомогательные окна/PTY/MCP — иначе процесс висит после закрытия UI. */
export function runAppShutdown(): void {
  if (shutdownDone) return
  shutdownDone = true
  destroyNotificationWindow()
  killAllTerminalSessions()
  abortSend(0)
  mcpClient.disconnectAll()
}

export function bindMainWindowLifecycle(mainWindow: BrowserWindow): void {
  mainWindow.on('close', () => {
    runAppShutdown()
  })
}

export function installGlobalQuitHandlers(): void {
  app.on('before-quit', () => runAppShutdown())
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}