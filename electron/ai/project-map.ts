/**
 * Project Map — фоновое сканирование структуры проекта в компактный JSON,
 * который AI может загрузить через get_project_map в начале задачи.
 *
 * Это даёт семантический слой поверх ripgrep: AI видит layout до того как
 * полезет читать файлы, и может прицельно искать вместо случайных list_directory.
 *
 * Что в карте:
 *   - дерево директорий (только структура, без содержимого)
 *   - все top-level символы из *.ts/*.tsx/*.js/*.jsx (functions, classes,
 *     React components, exports) через быстрый regex (не AST — слишком дорого
 *     для фоновой задачи)
 *   - количество строк в файле
 *
 * Регенерация: при mount активного проекта (один раз) + по явному вызову
 * AI tool refresh_project_map. Кэш в памяти, не на диск — не хочется
 * грязнить project root.
 */

import { readdir, stat, readFile } from 'fs/promises'
import { join, relative } from 'path'

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'out', 'dist', '.next', '.vite', '.verstak',
  '.verstak-data', '.superpowers', '__pycache__', 'venv', '.venv',
  'target', 'build', '.cache', '.turbo', '.parcel-cache'
])

const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])
const MAX_FILE_SCAN_BYTES = 256 * 1024
const MAX_TOTAL_FILES = 2000

interface FileSymbol {
  /** function | class | component | export | type */
  kind: string
  name: string
  line: number
}

interface ProjectFileEntry {
  path: string       // relative, posix-style
  lines: number
  symbols: FileSymbol[]
}

export interface ProjectMap {
  root: string
  generatedAt: number
  files: ProjectFileEntry[]
  /** Stats for quick overview. */
  stats: {
    totalFiles: number
    codeFiles: number
    totalLines: number
    truncated: boolean
  }
}

/**
 * Regex symbol extractor. Not as accurate as a real parser but fast (~5x
 * faster than spawning tsc) and good enough to give AI a structural map.
 */
function extractSymbols(content: string): FileSymbol[] {
  const lines = content.split('\n')
  const out: FileSymbol[] = []
  const seen = new Set<string>()
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // export function / export async function
    let m = /^\s*export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/.exec(line)
    if (m) { addSym('function', m[1], i + 1); continue }
    // export class
    m = /^\s*export\s+(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/.exec(line)
    if (m) { addSym('class', m[1], i + 1); continue }
    // export const Foo = ... (likely React component if PascalCase)
    m = /^\s*export\s+const\s+([A-Za-z_$][\w$]*)\s*[:=]/.exec(line)
    if (m) {
      const name = m[1]
      const kind = /^[A-Z]/.test(name) ? 'component' : 'export'
      addSym(kind, name, i + 1)
      continue
    }
    // export type / interface
    m = /^\s*export\s+(type|interface)\s+([A-Za-z_$][\w$]*)/.exec(line)
    if (m) { addSym('type', m[2], i + 1); continue }
    // export default function/class
    m = /^\s*export\s+default\s+(?:async\s+)?(function|class)\s+([A-Za-z_$][\w$]*)?/.exec(line)
    if (m) { addSym(m[1], m[2] || 'default', i + 1); continue }
  }
  function addSym(kind: string, name: string, line: number): void {
    const key = `${kind}:${name}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({ kind, name, line })
  }
  return out.slice(0, 50)  // hard cap per file
}

export async function buildProjectMap(root: string): Promise<ProjectMap> {
  const files: ProjectFileEntry[] = []
  let totalLines = 0
  let truncated = false

  async function walk(dir: string): Promise<void> {
    if (files.length >= MAX_TOTAL_FILES) { truncated = true; return }
    let entries: string[]
    try { entries = await readdir(dir) } catch { return }
    entries.sort()
    for (const name of entries) {
      if (files.length >= MAX_TOTAL_FILES) { truncated = true; return }
      if (IGNORE_DIRS.has(name)) continue
      if (name.startsWith('.') && name !== '.env.example') continue
      const abs = join(dir, name)
      let st
      try { st = await stat(abs) } catch { continue }
      if (st.isDirectory()) { await walk(abs); continue }
      if (!st.isFile()) continue
      const rel = relative(root, abs).replace(/\\/g, '/')
      const dotIdx = name.lastIndexOf('.')
      const ext = dotIdx > 0 ? name.slice(dotIdx) : ''
      // Code file → extract symbols + line count
      if (CODE_EXT.has(ext) && st.size <= MAX_FILE_SCAN_BYTES) {
        let content: string
        try { content = await readFile(abs, 'utf8') } catch { continue }
        const lines = content.split('\n').length
        totalLines += lines
        const symbols = extractSymbols(content)
        files.push({ path: rel, lines, symbols })
      } else {
        // Non-code or oversized: just record path
        files.push({ path: rel, lines: 0, symbols: [] })
      }
    }
  }
  await walk(root)

  const codeFiles = files.filter(f => f.lines > 0).length
  return {
    root,
    generatedAt: Date.now(),
    files,
    stats: { totalFiles: files.length, codeFiles, totalLines, truncated }
  }
}

export interface ProjectMapTextOptions {
  /**
   * 'compact': directory headers + file paths only, no per-file symbols,
   * with a soft byte budget. Used by Context Pack to fit the map into the
   * system prompt without re-parsing the full output.
   * 'full' (default): everything including symbols.
   */
  mode?: 'full' | 'compact'
  /** Soft cap on output chars in compact mode (default 1500). */
  maxChars?: number
}

/** Textual representation for the AI. Default 'full' for `get_project_map`
 *  tool; Context Pack passes mode='compact' to fit budget. */
export function projectMapToText(map: ProjectMap, opts: ProjectMapTextOptions = {}): string {
  const mode = opts.mode ?? 'full'
  const maxChars = opts.maxChars ?? 1500
  const compact = mode === 'compact'

  const lines: string[] = []
  lines.push(`# Project Map`)
  lines.push(`Generated: ${new Date(map.generatedAt).toISOString()}`)
  lines.push(`Files: ${map.stats.totalFiles} (${map.stats.codeFiles} code), ${map.stats.totalLines} lines${map.stats.truncated ? ' [truncated]' : ''}`)
  lines.push('')
  // Group by top-level directory
  const groups = new Map<string, ProjectFileEntry[]>()
  for (const f of map.files) {
    const top = f.path.includes('/') ? f.path.split('/')[0] : '(root)'
    if (!groups.has(top)) groups.set(top, [])
    groups.get(top)!.push(f)
  }
  let budget = compact ? maxChars : Number.POSITIVE_INFINITY
  outer: for (const [top, fs] of groups) {
    const head = `## ${top}/ (${fs.length} files)`
    lines.push(head)
    budget -= head.length
    for (const f of fs) {
      if (budget <= 0) {
        lines.push('…(truncated)')
        break outer
      }
      const sym = !compact && f.symbols.length > 0
        ? '  ' + f.symbols.map(s => `${s.kind}:${s.name}`).join(', ')
        : ''
      const line = `- ${f.path}${f.lines ? ` (${f.lines}L)` : ''}${sym}`
      lines.push(line)
      budget -= line.length
    }
    if (!compact) lines.push('')
  }
  return lines.join('\n')
}

// In-memory cache keyed by project root
const cache = new Map<string, ProjectMap>()

export async function getProjectMap(root: string, refresh = false): Promise<ProjectMap> {
  if (!refresh) {
    const cached = cache.get(root)
    if (cached) return cached
  }
  const map = await buildProjectMap(root)
  cache.set(root, map)
  return map
}

export function invalidateProjectMap(root: string): void {
  cache.delete(root)
}
