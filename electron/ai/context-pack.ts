/**
 * Context Pack — динамический срез состояния репозитория, который
 * автоматически инжектится в system prompt перед каждым ai:send.
 *
 * Зачем: без этого блока агент тратит лишние 2-5 read_file/list_directory
 * на «понять что происходит». С Context Pack модель уже знает:
 *   - какая ветка / есть ли uncommitted изменения
 *   - какие файлы редактировались в последние N сессий
 *   - примерную форму проекта (сжатая project map)
 *   - какой verify-script доступен (если есть)
 *
 * Цена: ~300-1500 токенов на запрос. Окупается уже на 1 сэкономленном
 * read_file. На длинных задачах экономит десятки turn'ов.
 */

import { execFile } from 'child_process'
import { promisify } from 'util'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { getProjectMap, projectMapToText } from './project-map'

const execFileAsync = promisify(execFile)

export interface ContextPackInput {
  projectPath: string
  /** Recently accepted file writes (most recent first). Up to ~10 entries. */
  recentWrites?: Array<{ filePath: string; createdAt: number }>
}

/**
 * Build a compact <context_pack> block ready to append to the system prompt.
 * Never throws — degraded data is better than no data, and we don't want a
 * cold git repo or missing tools to break the AI request.
 */
export async function buildContextPack(input: ContextPackInput): Promise<string> {
  const { projectPath } = input
  const parts: string[] = []

  // 1. Git status (branch + dirty file list). Skipped silently if not a git repo.
  const git = await readGitStatus(projectPath)
  if (git) parts.push(`git: ${git}`)

  // 2. Recent writes — what we touched in this project recently.
  if (input.recentWrites && input.recentWrites.length > 0) {
    const list = input.recentWrites.slice(0, 8).map(w => w.filePath).join(', ')
    parts.push(`recent_writes (${input.recentWrites.length}): ${list}`)
  }

  // 3. Verify scripts auto-detected from package.json — hints to the model
  //    what command to run after edits.
  const verifyHints = await detectVerifyScripts(projectPath)
  if (verifyHints.length > 0) parts.push(`verify_scripts: ${verifyHints.join(', ')}`)

  // 4. Project map (compact). Use cached version — if it's stale, the
  //    write_file tool invalidates the cache anyway.
  let mapBlock = ''
  try {
    const map = await getProjectMap(projectPath, false)
    const fullText = projectMapToText(map)
    // Keep just the directory headers — file-level detail blows up the budget.
    const compact = compactProjectMap(fullText)
    if (compact) mapBlock = compact
  } catch {
    /* map build failed — skip silently */
  }

  if (parts.length === 0 && !mapBlock) return ''

  const meta = parts.length > 0 ? parts.join('\n') : '(no git, no recent writes)'
  const mapSection = mapBlock ? `\n\nproject_map (compact):\n${mapBlock}` : ''
  return `<context_pack generated="auto" project="${escapeAttr(projectPath)}">
${meta}${mapSection}
</context_pack>`
}

/**
 * Run `git status -sb` and `git rev-parse --abbrev-ref HEAD` and turn the
 * output into a single-line summary. Returns null if not a git repo.
 */
async function readGitStatus(projectPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['status', '-sb'], {
      cwd: projectPath, timeout: 5000, windowsHide: true, maxBuffer: 256 * 1024
    })
    const lines = stdout.split('\n').map(l => l.trimEnd()).filter(Boolean)
    if (lines.length === 0) return null
    const head = lines[0].replace(/^## /, '')
    const body = lines.slice(1)
    if (body.length === 0) return `${head} (clean)`
    const modified = body.filter(l => /^ ?[MARCD]/.test(l)).length
    const untracked = body.filter(l => l.startsWith('?? ')).length
    const summary = `${head}, ${modified} modified, ${untracked} untracked`
    // Include first 5 actual paths so model can target them
    const firstFew = body.slice(0, 5).map(l => l.trim()).join('; ')
    return `${summary}${firstFew ? ` [${firstFew}]` : ''}`
  } catch {
    return null
  }
}

/**
 * Look at package.json scripts (and existence of tsconfig / php files) to
 * suggest what verify command to run after edits.
 */
async function detectVerifyScripts(projectPath: string): Promise<string[]> {
  const hints: string[] = []
  try {
    const pkgRaw = await readFile(join(projectPath, 'package.json'), 'utf8')
    const pkg = JSON.parse(pkgRaw) as { scripts?: Record<string, string> }
    const scripts = pkg.scripts ?? {}
    if (scripts.test) hints.push('npm test')
    if (scripts['type-check'] || scripts.typecheck) hints.push('npm run type-check')
    if (scripts.lint) hints.push('npm run lint')
    if (scripts.build) hints.push('npm run build')
  } catch {
    /* not a node project, skip */
  }
  // tsconfig present → tsc --noEmit is a reasonable verify
  try {
    await readFile(join(projectPath, 'tsconfig.json'), 'utf8')
    if (!hints.some(h => h.includes('tsc') || h.includes('type-check'))) {
      hints.push('npx tsc --noEmit')
    }
  } catch { /* no tsconfig */ }
  return hints.slice(0, 4)  // cap to keep it short
}

/**
 * Take the full `projectMapToText` output and shorten to fit in the system
 * prompt without blowing the budget. Strategy: keep top-level directories
 * with file counts, drop the per-file symbol lists.
 */
function compactProjectMap(fullText: string): string {
  const lines = fullText.split('\n')
  const out: string[] = []
  let charBudget = 1500
  for (const line of lines) {
    if (line.startsWith('# ') || line.startsWith('Files:') || line.startsWith('## ')) {
      out.push(line)
      charBudget -= line.length
    } else if (line.startsWith('- ') && charBudget > 0) {
      // Strip symbol detail; keep just file path
      const cleaned = line.split('  ')[0]  // first segment before symbol block
      out.push(cleaned)
      charBudget -= cleaned.length
    }
    if (charBudget <= 0) {
      out.push('…(truncated)')
      break
    }
  }
  return out.join('\n')
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
