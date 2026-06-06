import { ipcMain } from 'electron'
import type { Settings } from '../storage/settings'
import { detectInstalledClis } from '../ai/cli-detect'
import { scanLocalModelServers } from '../ai/local-models'
import { PROVIDERS } from '../ai/registry'
import { runDoctor } from '../ai/doctor'
import { recommendTier, type TierRecommendation } from '../ai/tier-router'

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

  // Tier Router — РЕКОМЕНДАЦИЯ тира+провайдера+модели под текст задачи.
  // Чистая рекомендация (см. electron/ai/tier-router.ts), не autopilot: UI
  // показывает pill с кнопкой «применить», переключение делает пользователь.
  // configuredProviderIds = провайдеры с заданным ключом + CLI/локальные
  // (secretKey === null или ollama — ключ не нужен). Тот же критерий «настроен»
  // что в doctor:run / ModelPicker.
  ipcMain.handle('router:recommend', (_e, taskText: string): TierRecommendation | null => {
    const text = typeof taskText === 'string' ? taskText.trim() : ''
    if (!text) return null

    const configuredProviderIds = Object.values(PROVIDERS)
      .filter(p => {
        // CLI-провайдеры авторизуются через бинарь — ключ не нужен, считаем настроенными.
        if (p.secretKey === null) return true
        // Ollama — локальный сервис, ключ необязателен.
        if (p.id === 'ollama') return true
        return !!settings.getSecret(p.secretKey)
      })
      .map(p => p.id)

    return recommendTier([{ role: 'user', content: text }], configuredProviderIds)
  })
}
