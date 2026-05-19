import { spawn } from 'child_process'
import { platform } from 'os'
import { existsSync } from 'fs'
import { join } from 'path'
import type { ChatProvider, ChatMessage, ChatEvent, ToolDefinition, ToolResult } from './types'

interface ClaudeCliOptions {
  binary?: string
  cwd?: string
  signal?: AbortSignal
}

function findBinary(): string {
  // Claude Code installs to ~/.local/bin/claude by default on Windows/macOS/Linux
  const home = process.env.USERPROFILE || process.env.HOME || ''
  const candidates: string[] = []
  if (home) {
    candidates.push(join(home, '.local', 'bin', 'claude'))
    candidates.push(join(home, '.local', 'bin', 'claude.exe'))
  }
  if (platform() === 'win32' && process.env.APPDATA) {
    candidates.push(join(process.env.APPDATA, 'npm', 'claude.cmd'))
  }
  for (const c of candidates) if (existsSync(c)) return c
  return 'claude'
}

interface CliEvent {
  type: string
  subtype?: string
  message?: { content?: Array<{ type: string; text?: string }> }
  is_error?: boolean
  error?: string
  result?: string
}

export function createClaudeCliProvider(opts: ClaudeCliOptions = {}): ChatProvider {
  const binary = opts.binary ?? findBinary()
  const cwd = opts.cwd ?? process.cwd()

  return {
    id: 'claude-cli',
    name: 'Claude Code',
    models: ['auto'],

    async *send(messages: ChatMessage[], _tools: ToolDefinition[], _results?: ToolResult[]): AsyncIterable<ChatEvent> {
      const lastUser = messages.filter(m => m.role === 'user').at(-1)
      if (!lastUser?.content) {
        yield { type: 'error', message: 'Нет user-сообщения для отправки' }
        return
      }

      const args = ['--print', '--output-format', 'stream-json', '--verbose']
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
        yield { type: 'error', message: `Claude CLI stdin error: ${err instanceof Error ? err.message : String(err)}` }
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
      const lastText: Record<string, string> = {}  // delta deduplication per message id

      function processLine(line: string) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('{')) return
        let ev: CliEvent
        try { ev = JSON.parse(trimmed) } catch { return }

        if (ev.type === 'assistant' && ev.message?.content) {
          for (const block of ev.message.content) {
            if (block.type === 'text' && block.text) {
              const id = ev.message ? JSON.stringify(ev.message).slice(0, 32) : 'x'
              const prev = lastText[id] ?? ''
              // The CLI sends accumulated text per partial event — emit only the new tail
              if (block.text.startsWith(prev)) {
                const delta = block.text.slice(prev.length)
                if (delta) queue.push({ type: 'text', text: delta })
                lastText[id] = block.text
              } else {
                queue.push({ type: 'text', text: block.text })
                lastText[id] = block.text
              }
              wake()
            }
          }
        } else if (ev.type === 'result') {
          if (ev.is_error) {
            queue.push({ type: 'error', message: ev.error ?? ev.result ?? 'Claude CLI завершился с ошибкой' })
          } else {
            queue.push({ type: 'done' })
          }
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
        queue.push({ type: 'error', message: `Запуск Claude CLI не удался: ${err.message}` })
        done = true; wake()
      })
      child.on('close', (code) => {
        if (stdoutBuffer.length > 0) processLine(stdoutBuffer)
        if (code !== 0 && !queue.some(e => e.type === 'done')) {
          queue.push({ type: 'error', message: `Claude CLI exit ${code}. ${stderrBuffer.slice(0, 400)}` })
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
