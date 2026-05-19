import { readFile, stat } from 'fs/promises'
import { join } from 'path'

/**
 * Discovers and loads the user-defined "user layer" of agent instructions
 * for the current project. This is anything the project owner wants the AI
 * to know — coding conventions, domain rules, common patterns, taboos.
 *
 * Search order (first match wins):
 *   1. AGENTS.md          (Cursor / Codex convention)
 *   2. CLAUDE.md          (Anthropic convention)
 *   3. GEMINI.md          (Google convention)
 *   4. .geminigrok/RULES.md (our own)
 *
 * The user layer EXTENDS the system layer; it cannot override the protocol.
 * The combined prompt is built by `composeSystemPrompt`.
 */

const CANDIDATES = ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', '.geminigrok/RULES.md']
const MAX_BYTES = 64 * 1024  // 64 KB safety cap for user layer

export interface UserLayer {
  /** File the layer was loaded from, or null if nothing matched. */
  path: string | null
  /** Raw markdown content; empty string if nothing loaded. */
  content: string
}

export async function loadUserLayer(projectRoot: string | null): Promise<UserLayer> {
  if (!projectRoot) return { path: null, content: '' }
  for (const rel of CANDIDATES) {
    const abs = join(projectRoot, rel)
    try {
      const st = await stat(abs)
      if (!st.isFile()) continue
      if (st.size > MAX_BYTES) continue  // ignore oversized files
      const content = await readFile(abs, 'utf8')
      return { path: rel, content }
    } catch {
      continue
    }
  }
  return { path: null, content: '' }
}
