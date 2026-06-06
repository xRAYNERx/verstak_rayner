import { ipcMain } from 'electron'
import type { Settings } from '../storage/settings'
import { detectInstalledClis } from '../ai/cli-detect'
import { scanLocalModelServers } from '../ai/local-models'
import { PROVIDERS } from '../ai/registry'
import { runDoctor } from '../ai/doctor'

/** Сериализуемый дескриптор провайдера для renderer (без фабричных функций). */
export interface ProviderDescriptorDTO {
  id: string
  name: string
  transport: 'API' | 'CLI'
  secretKey: string | null
  models: string[]
  defaultModel: string
  supportsTools: boolean
  shortLabel: string
}

export function registerSettingsIpc(settings: Settings): void {
  ipcMain.handle('settings:get-key', (_e, key: string) => settings.getSecret(key))
  ipcMain.handle('settings:set-key', (_e, key: string, value: string) => {
    settings.setSecret(key, value)
  })
  ipcMain.handle('cli:detect', () => detectInstalledClis())
  ipcMain.handle('local-models:scan', () => scanLocalModelServers())

  // Единый источник истины для списка провайдеров и моделей — electron/ai/registry.ts.
  // Renderer получает данные через этот канал, а не хардкодит копию.
  ipcMain.handle('providers:list', (): ProviderDescriptorDTO[] => {
    return Object.values(PROVIDERS).map(p => ({
      id: p.id,
      name: p.name,
      transport: p.transport,
      secretKey: p.secretKey,
      models: [...p.models],
      defaultModel: p.defaultModel,
      supportsTools: p.supportsTools,
      shortLabel: p.shortLabel
    }))
  })

  // Doctor — health-check настроенных провайдеров и коннекторов (config presence,
  // без сетевых вызовов). См. electron/ai/doctor.ts.
  ipcMain.handle('doctor:run', () => runDoctor(settings))
}
