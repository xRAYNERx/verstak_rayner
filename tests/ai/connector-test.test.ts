import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createConnectorRegistry } from '../../electron/connectors/registry'
import { testConnectorUi } from '../../electron/ai/connector-test'

describe('connector-test', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('claude-oauth: отклоняет пустой токен', async () => {
    const registry = createConnectorRegistry()
    const res = await testConnectorUi('claude-oauth', registry, () => null)
    expect(res.ok).toBe(false)
    expect(res.message).toMatch(/не задан/i)
  })

  it('claude-oauth: принимает корректный формат', async () => {
    const registry = createConnectorRegistry()
    const res = await testConnectorUi('claude-oauth', registry, k =>
      k === 'claude_code_oauth_token' ? 'sk-ant-oat01-test' : null
    )
    expect(res.ok).toBe(true)
  })

  it('telegram: no-token без ключа', async () => {
    const registry = createConnectorRegistry()
    const res = await testConnectorUi('telegram', registry, () => null)
    expect(res.ok).toBe(false)
    expect(res.message).toMatch(/token/i)
  })

  it('telegram: get_me с мокнутым fetch', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, result: { id: 1, username: 'bot' } }),
      text: async () => '{"ok":true}'
    })))
    const registry = createConnectorRegistry()
    const res = await testConnectorUi('telegram', registry, k =>
      k === 'telegram_bot_token' ? '123:abc' : null
    )
    expect(res.ok).toBe(true)
  })

  it('http: ошибка без эндпоинтов', async () => {
    const registry = createConnectorRegistry()
    const res = await testConnectorUi('http', registry, () => null)
    expect(res.ok).toBe(false)
    expect(res.message).toMatch(/эндпоинт/i)
  })
})