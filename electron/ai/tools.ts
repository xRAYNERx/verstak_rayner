import { readFile, readdir, stat, writeFile } from 'fs/promises'
import { join, resolve, relative, sep } from 'path'
import type { ToolDefinition } from './types'

export const TOOL_DEFS: ToolDefinition[] = [
  {
    name: 'read_file',
    description: 'Прочитать содержимое файла относительно корня проекта',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Относительный путь от корня проекта' } },
      required: ['path']
    }
  },
  {
    name: 'list_directory',
    description: 'Перечислить файлы и папки в директории',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Относительный путь, "." для корня' } },
      required: ['path']
    }
  },
  {
    name: 'write_file',
    description: 'Записать содержимое в файл. Требует подтверждения пользователя.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string' }
      },
      required: ['path', 'content']
    }
  }
]

export interface FileTools {
  execute: (name: string, args: Record<string, unknown>) => Promise<unknown>
}

function safeJoin(root: string, rel: string): string {
  const abs = resolve(root, rel)
  const r = relative(root, abs)
  if (r.startsWith('..') || r.includes('..' + sep) || r === '..') {
    throw new Error(`Запрещён выход за пределы проекта: ${rel}`)
  }
  return abs
}

export function createFileTools(root: string): FileTools {
  return {
    async execute(name, args) {
      if (name === 'read_file') {
        const abs = safeJoin(root, String(args.path))
        return await readFile(abs, 'utf8')
      }
      if (name === 'list_directory') {
        const abs = safeJoin(root, String(args.path))
        const entries = await readdir(abs)
        const out: string[] = []
        for (const e of entries) {
          const st = await stat(join(abs, e))
          out.push(st.isDirectory() ? `${e}/` : e)
        }
        return out
      }
      if (name === 'write_file') {
        const abs = safeJoin(root, String(args.path))
        await writeFile(abs, String(args.content), 'utf8')
        return { ok: true }
      }
      throw new Error(`Неизвестный tool: ${name}`)
    }
  }
}
