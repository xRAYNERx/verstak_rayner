import { ipcMain } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { safeRealJoin } from '../ai/path-policy'
import { scanText } from '../ai/secret-scanner'

const execFileAsync = promisify(execFile)

/**
 * Git READ IPC (Dev Task Flow, Фаза 1) — структурированные status/diff/log для
 * панели задач. ТОЛЬКО чтение: ветки/коммиты/push добавит git-write в Фазе 3.
 *
 * Безопасность — основа для будущего git-write:
 *   - argv-форма: execFile('git', [...], {cwd}) без shell → нет command injection.
 *   - top-frame guard: <webview>/out-of-process frames имеют не-top sender — им
 *     git недоступен (как в verify.ts).
 *   - весь вывод через scanText — diff/log могут содержать токены/ключи в коде.
 *   - cwd всегда = getProjectRoot(); пользовательский path — через safeRealJoin.
 *
 * Денилист на запись в Фазе 1 не нужен (read-only). argv-форма исключает
 * подмену команды; git сам не выполняет произвольный shell на read-операциях.
 */

const GIT_TIMEOUT = 15_000
const MAX_BUFFER = 8 * 1024 * 1024
// Кап патча ~50КБ — чтобы тяжёлый diff не раздул IPC / UI.
const PATCH_CAP = 50 * 1024

export interface GitStatus {
  branch: string | null
  ahead: number
  behind: number
  staged: string[]
  unstaged: string[]
  untracked: string[]
}

export interface GitDiffStatEntry {
  path: string
  added: number
  removed: number
  status: string
}

export interface GitDiff {
  stat: GitDiffStatEntry[]
  patch?: string
}

export interface GitLogEntry {
  sha: string
  subject: string
  author: string
  date: string
}

/** True для top-level main frame; false для webview / out-of-process. */
function isTopFrame(e: Electron.IpcMainInvokeEvent): boolean {
  return !!e.sender && e.senderFrame?.parent == null
}

async function runGit(cwd: string, argv: string[]): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await execFileAsync('git', argv, {
    cwd, timeout: GIT_TIMEOUT, maxBuffer: MAX_BUFFER, windowsHide: true
  })
  return { stdout: String(stdout ?? ''), stderr: String(stderr ?? '') }
}

/**
 * Парсит `git status --porcelain=v1 --branch` в структурированный статус.
 * Первая строка `## branch...upstream [ahead N, behind M]` — ветка + дивергенция;
 * далее строки `XY path` где X = staged-статус, Y = unstaged-статус (?? = untracked).
 */
function parseStatus(stdout: string): GitStatus {
  const result: GitStatus = { branch: null, ahead: 0, behind: 0, staged: [], unstaged: [], untracked: [] }
  const lines = stdout.split('\n').filter(l => l.length > 0)
  for (const line of lines) {
    if (line.startsWith('## ')) {
      const head = line.slice(3)
      // branch — до '...' (если есть upstream) либо до пробела.
      const branchPart = head.split('...')[0].split(' ')[0]
      // Detached HEAD: git печатает 'HEAD (no branch)'.
      result.branch = branchPart === 'HEAD' ? null : branchPart
      const ahead = head.match(/ahead (\d+)/)
      const behind = head.match(/behind (\d+)/)
      if (ahead) result.ahead = Number(ahead[1])
      if (behind) result.behind = Number(behind[1])
      continue
    }
    // Формат: XY<space>path  (для переименований path = 'old -> new').
    const x = line[0]
    const y = line[1]
    const path = line.slice(3)
    if (x === '?' && y === '?') {
      result.untracked.push(path)
      continue
    }
    // staged (index) — X не пробел и не '?'.
    if (x !== ' ' && x !== '?') result.staged.push(path)
    // unstaged (worktree) — Y не пробел и не '?'.
    if (y !== ' ' && y !== '?') result.unstaged.push(path)
  }
  return result
}

/**
 * Парсит `git diff --numstat`: строки `added<tab>removed<tab>path`.
 * Бинарные файлы дают '-' вместо чисел → added/removed = 0.
 */
function parseNumstat(stdout: string): GitDiffStatEntry[] {
  const entries: GitDiffStatEntry[] = []
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue
    const parts = line.split('\t')
    if (parts.length < 3) continue
    const added = parts[0] === '-' ? 0 : Number(parts[0])
    const removed = parts[1] === '-' ? 0 : Number(parts[1])
    const path = parts.slice(2).join('\t')
    entries.push({ path, added, removed, status: parts[0] === '-' ? 'binary' : 'modified' })
  }
  return entries
}

export function registerGitIpc(getProjectRoot: () => string | null): void {
  // git:status — структурированный статус активного проекта.
  ipcMain.handle('git:status', async (e): Promise<GitStatus> => {
    if (!isTopFrame(e)) {
      return { branch: null, ahead: 0, behind: 0, staged: [], unstaged: [], untracked: [] }
    }
    const cwd = getProjectRoot()
    if (!cwd) return { branch: null, ahead: 0, behind: 0, staged: [], unstaged: [], untracked: [] }
    try {
      const { stdout } = await runGit(cwd, ['status', '--porcelain=v1', '--branch'])
      return parseStatus(scanText(stdout).redacted)
    } catch {
      // Не git-репозиторий / git не установлен — пустой статус, не падаем.
      return { branch: null, ahead: 0, behind: 0, staged: [], unstaged: [], untracked: [] }
    }
  })

  // git:diff — numstat + сам патч (cap ~50КБ). base сравнивает base..HEAD,
  // staged показывает индекс (--cached), path сужает до файла (через safeRealJoin).
  ipcMain.handle('git:diff', async (e, opts?: { base?: string; staged?: boolean; path?: string }): Promise<GitDiff> => {
    if (!isTopFrame(e)) return { stat: [] }
    const cwd = getProjectRoot()
    if (!cwd) return { stat: [] }
    const base = opts?.base
    const staged = opts?.staged === true
    const rel = opts?.path
    // Базовые аргументы diff: --cached для индекса, base..HEAD для сравнения с базой.
    const baseArgs: string[] = []
    if (staged) baseArgs.push('--cached')
    if (base) {
      // Простая валидация ref-имени — argv-форма уже исключает injection,
      // но отсекаем явный мусор/опции (ведущий '-').
      if (!/^[\w./@^~-]+$/.test(base) || base.startsWith('-')) return { stat: [] }
      baseArgs.push(`${base}..HEAD`)
    }
    // Путь-ограничитель: валидируем через safeRealJoin (anti-traversal),
    // но git'у передаём относительный путь после '--' (pathspec, не опция).
    let pathSpec: string[] = []
    if (rel) {
      try {
        await safeRealJoin(cwd, rel)
      } catch {
        return { stat: [] }
      }
      pathSpec = ['--', rel]
    }
    try {
      const numstat = await runGit(cwd, ['diff', ...baseArgs, '--numstat', ...pathSpec])
      const stat = parseNumstat(scanText(numstat.stdout).redacted)
      const raw = await runGit(cwd, ['diff', ...baseArgs, ...pathSpec])
      let patch = scanText(raw.stdout).redacted
      if (patch.length > PATCH_CAP) patch = patch.slice(0, PATCH_CAP) + '\n… (патч обрезан)'
      return { stat, patch: patch.length > 0 ? patch : undefined }
    } catch {
      return { stat: [] }
    }
  })

  // git:log — последние коммиты (sha/subject/author/date). limit default 20.
  ipcMain.handle('git:log', async (e, opts?: { limit?: number }): Promise<GitLogEntry[]> => {
    if (!isTopFrame(e)) return []
    const cwd = getProjectRoot()
    if (!cwd) return []
    const limit = Math.max(1, Math.min(opts?.limit ?? 20, 200))
    // Разделитель \x1f (unit separator) между полями, \x1e (record separator)
    // между записями — устойчиво к переводам строк внутри subject.
    const format = '%H%x1f%s%x1f%an%x1f%ad'
    try {
      const { stdout } = await runGit(cwd, ['log', `-n${limit}`, '--date=short', `--format=${format}%x1e`])
      const redacted = scanText(stdout).redacted
      const entries: GitLogEntry[] = []
      for (const record of redacted.split('\x1e')) {
        const trimmed = record.replace(/^\n/, '')
        if (!trimmed.trim()) continue
        const [sha, subject, author, date] = trimmed.split('\x1f')
        if (!sha) continue
        entries.push({ sha, subject: subject ?? '', author: author ?? '', date: date ?? '' })
      }
      return entries
    } catch {
      return []
    }
  })
}
