import { ipcMain } from 'electron'
import type { Settings } from '../storage/settings'

export function registerSettingsIpc(settings: Settings): void {
  ipcMain.handle('settings:get-key', (_e, key: string) => settings.getSecret(key))
  ipcMain.handle('settings:set-key', (_e, key: string, value: string) => {
    settings.setSecret(key, value)
  })
}
