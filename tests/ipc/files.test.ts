import { describe, it, expect, vi, beforeAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/**
 * Ревью F4: files:tree (listTree) должен использовать lstat и ПРОПУСКАТЬ symlink,
 * иначе symlink-директория наружу от проекта раскрывается рекурсивно (обход
 * isWithinKnownRoots). Регресс-тест на это раньше отсутствовал.
 *
 * files.ts тянет electron (ipcMain/shell) — мокаем no-op, listTree чистый (fs+path).
 * Создание symlink на Windows требует привилегий — мягкий пропуск при EPERM.
 */
vi.mock('electron', () => ({
  ipcMain: { handle: () => {} },
  shell: {}
}))

let listTree: (current: string, depth: number) => Promise<Array<{ name: string; isDirectory: boolean }>>

beforeAll(async () => {
  const mod = await import('../../electron/ipc/files')
  listTree = mod.listTree
})

describe('listTree symlink-safety (F4)', () => {
  it('пропускает symlink-директорию, ведущую наружу проекта', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gg-tree-root-'))
    const outside = mkdtempSync(join(tmpdir(), 'gg-tree-outside-'))
    writeFileSync(join(outside, 'secret.txt'), 'SECRET')
    // Обычный файл внутри проекта — должен присутствовать.
    writeFileSync(join(root, 'real.txt'), 'ok')
    mkdirSync(join(root, 'sub'))
    writeFileSync(join(root, 'sub', 'inner.txt'), 'ok')
    // Symlink наружу — должен быть пропущен.
    const link = join(root, 'escape')
    let linked = false
    try { symlinkSync(outside, link, 'dir'); linked = true } catch { /* нет привилегий */ }

    const tree = await listTree(root, 0)
    const names = tree.map(n => n.name)
    expect(names).toContain('real.txt')
    expect(names).toContain('sub')
    if (linked) {
      // Ключевое: symlink не раскрыт (его нет в дереве, секрет недоступен).
      expect(names).not.toContain('escape')
      const escapeNode = tree.find(n => n.name === 'escape')
      expect(escapeNode).toBeUndefined()
    }
  })
})
