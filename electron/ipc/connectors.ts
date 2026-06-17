import { ipcMain } from 'electron'
import type { ConnectorRegistry } from '../connectors/registry'
import type { Settings } from '../storage/settings'
import { testConnectorUi } from '../ai/connector-test'

export function registerConnectorsIpc(
  registry: ConnectorRegistry,
  settings: Settings
): void {
  ipcMain.handle('connectors:test', (_e, uiId: string) => {
    const id = typeof uiId === 'string' ? uiId.trim() : ''
    if (!id) return { ok: false, message: 'Не указан коннектор' }
    return testConnectorUi(id, registry, k => settings.getSecret(k))
  })
}