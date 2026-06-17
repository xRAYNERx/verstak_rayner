/** Синхронизировать с electron/ai/registry.ts (PROVIDERS + EXTRA_PROVIDERS). */
export const MODEL_PROVIDER_COUNT = 18

export type InstallerValueProp = {
  title: string
  text: string
}

export const INSTALLER_VALUE_PROPS: InstallerValueProp[] = [
  {
    title: `${MODEL_PROVIDER_COUNT} провайдеров моделей`,
    text: 'Gemini, Claude, GPT, Grok, YandexGPT, GigaChat и другие — через API или CLI',
  },
  {
    title: 'Агент в вашем проекте',
    text: 'Файлы, терминал и правки кода — вы видите каждый шаг',
  },
  {
    title: 'Skills и память',
    text: 'Готовые сценарии и контекст между сессиями',
  },
]

export const INSTALLER_BOOT_MESSAGES = [
  'Проверяем пакет приложения',
  'Считаем размер установки',
  'Готовим мастер установки',
] as const

export const INSTALLER_WIZARD_STEPS = [
  { key: 'welcome', label: 'Приветствие', hint: 'Ознакомление с программой' },
  { key: 'directory', label: 'Папка', hint: 'Куда установить Verstak' },
  { key: 'installing', label: 'Установка', hint: 'Копирование файлов' },
  { key: 'finish', label: 'Готово', hint: 'Ярлыки и запуск' },
] as const