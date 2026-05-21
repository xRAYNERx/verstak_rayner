import { ipcMain } from 'electron'
import { writeFile, unlink, stat } from 'fs/promises'
import type { UndoStack } from '../storage/undo'
import { safeRealJoin } from '../ai/path-policy'

export function registerUndoIpc(stack: UndoStack): void {
  ipcMain.handle('undo:list', (_e, projectPath: string) => stack.list(projectPath))
  ipcMain.handle('undo:count', (_e, projectPath: string) => stack.count(projectPath))
  ipcMain.handle('undo:clear', (_e, projectPath: string) => stack.clear(projectPath))

  // Pop the most recent (or specific) entry and restore the file's previous state.
  ipcMain.handle('undo:revert', async (_e, projectPath: string, id?: number) => {
    let entry = null
    if (id != null) {
      entry = stack.pop(id)
    } else {
      const list = stack.list(projectPath)
      if (list.length > 0) entry = stack.pop(list[0].id)
    }
    if (!entry) return { ok: false, reason: 'no entries' }
    try {
      // safeRealJoin: textual + symlink-aware. Same enforcement as
      // ai-tools and files.ts — no third path-policy drift.
      const abs = await safeRealJoin(projectPath, entry.filePath)
      const before = entry.beforeContent
      if (before === null || before === '') {
        // The file did not exist before — attempting to remove it now.
        try {
          await stat(abs)
          await unlink(abs)
        } catch { /* already gone */ }
      } else {
        await writeFile(abs, before, 'utf8')
      }
      return { ok: true, filePath: entry.filePath }
    } catch (err) {
      // Put it back on the stack so the user can retry
      stack.push(projectPath, entry.filePath, entry.beforeContent ?? '', entry.afterContent ?? '')
      return { ok: false, reason: err instanceof Error ? err.message : String(err) }
    }
  })
}
