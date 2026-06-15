import { app, dialog, ipcMain, BrowserWindow, shell } from 'electron'
import { setActiveProjectPath } from '../state/project-state'
import { ensureUserLayer } from '../ai/user-layer'
import { warmProjectMaps } from '../ai/project-map'
import type { Projects } from '../storage/projects'
import { deleteProjectIconFile, importProjectIcon } from '../storage/project-icons'
import { forgetMemorizedProject } from './ai'

export function registerProjectIpc(projects: Projects): void {
  ipcMain.handle('projects:pick', async () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
      title: 'Открыть проект'
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const picked = result.filePaths[0]
    projects.upsert(picked)
    setActiveProjectPath(picked)
    void ensureUserLayer(picked).catch(() => { /* non-critical */ })
    // Фоновый прогрев карты проекта + графа зависимостей — чтобы к первому
    // ai:send и открытию панели Карта кэш был уже тёплым (non-blocking).
    void warmProjectMaps(picked).catch(() => { /* non-critical, фон */ })
    return picked
  })

  ipcMain.handle('projects:set-current', (_e, path: string | null) => {
    setActiveProjectPath(path)
    if (path) {
      // upsert — touch alone silently no-ops if the project was never registered
      // (e.g. restored from last_project_path without going through pick()).
      projects.upsert(path)
      void ensureUserLayer(path).catch(() => { /* non-critical */ })
      // Открытие/смена активного проекта → фоном строим обе карты. Единая точка
      // хука: renderer setProject всегда зовёт setCurrent. Идемпотентно.
      void warmProjectMaps(path).catch(() => { /* non-critical, фон */ })
    }
  })

  ipcMain.handle('app:home-dir', () => app.getPath('home'))
  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('app:open-external', (_e, url: string) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return false
    void shell.openExternal(url)
    return true
  })

  ipcMain.handle('projects:list', () => projects.list())
  ipcMain.handle('projects:rename', (_e, path: string, name: string) => projects.rename(path, name))
  ipcMain.handle('projects:update-meta', (_e, path: string, patch: { name?: string; iconPath?: string | null }) => {
    return projects.updateMeta(path, patch)
  })
  ipcMain.handle('projects:pick-icon', async (_e, projectPath: string) => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      title: 'Иконка проекта',
      properties: ['openFile'],
      filters: [
        { name: 'Изображения', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'ico'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const existing = projects.list().find(p => p.path === projectPath)
    if (existing?.iconPath) deleteProjectIconFile(existing.iconPath)
    const iconPath = importProjectIcon(projectPath, result.filePaths[0])
    return projects.updateMeta(projectPath, { iconPath })
  })
  ipcMain.handle('projects:clear-icon', (_e, projectPath: string) => {
    const existing = projects.list().find(p => p.path === projectPath)
    if (existing?.iconPath) deleteProjectIconFile(existing.iconPath)
    return projects.updateMeta(projectPath, { iconPath: null })
  })
  ipcMain.handle('projects:remove', (_e, path: string) => {
    const existing = projects.list().find(p => p.path === path)
    if (existing?.iconPath) deleteProjectIconFile(existing.iconPath)
    projects.remove(path)
    forgetMemorizedProject(path)
  })
}