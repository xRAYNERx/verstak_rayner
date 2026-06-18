import { describe, it, expect } from 'vitest'
import {
  HELP_AGENT_MODE,
  HELP_CHAT_SEND_OVERRIDES,
  HELP_PROJECT_PATH,
  HELP_SKILL_ID,
} from '../../src/lib/help-scope'

describe('help-scope', () => {
  it('справка использует отдельный project path', () => {
    expect(HELP_PROJECT_PATH).toBe('__verstak_help__')
  })

  it('режим справки — plan, без инструментов', () => {
    expect(HELP_AGENT_MODE).toBe('plan')
    expect(HELP_CHAT_SEND_OVERRIDES).toEqual({
      noTools: true,
      agentMode: 'plan',
    })
  })

  it('единственный скилл справки — verstak-guide', () => {
    expect(HELP_SKILL_ID).toBe('verstak-guide')
  })
})