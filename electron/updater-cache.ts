import { existsSync, rmSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

/** %LOCALAPPDATA%\verstak-updater — каталог electron-updater. */
export function getUpdaterCacheRoot(): string {
  return join(app.getPath('localAppData'), `${app.getName().toLowerCase()}-updater`)
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