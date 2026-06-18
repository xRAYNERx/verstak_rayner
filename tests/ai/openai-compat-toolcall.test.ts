import { describe, it, expect, vi, beforeEach } from 'vitest'

// Мок SDK `openai`: подменяем класс OpenAI так, чтобы chat.completions.create
// отдавал управляемый фейковый стрим. createOpenAiCompatProvider — общая база
// 9 провайдеров (grok/openai + 8 OpenAI-совместимых: DeepSeek/Qwen/Ollama/...).
let nextChunks: unknown[] = []
vi.mock('openai', () => ({
  default: class {
    chat = {
      completions: {
        create: vi.fn(async () => (async function* () { for (const c of nextChunks) yield c })()),
      },
    }
    constructor(_opts: unknown) { void _opts }
  },
}))

const { createOpenAiCompatProvider } = await import('../../electron/ai/openai-compat')

function makeProvider() {
  return createOpenAiCompatProvider({
    id: 'ollama', name: 'Ollama', models: ['qwen'], defaultModel: 'qwen', apiKey: 'k',
  })
}

async function collect(): Promise<import('../../electron/ai/types').ChatEvent[]> {
  const out: import('../../electron/ai/types').ChatEvent[] = []
  for await (const ev of makeProvider().send([{ role: 'user', content: 'hi' }], [
    { name: 'read_file', description: 'd', parameters: {} },
  ])) {
    out.push(ev)
    if (ev.type === 'done' || ev.type === 'error') break
  }
  return out
}

beforeEach(() => { nextChunks = [] })

describe('openai-compat — tool-call флаш', () => {
  it('эмитит tool-call даже когда сервер закрыл стрим finish_reason=stop (Ollama)', async () => {
    // Compat-сервер стримит tool-call дельтами, но финал — finish_reason:'stop',
    // НЕ 'tool_calls' (реальное поведение Ollama / части сборок). Накопленный
    // вызов не должен потеряться.
    nextChunks = [
      { choices: [{ delta: { tool_calls: [{ index: 0, id: 't1', function: { name: 'read_file', arguments: '{"path":' } }] }, finish_reason: null }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"a.ts"}' } }] }, finish_reason: null }] },
      { choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 2 } },
    ]
    const events = await collect()
    const calls = events.filter(e => e.type === 'tool-call')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ type: 'tool-call', call: { name: 'read_file', args: { path: 'a.ts' } } })
  })

  it('штатный finish_reason=tool_calls — ровно один tool-call (без дубля после флаша)', async () => {
    nextChunks = [
      { choices: [{ delta: { tool_calls: [{ index: 0, id: 't1', function: { name: 'read_file', arguments: '{"path":"a.ts"}' } }] }, finish_reason: null }] },
      { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
    ]
    const events = await collect()
    expect(events.filter(e => e.type === 'tool-call')).toHaveLength(1)
  })
})
