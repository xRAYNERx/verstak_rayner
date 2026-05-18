import { ipcMain } from 'electron'
import { readdir, stat, readFile } from 'fs/promises'
import { join } from 'path'

const IGNORE = new Set(['node_modules', '.git', 'out', 'dist', '.geminigrok-data', '.superpowers'])

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

export function registerFilesIpc(): void {
  ipcMain.handle('files:tree', async (_e, root: string) => listTree(root, 0))
  ipcMain.handle('files:read', async (_e, path: string) => readFile(path, 'utf8'))
}
