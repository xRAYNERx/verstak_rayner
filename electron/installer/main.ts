import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { getInstallDefaults, launchInstalledApp, runInstall } from './engine'

const HERE = dirname(fileURLToPath(import.meta.url))
const PRODUCT_NAME = 'Verstak Setup'

function readAppVersion(): string {
  const candidates = [
    join(app.getAppPath(), 'package.json'),
    join(process.resourcesPath, '..', 'package.json'),
    join(HERE, '../../package.json'),
  ]
  for (const pkgPath of candidates) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string }
      if (pkg.version) return pkg.version
    } catch {
      // try next
    }
  }
  return '0.0.0'
}

let splashWindow: BrowserWindow | null = null
let mainWindow: BrowserWindow | null = null

function resolvePreload(): string {
  if (process.env.ELECTRON_RENDERER_URL) {
    return join(HERE, '../preload/installer.mjs')
  }
  return join(app.getAppPath(), 'out/preload/installer.mjs')
}

function resolveRenderer(): string {
  if (process.env.ELECTRON_RENDERER_URL) {
    return `${process.env.ELECTRON_RENDERER_URL}/installer.html`
  }
  return join(app.getAppPath(), 'out/renderer/installer.html')
}

function resolveSplashBundle(): { html: string; icon: string } {
  const candidates = [
    {
      html: join(app.getAppPath(), 'splash', 'installer-splash.html'),
      icon: join(app.getAppPath(), 'splash', 'icon.png'),
    },
    {
      html: join(HERE, '../../resources/installer-splash.html'),
      icon: join(HERE, '../../resources/icon.png'),
    },
  ]
  for (const bundle of candidates) {
    if (existsSync(bundle.html)) return bundle
  }
  throw new Error('Не найден installer-splash.html')
}

function createSplashWindow(): void {
  const { html, icon } = resolveSplashBundle()
  splashWindow = new BrowserWindow({
    width: 420,
    height: 300,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    center: true,
    show: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    backgroundColor: '#2e3440',
    title: PRODUCT_NAME,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })

  const iconUrl = pathToFileURL(icon).href
  void splashWindow.loadFile(html, { query: { icon: iconUrl } })
  splashWindow.on('closed', () => {
    splashWindow = null
  })
}

function closeSplashWindow(): void {
  if (!splashWindow) return
  const win = splashWindow
  splashWindow = null
  win.close()
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 780,
    height: 520,
    minWidth: 700,
    minHeight: 480,
    resizable: false,
    maximizable: false,
    frame: false,
    show: false,
    backgroundColor: '#2e3440',
    title: PRODUCT_NAME,
    webPreferences: {
      preload: resolvePreload(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  const target = resolveRenderer()
  mainWindow.webContents.on('did-fail-load', (_event, code, description, url) => {
    closeSplashWindow()
    dialog.showErrorBox('Verstak Setup', `Не удалось загрузить интерфейс (${code}): ${description}\n${url}`)
    app.quit()
  })
  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(target)
  } else {
    void mainWindow.loadFile(target).catch((err: Error) => {
      closeSplashWindow()
      dialog.showErrorBox('Verstak Setup', `loadFile: ${err.message}\n${target}`)
      app.quit()
    })
  }

  mainWindow.once('ready-to-show', () => {
    closeSplashWindow()
    mainWindow?.show()
    mainWindow?.focus()
  })

  mainWindow.on('maximize', () => mainWindow?.webContents.send('installer:window:maximized', true))
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('installer:window:maximized', false))
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function getWindow(): BrowserWindow {
  if (!mainWindow) throw new Error('Installer window is not ready')
  return mainWindow
}

app.setName(PRODUCT_NAME)
process.title = 'VERSTAK SETUP'

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    try {
      createSplashWindow()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      dialog.showErrorBox('Verstak Setup', message)
      app.quit()
      return
    }
    createWindow()

    ipcMain.handle('installer:getDefaults', async () => getInstallDefaults(readAppVersion(), 'Verstak'))

    ipcMain.handle('installer:browseDirectory', async (_event, current: string) => {
      const result = await dialog.showOpenDialog(getWindow(), {
        title: 'Папка установки Verstak',
        defaultPath: current || undefined,
        properties: ['openDirectory', 'createDirectory'],
      })
      if (result.canceled || result.filePaths.length === 0) return null
      return result.filePaths[0]
    })

    ipcMain.handle('installer:install', async (_event, installDir: string) => {
      const win = getWindow()
      return runInstall(installDir, readAppVersion(), (progress) => {
        win.webContents.send('installer:progress', progress)
      })
    })

    ipcMain.handle('installer:launchApp', async (_event, installDir: string) => {
      launchInstalledApp(installDir)
    })

    ipcMain.handle('installer:window:minimize', () => getWindow().minimize())
    ipcMain.handle('installer:window:maximize', () => {
      const win = getWindow()
      if (win.isMaximized()) win.unmaximize()
      else win.maximize()
    })
    ipcMain.handle('installer:window:close', () => getWindow().close())
    ipcMain.handle('installer:window:isMaximized', () => getWindow().isMaximized())
  })

  app.on('window-all-closed', () => app.quit())
}

process.on('uncaughtException', (err) => {
  closeSplashWindow()
  dialog.showErrorBox('Verstak Setup', err.message)
  app.quit()
})