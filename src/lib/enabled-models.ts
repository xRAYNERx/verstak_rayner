/** Ключ модели в enabled_models: providerId::modelName */
export function modelKey(providerId: string, model: string): string {
  return `${providerId}::${model}`
}

/** Нет сохранённого списка или он пустой — можно задать дефолт при первом входе. */
export function isEnabledModelsUnsetOrEmpty(raw: string | null | undefined): boolean {
  if (raw == null || raw === '') return true
  try {
    const arr = JSON.parse(raw) as unknown
    return !Array.isArray(arr) || arr.length === 0
  } catch {
    return true
  }
}

export async function initEmptyEnabledModelsIfUnset(): Promise<void> {
  const em = await window.api.settings.getKey('enabled_models')
  if (em == null) {
    await window.api.settings.setKey('enabled_models', '[]')
  }
}

/** Включить только модель, через которую пользователь вошёл (если список ещё пуст). */
export async function seedEnabledModelsIfUnset(providerId: string, model: string): Promise<void> {
  const em = await window.api.settings.getKey('enabled_models')
  if (!isEnabledModelsUnsetOrEmpty(em)) return
  await window.api.settings.setKey('enabled_models', JSON.stringify([modelKey(providerId, model)]))
}