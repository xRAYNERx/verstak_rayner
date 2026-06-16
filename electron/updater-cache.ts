import { existsSync, rmSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

/** %LOCALAPPDATA%\verstak-updater — каталог electron-updater. */
export function getUpdaterCacheRoot(): string {
  // app.getPath('localAppData') не существует в Electron API. electron-updater
  // на Windows хранит кэш в %LOCALAPPDATA% — берём из env с фолбэком на appData.
  const localAppData = process.env.LOCALAPPDATA || app.getPath('appData')
  return join(localAppData, `${app.getName().toLowerCase()}-updater`)
}

/** Удаляет pending-установщик (петля «установить ту же версию»). */
export function clearPendingUpdateCache(): void {
  const pending = join(getUpdaterCacheRoot(), 'pending')
  if (!existsSync(pending)) return
  try {
    rmSync(pending, { recursive: true, force: true })
  } catch (err) {
    console.warn('[updater] clear pending cache failed:', err)
  }
}