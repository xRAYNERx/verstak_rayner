import { ipcMain } from 'electron'
import { SYSTEM_LAYER_PROMPT, SYSTEM_LAYER_VERSION } from '../ai/system-layer'
import { loadUserLayer } from '../ai/user-layer'

export function registerSystemLayerIpc(): void {
  // Read-only access — the system layer cannot be modified through IPC.
  ipcMain.handle('system-layer:get', () => ({
    version: SYSTEM_LAYER_VERSION,
    prompt: SYSTEM_LAYER_PROMPT
  }))

  ipcMain.handle('system-layer:user', async (_e, projectPath: string | null) => {
    return loadUserLayer(projectPath)
  })
}
