import { ipcMain } from 'electron'
import type { Tasks } from '../storage/tasks'

export function registerTasksIpc(tasks: Tasks): void {
  ipcMain.handle('tasks:list', (_e, projectPath: string) => tasks.list(projectPath))
  ipcMain.handle('tasks:create', (_e, input) => tasks.create(input))
  ipcMain.handle('tasks:update', (_e, id: number, patch) => tasks.update(id, patch))
  ipcMain.handle('tasks:soft-delete', (_e, id: number) => tasks.softDelete(id))
  ipcMain.handle('tasks:link', (_e, input) => tasks.link(input))
  ipcMain.handle('tasks:list-links', (_e, taskId: number) => tasks.listLinks(taskId))
  ipcMain.handle('tasks:add', (_e, projectPath: string, text: string) => tasks.add(projectPath, text))
  ipcMain.handle('tasks:toggle', (_e, id: number, done: boolean) => tasks.toggle(id, done))
  ipcMain.handle('tasks:remove', (_e, id: number) => tasks.remove(id))
  ipcMain.handle('tasks:clear-done', (_e, projectPath: string) => tasks.clearDone(projectPath))
}
