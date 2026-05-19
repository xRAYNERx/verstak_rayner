import { useEffect, useState, useCallback } from 'react'

export type ProviderId = 'gemini-api' | 'gemini-cli' | 'claude' | 'claude-cli' | 'grok' | 'openai' | 'codex-cli'

export interface ProviderInfo {
  id: ProviderId
  /** Short human label shown in chat status — e.g. "Gemini", "Claude", "Grok" */
  label: string
  /** Currently selected model id for this provider */
  model: string
  /** "API" or "CLI" */
  transport: 'API' | 'CLI'
  /** All available models user can switch to */
  models: string[]
  /** Whether this provider has function calling in our app right now */
  supportsTools: boolean
}

const PROVIDER_META: Record<ProviderId, Omit<ProviderInfo, 'model' | 'id'>> = {
  'gemini-api': {
    label: 'Gemini',
    transport: 'API',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash'],
    supportsTools: true
  },
  'gemini-cli': {
    label: 'Gemini Ultra',
    transport: 'CLI',
    models: ['auto', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-3-pro-preview', 'gemini-3-flash-preview'],
    supportsTools: false
  },
  claude: {
    label: 'Claude',
    transport: 'API',
    models: ['claude-opus-4-5-20251101', 'claude-sonnet-4-5-20251101', 'claude-haiku-4-5-20251101'],
    supportsTools: true
  },
  'claude-cli': {
    label: 'Claude Code',
    transport: 'CLI',
    models: ['auto', 'claude-sonnet-4-6', 'claude-opus-4-5', 'claude-haiku-4-5', 'claude-sonnet-4-5'],
    supportsTools: false
  },
  grok: {
    label: 'Grok',
    transport: 'API',
    models: ['grok-4', 'grok-4-fast', 'grok-3'],
    supportsTools: true
  },
  openai: {
    label: 'ChatGPT',
    transport: 'API',
    models: ['gpt-5', 'gpt-5-mini', 'gpt-4o', 'gpt-4o-mini', 'o1', 'o1-mini'],
    supportsTools: true
  },
  'codex-cli': {
    label: 'Codex',
    transport: 'CLI',
    models: ['auto', 'gpt-5-codex', 'gpt-5', 'gpt-5-mini', 'o3', 'o3-mini', 'gpt-4o'],
    supportsTools: false
  }
}

const DEFAULT_MODEL: Record<ProviderId, string> = {
  'gemini-api': 'gemini-2.5-pro',
  'gemini-cli': 'auto',
  claude: 'claude-sonnet-4-5-20251101',
  'claude-cli': 'auto',
  grok: 'grok-4',
  openai: 'gpt-5',
  'codex-cli': 'auto'
}

const KNOWN_IDS: ProviderId[] = ['gemini-api', 'gemini-cli', 'claude', 'claude-cli', 'grok', 'openai', 'codex-cli']

function parseProviderId(v: string | null | undefined): ProviderId {
  if (v && (KNOWN_IDS as string[]).includes(v)) return v as ProviderId
  return 'gemini-api'
}

const POLL_INTERVAL_MS = 1500

interface UseProviderResult extends ProviderInfo {
  /** Persist a new model id for the active provider and refresh state. */
  setModel: (model: string) => Promise<void>
  /** Switch to a different provider; existing model selection per provider is preserved. */
  setProviderId: (id: ProviderId) => Promise<void>
}

export function useProvider(): UseProviderResult {
  const [id, setId] = useState<ProviderId>('gemini-api')
  const [model, setModelState] = useState<string>(DEFAULT_MODEL['gemini-api'])

  const refresh = useCallback(async () => {
    const rawId = await window.api.settings.getKey('provider')
    const pid = parseProviderId(rawId)
    setId(pid)
    const rawModel = await window.api.settings.getKey(`model_${pid}`)
    setModelState(rawModel ?? DEFAULT_MODEL[pid])
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => { if (!cancelled) await refresh() })()
    const t = window.setInterval(refresh, POLL_INTERVAL_MS)
    return () => { cancelled = true; window.clearInterval(t) }
  }, [refresh])

  const setModel = useCallback(async (next: string) => {
    await window.api.settings.setKey(`model_${id}`, next)
    setModelState(next)
  }, [id])

  const setProviderId = useCallback(async (next: ProviderId) => {
    await window.api.settings.setKey('provider', next)
    setId(next)
    const stored = await window.api.settings.getKey(`model_${next}`)
    setModelState(stored ?? DEFAULT_MODEL[next])
  }, [])

  const meta = PROVIDER_META[id]
  return { id, label: meta.label, model, transport: meta.transport, models: meta.models, supportsTools: meta.supportsTools, setModel, setProviderId }
}
