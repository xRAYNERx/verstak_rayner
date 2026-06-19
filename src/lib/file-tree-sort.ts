import type { FileNode } from '../types/api'

/**
 * Классическая сортировка дерева файлов: сначала папки (по алфавиту), потом
 * файлы (по алфавиту). Рекурсивно по children. Без мутации входа.
 * NodeJS отдаёт файлы в произвольном порядке — на больших проектах это выглядит
 * хаотично; здесь приводим к привычному виду проводника/IDE.
 */
export function sortFileTree(nodes: FileNode[]): FileNode[] {
  return [...nodes]
    .sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })
    })
    .map(n => (n.children ? { ...n, children: sortFileTree(n.children) } : n))
}
