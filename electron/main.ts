import { app, BrowserWindow, safeStorage } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'
import { registerProjectIpc } from './ipc/projects'
import { registerFilesIpc } from './ipc/files'
import { registerSettingsIpc } from './ipc/settings'
import { registerAiIpc } from './ipc/ai'
import { openDb } from './storage/db'
import { createSettings } from './storage/settings'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'GeminiGrok',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.mjs'),
      sandbox: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  const dir = join(app.getPath('userData'), 'storage')
  mkdirSync(dir, { recursive: true })
  const db = openDb(join(dir, 'geminigrok.db'))
  const settings = createSettings(db, safeStorage)

  registerProjectIpc()
  registerFilesIpc()
  registerSettingsIpc(settings)
  registerAiIpc(() => settings.getSecret('gemini_api_key'))
  createWindow()
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
