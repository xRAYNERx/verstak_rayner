import { createGeminiProvider } from './gemini'
import { createGeminiCliProvider, GEMINI_CLI_MODELS } from './gemini-cli'
import { createClaudeProvider, CLAUDE_MODELS } from './claude'
import { createClaudeCliProvider, CLAUDE_CLI_MODELS } from './claude-cli'
import { createGrokProvider, GROK_MODELS } from './grok'
import { createGrokCliProvider, GROK_CLI_MODELS } from './grok-cli'
import { createOpenAiProvider, OPENAI_MODELS } from './openai'
import { createCodexCliProvider, CODEX_CLI_MODELS } from './codex-cli'
import type { ChatProvider } from './types'

export type ProviderId = 'gemini-api' | 'gemini-cli' | 'claude' | 'claude-cli' | 'grok' | 'grok-cli' | 'openai' | 'codex-cli'

export interface ProviderDescriptor {
  id: ProviderId
  name: string
  /** Short transport tag shown to the user: "API" / "CLI" / "—" */
  transport: 'API' | 'CLI'
  /** Settings key for the API key (null if not key-based, e.g. CLI). */
  secretKey: string | null
  /** Available model ids; "auto" for CLI where the binary picks. */
  models: string[]
  defaultModel: string
  /** Whether function calling / file tools are supported in this build. */
  supportsTools: boolean
  /** Human-readable model label shown in the chat status pill. */
  shortLabel: string
}

export const PROVIDERS: Record<ProviderId, ProviderDescriptor> = {
  'gemini-api': {
    id: 'gemini-api',
    name: 'Gemini',
    transport: 'API',
    secretKey: 'gemini_api_key',
    models: ['gemini-3-pro', 'gemini-3.5-flash', 'gemini-3-flash', 'gemini-2.5-pro', 'gemini-2.5-flash'],
    defaultModel: 'gemini-3.5-flash',
    supportsTools: true,
    shortLabel: 'Gemini'
  },
  'gemini-cli': {
    id: 'gemini-cli',
    name: 'Gemini CLI',
    transport: 'CLI',
    secretKey: null,
    models: GEMINI_CLI_MODELS,
    defaultModel: 'auto',
    supportsTools: false,
    shortLabel: 'Gemini Ultra'
  },
  claude: {
    id: 'claude',
    name: 'Claude',
    transport: 'API',
    secretKey: 'anthropic_api_key',
    models: CLAUDE_MODELS,
    defaultModel: 'claude-sonnet-4-5-20251101',
    supportsTools: true,
    shortLabel: 'Claude'
  },
  'claude-cli': {
    id: 'claude-cli',
    name: 'Claude Code',
    transport: 'CLI',
    secretKey: null,
    models: CLAUDE_CLI_MODELS,
    defaultModel: 'auto',
    supportsTools: false,
    shortLabel: 'Claude Code'
  },
  grok: {
    id: 'grok',
    name: 'Grok',
    transport: 'API',
    secretKey: 'xai_api_key',
    models: GROK_MODELS,
    defaultModel: 'grok-4',
    supportsTools: true,
    shortLabel: 'Grok'
  },
  'grok-cli': {
    id: 'grok-cli',
    name: 'Grok Build',
    transport: 'CLI',
    secretKey: null,
    models: GROK_CLI_MODELS,
    defaultModel: 'auto',
    supportsTools: false,
    shortLabel: 'Grok Build'
  },
  openai: {
    id: 'openai',
    name: 'ChatGPT',
    transport: 'API',
    secretKey: 'openai_api_key',
    models: OPENAI_MODELS,
    defaultModel: 'gpt-5',
    supportsTools: true,
    shortLabel: 'ChatGPT'
  },
  'codex-cli': {
    id: 'codex-cli',
    name: 'Codex',
    transport: 'CLI',
    secretKey: null,
    models: CODEX_CLI_MODELS,
    defaultModel: 'auto',
    supportsTools: false,
    shortLabel: 'Codex'
  }
}

export interface CreateOptions {
  apiKey?: string | null
  model?: string
  cwd?: string
  signal?: AbortSignal
}

export function createProvider(id: ProviderId, opts: CreateOptions): ChatProvider {
  switch (id) {
    case 'gemini-api': {
      if (!opts.apiKey) throw new Error('Gemini API key not set')
      return createGeminiProvider({ apiKey: opts.apiKey, model: opts.model })
    }
    case 'gemini-cli':
      return createGeminiCliProvider({ cwd: opts.cwd, signal: opts.signal, model: opts.model })
    case 'claude': {
      if (!opts.apiKey) throw new Error('Anthropic API key not set')
      return createClaudeProvider({ apiKey: opts.apiKey, model: opts.model })
    }
    case 'claude-cli':
      return createClaudeCliProvider({ cwd: opts.cwd, signal: opts.signal, model: opts.model })
    case 'grok': {
      if (!opts.apiKey) throw new Error('xAI (Grok) API key not set')
      return createGrokProvider({ apiKey: opts.apiKey, model: opts.model })
    }
    case 'grok-cli':
      return createGrokCliProvider({ cwd: opts.cwd, signal: opts.signal, model: opts.model })
    case 'openai': {
      if (!opts.apiKey) throw new Error('OpenAI API key not set')
      return createOpenAiProvider({ apiKey: opts.apiKey, model: opts.model })
    }
    case 'codex-cli':
      return createCodexCliProvider({ cwd: opts.cwd, signal: opts.signal, model: opts.model })
  }
}
