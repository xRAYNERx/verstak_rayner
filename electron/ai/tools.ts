import { readFile, readdir, stat, writeFile } from 'fs/promises'
import { join, resolve, relative, sep } from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import type { ToolDefinition } from './types'
import { classifyCommand } from './command-policy'

const execFileAsync = promisify(execFile)

const MAX_READ_BYTES = 2 * 1024 * 1024  // 2 MB

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
  },
  {
    name: 'run_command',
    description: 'Запустить shell-команду в корне проекта. Команда требует подтверждения пользователя. Возвращает stdout/stderr/exitCode.',
    parameters: {
      type: 'object',
      properties: { command: { type: 'string', description: 'Команда для shell. Без побочных эффектов вне проекта.' } },
      required: ['command']
    }
  }
]

export interface FileTools {
  execute: (name: string, args: Record<string, unknown>) => Promise<unknown>
  /** Pure execution — used by the IPC layer after user has confirmed the command. */
  runCommand: (command: string) => Promise<{ stdout: string; stderr: string; exitCode: number }>
  classifyCommand: typeof classifyCommand
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
  async function runCommand(command: string) {
    // Spawn the shell ourselves rather than using execSync: we want a hard
    // timeout, captured stderr, and no parent-process hijack.
    const isWindows = process.platform === 'win32'
    const shell = isWindows ? process.env.ComSpec || 'cmd.exe' : '/bin/sh'
    const shellArg = isWindows ? '/d /s /c' : '-c'
    try {
      const { stdout, stderr } = await execFileAsync(shell, [...shellArg.split(' '), command], {
        cwd: root,
        timeout: 60_000,
        maxBuffer: 4 * 1024 * 1024,
        windowsHide: true
      })
      return { stdout: String(stdout ?? ''), stderr: String(stderr ?? ''), exitCode: 0 }
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string; code?: number; killed?: boolean; signal?: string; message?: string }
      const exitCode = typeof e.code === 'number' ? e.code : 1
      const stderr = String(e.stderr ?? e.message ?? '')
      return { stdout: String(e.stdout ?? ''), stderr, exitCode }
    }
  }

  return {
    classifyCommand,
    runCommand,

    async execute(name, args) {
      if (name === 'read_file') {
        const abs = safeJoin(root, String(args.path))
        const st = await stat(abs)
        if (!st.isFile()) throw new Error(`Не файл: ${args.path}`)
        if (st.size > MAX_READ_BYTES) {
          throw new Error(`Файл слишком большой: ${st.size} байт (лимит ${MAX_READ_BYTES})`)
        }
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
      if (name === 'run_command') {
        // The IPC layer intercepts this tool call to gather user confirmation
        // BEFORE invoking execute. If we land here, it means the confirmation
        // flow was bypassed — fail loudly rather than silently executing.
        throw new Error('run_command нельзя вызывать напрямую — он проходит через подтверждение пользователя')
      }
      throw new Error(`Неизвестный tool: ${name}`)
    }
  }
}
