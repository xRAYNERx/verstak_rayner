/**
 * CLI prompt builder — common logic for stuffing system layer + user layer +
 * context pack + history into a single stdin payload for CLI providers.
 *
 * Why this exists (and why we don't share runApiConversation):
 *
 * 1. CLI providers in `stream-json` mode are effectively ONE-SHOT — they don't
 *    support multi-turn back-and-forth over a single stdin session. So we
 *    must serialize the conversation into the prompt itself.
 *
 * 2. claude-cli (Claude Code) is itself an agent with its own developed system
 *    prompt. Pasting our full SYSTEM_LAYER_PROMPT in front of theirs would
 *    create two regulations layered on top of each other — confusing the
 *    model and hurting answer quality. For claude-cli we send only the
 *    user_layer + context_pack + a short note that user_layer rules apply.
 *
 * 3. Other CLI providers (gemini-cli, grok-cli, codex-cli) don't have such an
 *    aggressive system prompt of their own; we send the full system layer
 *    there.
 *
 * 4. Attachments — CLI's `stream-json` mode doesn't accept inline images.
 *    We mention attachment names as a textual hint and let the user know.
 */

import { SYSTEM_LAYER_PROMPT } from './system-layer'
import { loadUserLayer } from './user-layer'
import { buildContextPack } from './context-pack'
import type { ChatMessage } from './types'

export type CliProviderId = 'claude-cli' | 'gemini-cli' | 'grok-cli' | 'codex-cli'

interface BuildCliPromptOpts {
  providerId: CliProviderId
  projectPath: string | null
  messages: ChatMessage[]
  /** Optional override — caller may inject recent writes for context-pack. */
  recentWrites?: Array<{ filePath: string; createdAt: number }>
}

/**
 * Build the full stdin payload for a CLI provider. Returns the assembled
 * string that should be written to the subprocess's stdin.
 */
export async function buildCliPrompt(opts: BuildCliPromptOpts): Promise<string> {
  const { providerId, projectPath, messages, recentWrites } = opts

  const lastUser = messages.filter(m => m.role === 'user').at(-1)
  if (!lastUser) throw new Error('CLI prompt: нет user-сообщения')

  const sections: string[] = []

  // 1. System / user layer.
  // claude-cli already runs Claude Code with its own elaborate system — we
  // only inject the user_layer plus a short pointer. Other CLIs get the
  // full system layer.
  const userLayer = projectPath ? await loadUserLayer(projectPath) : { path: null, content: '' }
  const trimmedUser = userLayer.content.trim()

  if (providerId === 'claude-cli') {
    if (trimmedUser) {
      sections.push(`<user_layer source="${userLayer.path}">
${trimmedUser}
</user_layer>

[gg-runtime: следуй регламентам из user_layer выше — они дополняют твой родной Claude Code system.]`)
    }
  } else {
    // Full prepend for gemini/grok/codex CLI
    const userBlock = trimmedUser
      ? `\n\n<user_layer source="${userLayer.path}">\n${trimmedUser}\n</user_layer>`
      : ''
    sections.push(`${SYSTEM_LAYER_PROMPT}${userBlock}`)
  }

  // 2. Context Pack — git/recent writes/project map/verify scripts +
  //    cross-project path warning if the user mentioned absolute paths
  //    outside this project.
  if (projectPath) {
    try {
      const pack = await buildContextPack({
        projectPath,
        recentWrites: recentWrites ?? [],
        latestUserMessage: lastUser.content
      })
      if (pack) sections.push(pack)
    } catch { /* never block CLI send if context pack fails */ }
  }

  // 3. Conversation history — last 6-10 turns serialized as plain text.
  //    NEVER include system messages here (they're already above).
  const turns = messages.filter(m => m.role !== 'system')
  // Drop the very last user message — we'll send it separately as the prompt
  const history = turns.slice(0, -1).slice(-10)
  if (history.length > 0) {
    const transcript = history.map(m => {
      const role = m.role === 'assistant' ? 'ASSISTANT' : 'USER'
      // Tool-call / tool-result messages get a short summary instead of full JSON
      let body = m.content ?? ''
      if (m.toolCalls?.length) {
        const names = m.toolCalls.map(c => c.name).join(', ')
        body = body ? `${body}\n[tool calls: ${names}]` : `[tool calls: ${names}]`
      }
      if (m.toolResults?.length) {
        const names = m.toolResults.map(r => r.name).join(', ')
        body = body ? `${body}\n[tool results: ${names}]` : `[tool results: ${names}]`
      }
      return `[${role}]: ${body.slice(0, 2000)}`
    }).join('\n\n')
    sections.push(`<conversation_history turns="${history.length}">\n${transcript}\n</conversation_history>`)
  }

  // 4. The actual user prompt — last message
  let userMessage = lastUser.content
  if (lastUser.attachments?.length) {
    const note = lastUser.attachments
      .map(a => `[прикреплён файл: ${a.name} (${a.mimeType}) — CLI не видит содержимое, опиши что нужно сделать]`)
      .join('\n')
    userMessage = userMessage ? `${userMessage}\n\n${note}` : note
  }
  sections.push(userMessage)

  return sections.join('\n\n')
}
