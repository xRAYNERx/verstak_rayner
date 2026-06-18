import type { AgentMode } from '../components/ModePicker'

/** Глобальная «папка» справки — не привязана к клиентским проектам. */
export const HELP_PROJECT_PATH = '__verstak_help__'

/** Единственный скилл в режиме справки. */
export const HELP_SKILL_ID = 'verstak-guide'

/** Режим агента в справке — всегда план (только чтение/объяснение). */
export const HELP_AGENT_MODE: AgentMode = 'plan'

/** Параметры ai:send для справки: без инструментов, режим plan. */
export const HELP_CHAT_SEND_OVERRIDES = {
  noTools: true,
  agentMode: HELP_AGENT_MODE,
} as const