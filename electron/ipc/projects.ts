import { dialog, ipcMain, BrowserWindow } from 'electron'
import { setActiveProjectPath } from '../state/project-state'

export function registerProjectIpc(): void {
  ipcMain.handle('projects:pick', async () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
      title: 'Открыть проект'
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const picked = result.filePaths[0]
    setActiveProjectPath(picked)
    return picked
  })

  ipcMain.handle('projects:set-current', (_e, path: string | null) => {
    setActiveProjectPath(path)
  })
}
