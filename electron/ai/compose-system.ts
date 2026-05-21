/**
 * Single source of truth for assembling the agent's system context.
 *
 * Before this module, ipc/ai.ts (for API providers) and cli-prompt.ts (for
 * CLI providers) BOTH did the same dance independently:
 *   1. loadUserLayer(projectPath)
 *   2. buildContextPack({ projectPath, recentWrites, latestUserMessage,
 *                         isFirstTurn })
 *   3. composeSystemPrompt(userLayer, contextPack)
 *
 * Result: drift waiting to happen. When Context Pack got new fields, only one
 * caller usually got updated; CLI lagged. Per Grok audit (harsh edition):
 * "два параллельных мира построения промпта".
 *
 * Now: both callers go through prepareSystemContext(). Adding a new context
 * detector or changing assembly rules — one place to edit.
 */

import { loadUserLayer, type UserLayer } from './user-layer'
import { buildContextPack } from './context-pack'
import { composeSystemPrompt, type ComposedPrompt } from './compose-prompt'
import type { ChatMessage } from './types'

export interface PrepareSystemInput {
  projectPath: string | null
  messages: ChatMessage[]
  /** Recent file writes from undoStack (provided by main; the renderer/IPC
   *  shouldn't reach into storage directly). Pass [] if not available. */
  recentWrites: Array<{ filePath: string; createdAt: number }>
}

export interface PreparedParts {
  userLayer: UserLayer
  contextPack: string
}

/**
 * Assemble the final system prompt for an agent send. Returns the fully
 * composed prompt plus the project path so callers can stitch it into the
 * provider-specific format.
 *
 * On any failure inside context-pack the function logs a warning (NOT silent
 * — that was previously hidden) and proceeds with whatever pieces succeeded.
 */
export async function prepareSystemContext(input: PrepareSystemInput): Promise<ComposedPrompt> {
  const parts = await prepareParts(input)
  return composeSystemPrompt(parts.userLayer, parts.contextPack)
}

/**
 * Returns the raw user_layer + context_pack pieces without the SYSTEM_LAYER_PROMPT
 * envelope. Used by claude-cli where Claude Code already injects its own
 * developed system prompt — we don't want to layer ours on top.
 */
export async function prepareParts(input: PrepareSystemInput): Promise<PreparedParts> {
  const { projectPath, messages, recentWrites } = input
  const userLayer = projectPath ? await loadUserLayer(projectPath) : { path: null, content: '' }

  let contextPack = ''
  if (projectPath) {
    const lastUser = messages.filter(m => m.role === 'user').at(-1)
    const isFirstTurn = !messages.some(m => m.role === 'assistant')
    try {
      contextPack = await buildContextPack({
        projectPath,
        recentWrites,
        latestUserMessage: lastUser?.content ?? '',
        isFirstTurn
      })
    } catch (err) {
      // Visible failure — previously this was silent and made debugging hard.
      console.warn('[prepareSystemContext] buildContextPack failed:', err instanceof Error ? err.message : err)
    }
  }

  return { userLayer, contextPack }
}
