/**
 * IPC handlers для скиллов.
 *
 * Каналы:
 *   skills:list       → Skill[]
 *   skills:get        (id) → Skill | null
 *   skills:refresh    → { added, updated, failed }
 *   skills:status     → { lastRefreshAt, serverReachable, total }
 */

import { ipcMain } from 'electron'
import type { SkillRegistry } from '../ai/skills/types'

export function registerSkillsIpc(registry: SkillRegistry): void {
  ipcMain.handle('skills:list', () => registry.list())
  ipcMain.handle('skills:get', (_e, id: string) => registry.get(id))
  ipcMain.handle('skills:refresh', () => registry.refresh())
  ipcMain.handle('skills:status', () => registry.status())
}
