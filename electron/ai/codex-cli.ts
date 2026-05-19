import { spawn } from 'child_process'
import { platform } from 'os'
import { existsSync } from 'fs'
import { join } from 'path'
import type { ChatProvider, ChatMessage, ChatEvent, ToolDefinition, ToolResult } from './types'

interface CodexCliOptions {
  binary?: string
  cwd?: string
  signal?: AbortSignal
}

function findBinary(): string {
  if (platform() === 'win32' && process.env.APPDATA) {
    const candidates = [
      join(process.env.APPDATA, 'npm', 'codex.cmd'),
      join(process.env.APPDATA, 'npm', 'codex.ps1')
    ]
    for (const c of candidates) if (existsSync(c)) return c
  }
  const home = process.env.HOME || process.env.USERPROFILE || ''
  if (home) {
    const local = join(home, '.local', 'bin', 'codex')
    if (existsSync(local)) return local
  }
  return 'codex'
}

interface CliEvent {
  type: string
  item?: { type?: string; text?: string }
  error?: string
}

export function createCodexCliProvider(opts: CodexCliOptions = {}): ChatProvider {
  const binary = opts.binary ?? findBinary()
  const cwd = opts.cwd ?? process.cwd()

  return {
    id: 'codex-cli',
    name: 'Codex',
    models: ['auto'],

    async *send(messages: ChatMessage[], _tools: ToolDefinition[], _results?: ToolResult[]): AsyncIterable<ChatEvent> {
      const lastUser = messages.filter(m => m.role === 'user').at(-1)
      if (!lastUser?.content) {
        yield { type: 'error', message: 'Нет user-сообщения для отправки' }
        return
      }

      const args = ['exec', '--json']
      const child = spawn(binary, args, {
        cwd,
        shell: binary.endsWith('.cmd') || binary.endsWith('.ps1'),
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe']
      })

      try {
        child.stdin.write(lastUser.content)
        child.stdin.end()
      } catch (err) {
        yield { type: 'error', message: `Codex CLI stdin error: ${err instanceof Error ? err.message : String(err)}` }
        try { child.kill() } catch { /* noop */ }
        return
      }

      let abortListener: (() => void) | null = null
      if (opts.signal) {
        abortListener = () => { try { child.kill() } catch { /* noop */ } }
        opts.signal.addEventListener('abort', abortListener, { once: true })
      }

      let stdoutBuffer = ''
      let stderrBuffer = ''
      const queue: ChatEvent[] = []
      let done = false
      let resolve: (() => void) | null = null
      const wake = () => { if (resolve) { const r = resolve; resolve = null; r() } }

      function processLine(line: string) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('{')) return
        let ev: CliEvent
        try { ev = JSON.parse(trimmed) } catch { return }

        if (ev.type === 'item.completed' && ev.item?.type === 'agent_message' && ev.item.text) {
          queue.push({ type: 'text', text: ev.item.text })
          wake()
        } else if (ev.type === 'turn.completed') {
          queue.push({ type: 'done' })
          wake()
        } else if (ev.type === 'error') {
          queue.push({ type: 'error', message: ev.error ?? 'Codex CLI вернул error' })
          wake()
        }
      }

      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (chunk: string) => {
        stdoutBuffer += chunk
        let idx
        while ((idx = stdoutBuffer.indexOf('\n')) >= 0) {
          const line = stdoutBuffer.slice(0, idx)
          stdoutBuffer = stdoutBuffer.slice(idx + 1)
          processLine(line)
        }
      })
      child.stderr.setEncoding('utf8')
      child.stderr.on('data', (chunk: string) => { stderrBuffer += chunk })

      child.on('error', (err) => {
        queue.push({ type: 'error', message: `Запуск Codex CLI не удался: ${err.message}` })
        done = true; wake()
      })
      child.on('close', (code) => {
        if (stdoutBuffer.length > 0) processLine(stdoutBuffer)
        if (code !== 0 && !queue.some(e => e.type === 'done')) {
          queue.push({ type: 'error', message: `Codex CLI exit ${code}. ${stderrBuffer.slice(0, 400)}` })
        }
        done = true; wake()
      })

      try {
        while (!done || queue.length > 0) {
          if (queue.length === 0) {
            await new Promise<void>(r => { resolve = r })
            continue
          }
          const ev = queue.shift()!
          yield ev
          if (ev.type === 'done' || ev.type === 'error') {
            try { child.kill() } catch { /* noop */ }
            return
          }
        }
      } finally {
        if (opts.signal && abortListener) {
          try { opts.signal.removeEventListener('abort', abortListener) } catch { /* noop */ }
        }
      }
    }
  }
}
