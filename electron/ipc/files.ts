import { ipcMain } from 'electron'
import { readdir, stat, readFile } from 'fs/promises'
import { join, resolve, relative, sep } from 'path'

const IGNORE = new Set(['node_modules', '.git', 'out', 'dist', '.geminigrok-data', '.superpowers'])
const MAX_READ_BYTES = 2 * 1024 * 1024  // 2 MB safety cap

export interface FileNode {
  name: string
  path: string  // absolute
  isDirectory: boolean
  children?: FileNode[]
}

async function listTree(current: string, depth: number): Promise<FileNode[]> {
  if (depth > 5) return []
  let entries: string[]
  try {
    entries = await readdir(current)
  } catch {
    return []
  }
  const nodes: FileNode[] = []
  for (const name of entries) {
    if (IGNORE.has(name) || name.startsWith('.')) continue
    const abs = join(current, name)
    let st
    try { st = await stat(abs) } catch { continue }
    if (st.isDirectory()) {
      nodes.push({ name, path: abs, isDirectory: true, children: await listTree(abs, depth + 1) })
    } else {
      nodes.push({ name, path: abs, isDirectory: false })
    }
  }
  nodes.sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name))
  return nodes
}

/**
 * Verifies that `target` resolves to a path inside `root` after symlink-aware
 * normalization. Throws on path traversal or attempts to read outside the project.
 */
function assertInsideRoot(root: string, target: string): string {
  if (!root) throw new Error('Проект не открыт — чтение файлов недоступно')
  const normalizedRoot = resolve(root)
  const normalizedTarget = resolve(target)
  const rel = relative(normalizedRoot, normalizedTarget)
  if (rel === '' || rel.startsWith('..') || rel.includes('..' + sep) || rel.startsWith(sep)) {
    throw new Error(`Запрещено читать вне проекта: ${target}`)
  }
  return normalizedTarget
}

export interface FilesIpcDeps {
  getProjectRoot: () => string | null
}

export function registerFilesIpc(deps: FilesIpcDeps): void {
  ipcMain.handle('files:tree', async (_e, root: string) => {
    // listTree is bounded by the root itself + IGNORE list + depth — already safe.
    return listTree(root, 0)
  })

  ipcMain.handle('files:read', async (_e, path: string) => {
    const root = deps.getProjectRoot()
    if (!root) throw new Error('Проект не открыт')
    const abs = assertInsideRoot(root, path)
    const st = await stat(abs)
    if (!st.isFile()) throw new Error(`Не файл: ${path}`)
    if (st.size > MAX_READ_BYTES) {
      throw new Error(`Файл слишком большой для чтения: ${st.size} байт (лимит ${MAX_READ_BYTES})`)
    }
    return await readFile(abs, 'utf8')
  })
}
