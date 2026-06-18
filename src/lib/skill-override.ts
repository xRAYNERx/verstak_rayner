import type { Skill } from '../types/api'

/** Семейство провайдера: claude/claude-cli/claude-api → 'claude', gemini* → 'gemini' и т.п. */
function family(p: string | null | undefined): string {
  return (p ?? '')
    .replace(/-cli$|-api$/, '')
    .replace(/^gemini.*$/, 'gemini')
    .replace(/^(claude|grok|openai|codex).*$/, '$1')
}

/**
 * Решает provider/model override активного скилла относительно текущего выбора
 * пользователя.
 *  - Провайдер переключаем ТОЛЬКО если семейство РАЗНОЕ (сохраняем выбор
 *    API/CLI/подписки: claude API vs claude-cli — одно семейство, не трогаем).
 *  - Модель применяем, когда скилл объявил default_provider (значит default_model
 *    совместим с этим семейством) — даже если провайдер тот же. Раньше при том же
 *    семействе default_model молча игнорировался (B5).
 */
export function resolveSkillOverride(
  skill: Pick<Skill, 'default_provider' | 'default_model'>,
  currentProvider: string | null,
): { providerId?: string; model?: string } {
  const skillProvider = skill.default_provider
  const overrideProvider = skillProvider && family(skillProvider) !== family(currentProvider)
    ? skillProvider
    : undefined
  const model = skillProvider && skill.default_model ? skill.default_model : undefined
  return {
    ...(overrideProvider ? { providerId: overrideProvider } : {}),
    ...(model ? { model } : {}),
  }
}
