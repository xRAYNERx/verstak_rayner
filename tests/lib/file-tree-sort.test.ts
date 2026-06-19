import { describe, it, expect } from 'vitest'
import { sortFileTree } from '../../src/lib/file-tree-sort'
import type { FileNode } from '../../src/types/api'

const f = (name: string, isDirectory = false, children?: FileNode[]): FileNode =>
  ({ name, path: `/${name}`, isDirectory, ...(children ? { children } : {}) })

describe('sortFileTree', () => {
  it('папки идут раньше файлов, внутри — по алфавиту', () => {
    const out = sortFileTree([f('readme.md'), f('src', true), f('App.tsx'), f('lib', true)])
    expect(out.map(n => n.name)).toEqual(['lib', 'src', 'App.tsx', 'readme.md'])
  })

  it('рекурсивно сортирует children', () => {
    const out = sortFileTree([
      f('src', true, [f('z.ts'), f('utils', true), f('a.ts')]),
    ])
    expect(out[0].children!.map(n => n.name)).toEqual(['utils', 'a.ts', 'z.ts'])
  })

  it('не мутирует вход', () => {
    const input = [f('b.ts'), f('a', true)]
    const snapshot = input.map(n => n.name)
    sortFileTree(input)
    expect(input.map(n => n.name)).toEqual(snapshot)
  })

  it('числовая сортировка натуральная (2 раньше 10)', () => {
    const out = sortFileTree([f('item10.ts'), f('item2.ts')])
    expect(out.map(n => n.name)).toEqual(['item2.ts', 'item10.ts'])
  })
})
