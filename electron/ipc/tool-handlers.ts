/**
 * Tool handlers — extracted from runApiConversation.
 *
 * Each handler takes a normalized ToolContext + the tool call, and returns a
 * ToolResult. Handlers also have side-effects (UI events, journal entries,
 * attachment collection) that they perform via ctx callbacks.
 *
 * The dispatch table (HANDLER_REGISTRY) maps tool name → handler entry.
 * `mode` controls how the agentic loop schedules execution:
 *
 *   'parallel-read' — pure-info tools (read_file/list_directory/search_project/
 *                     find_files/get_project_map/refresh_project_map).
 *                     Fired in parallel via Promise.all — no UI side effects
 *                     or shared mutable state.
 *
 *   'sequential'    — tools that need to run in order or have UI effects
 *                     (run_command, browser_*, list_connectors,
 *                     connector_query, create_plan).
 *
 *   'confirm-write' — tools that go through the multi-file diff confirm
 *                     modal (write_file, apply_patch, propose_edits). Collected
 *                     into writePromises and awaited together so the user gets
 *                     ONE modal for all writes in a turn.
 */

import { randomUUID } from 'crypto'
import type { Attachment, ToolCall, ToolResult } from '../ai/types'
import { applySearchReplaceBlocks, type FileTools } from '../ai/tools'

// ============================================================================
// Types
// ============================================================================

/** Stable identifier for an in-flight `ai:send` call. */
export type SendId = number

export interface TaggedSender {
  send: (channel: string, payload: { id: SendId; event: unknown }) => void
  exec: (code: string) => Promise<unknown>
}

export interface ConnectorRegistry {
  list: () => Array<{ id: string; label: string; kind: string; status: string; detail?: string }>
  query: (id: string, args: Record<string, unknown>, signal: AbortSignal) => Promise<unknown>
}

/** Context every tool handler receives. */
export interface ToolContext {
  sender: TaggedSender
  sendId: SendId
  signal: AbortSignal
  projectPath: string
  tools: FileTools
  recordWrite: (projectPath: string, filePath: string, before: string, after: string) => void
  recordPlan: (projectPath: string, title: string, steps: Array<{ title: string; detail?: string | null }>) => { id: number }
  recordJournal: (projectPath: string, kind: 'tool' | 'session' | 'note', title: string, detail?: string | null) => void
  connectors: ConnectorRegistry
  /** Mutated by browser_screenshot; flushed by the agent loop into next user msg. */
  pendingAttachments: Attachment[]
  /** Shared maps used by the diff-confirm flow. */
  pendingWrites: Map<string, { sendId: SendId; resolve: (accept: boolean) => void }>
  pendingCommands: Map<string, { sendId: SendId; resolve: (accept: boolean) => void }>
  scopedKey: (sendId: SendId, callId: string) => string
}

export type ToolMode = 'parallel-read' | 'sequential' | 'confirm-write'

export interface ToolHandler {
  mode: ToolMode
  handle(call: ToolCall, ctx: ToolContext): Promise<ToolResult>
}

// ============================================================================
// Activity event helper
// ============================================================================

function emitActivity(ctx: ToolContext, call: ToolCall, status: 'ok' | 'error', label: string, detail: string): void {
  ctx.sender.send('ai:event', {
    id: ctx.sendId,
    event: { type: 'tool-activity', callId: call.id, name: call.name, label, detail, status }
  })
}

/** Short human-readable summary of a tool call for the activity stream. */
export function summarizeToolCall(name: string, args: Record<string, unknown>, result: unknown): { label: string; detail: string } | null {
  if (name === 'read_file') {
    const p = String(args.path ?? '')
    const len = typeof result === 'string' ? result.length : 0
    return { label: 'read_file', detail: `${p} · ${len} символов` }
  }
  if (name === 'list_directory') {
    const p = String(args.path ?? '.')
    const count = Array.isArray(result) ? result.length : 0
    return { label: 'list_directory', detail: `${p} · ${count} элементов` }
  }
  if (name === 'search_project') {
    const q = String(args.query ?? '')
    const r = result as { matches?: unknown[] } | undefined
    const hits = Array.isArray(r?.matches) ? r!.matches!.length : 0
    return { label: 'search_project', detail: `"${q}" · ${hits} совпадений` }
  }
  if (name === 'find_files') {
    const pattern = String(args.pattern ?? '')
    const r = result as { files?: unknown[] } | undefined
    const hits = Array.isArray(r?.files) ? r!.files!.length : 0
    return { label: 'find_files', detail: `${pattern} · ${hits} файлов` }
  }
  if (name === 'list_connectors') {
    const arr = typeof result === 'string' ? JSON.parse(result) as Array<{ label?: string }> : []
    return { label: 'list_connectors', detail: `${arr.length} коннекторов` }
  }
  if (name === 'connector_query') {
    return { label: 'connector_query', detail: `${String(args.id ?? '?')}${args.entity ? ` · ${args.entity}` : ''}` }
  }
  if (name === 'browser_navigate') {
    return { label: 'browser_navigate', detail: String(args.url ?? '') }
  }
  if (name === 'browser_read_page') {
    return { label: 'browser_read_page', detail: args.selector ? String(args.selector) : '(вся страница)' }
  }
  if (name === 'browser_screenshot') {
    return { label: 'browser_screenshot', detail: '' }
  }
  if (name === 'get_project_map' || name === 'refresh_project_map') {
    return { label: name, detail: '' }
  }
  return null
}

// ============================================================================
// Default handler for read-only / pure-info tools
// ============================================================================

const readHandler: ToolHandler = {
  mode: 'parallel-read',
  async handle(call, ctx) {
    try {
      const result = await ctx.tools.execute(call.name, call.args)
      const s = summarizeToolCall(call.name, call.args, result)
      if (s) emitActivity(ctx, call, 'ok', s.label, s.detail)
      return { id: call.id, name: call.name, result }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      emitActivity(ctx, call, 'error', call.name, msg)
      return { id: call.id, name: call.name, result: '', error: msg }
    }
  }
}

// ============================================================================
// File ops: write_file, apply_patch, propose_edits
// ============================================================================

async function diffConfirmWrite(call: ToolCall, ctx: ToolContext, path: string, before: string, after: string): Promise<ToolResult> {
  ctx.sender.send('ai:event', { id: ctx.sendId, event: { type: 'pending-write', callId: call.id, path, before, after } })
  const accepted = await new Promise<boolean>(resolve => {
    ctx.pendingWrites.set(ctx.scopedKey(ctx.sendId, call.id), { sendId: ctx.sendId, resolve })
  })
  if (!accepted) {
    return { id: call.id, name: call.name, result: `User rejected write to ${path}`, error: 'User rejected' }
  }
  try {
    await ctx.tools.execute('write_file', { path, content: after })
    try { ctx.recordWrite(ctx.projectPath, path, before, after) } catch { /* undo not critical */ }
    return { id: call.id, name: call.name, result: `Applied ${call.name === 'apply_patch' ? 'patch' : 'write'} to ${path}` }
  } catch (err) {
    return { id: call.id, name: call.name, result: '', error: err instanceof Error ? err.message : String(err) }
  }
}

async function readBeforeContent(ctx: ToolContext, path: string): Promise<string> {
  try {
    let before = await ctx.tools.execute('read_file', { path }) as string
    // Strip the secret-scanner header line from read_file output before
    // computing the patch — it isn't actually in the file.
    if (before.startsWith('[secret-scanner: redacted')) {
      const nl = before.indexOf('\n')
      if (nl >= 0) before = before.slice(nl + 1)
    }
    return before
  } catch { return '' }
}

const writeFileHandler: ToolHandler = {
  mode: 'confirm-write',
  async handle(call, ctx) {
    const path = String(call.args.path)
    const before = await readBeforeContent(ctx, path)
    const after = String(call.args.content ?? '')
    return diffConfirmWrite(call, ctx, path, before, after)
  }
}

const applyPatchHandler: ToolHandler = {
  mode: 'confirm-write',
  async handle(call, ctx) {
    const path = String(call.args.path)
    const before = await readBeforeContent(ctx, path)
    let after: string
    try {
      after = applySearchReplaceBlocks(before, String(call.args.diff ?? ''))
    } catch (err) {
      return { id: call.id, name: call.name, result: '', error: err instanceof Error ? err.message : String(err) }
    }
    return diffConfirmWrite(call, ctx, path, before, after)
  }
}

interface ProposeEdit { path: string; content: string; reason?: string }

const proposeEditsHandler: ToolHandler = {
  mode: 'confirm-write',
  async handle(call, ctx) {
    const rawEdits = Array.isArray(call.args.edits) ? call.args.edits : []
    const edits: ProposeEdit[] = rawEdits
      .filter((e: unknown): e is Record<string, unknown> => typeof e === 'object' && e !== null)
      .map((e) => ({
        path: String((e as Record<string, unknown>).path ?? ''),
        content: String((e as Record<string, unknown>).content ?? ''),
        reason: (e as Record<string, unknown>).reason != null ? String((e as Record<string, unknown>).reason) : undefined
      }))
      .filter(e => e.path.length > 0)
    if (edits.length === 0) {
      return { id: call.id, name: call.name, result: '', error: 'propose_edits: no edits in batch' }
    }
    // Fan out: one synthetic confirm-write per edit. They all hit the same
    // multi-file modal (renderer accumulates pending writes).
    const subResults: ToolResult[] = []
    for (const edit of edits) {
      const subId = `${call.id}::${randomUUID()}`
      const before = await readBeforeContent(ctx, edit.path)
      const subCall: ToolCall = {
        id: subId,
        name: 'write_file',
        args: { path: edit.path, content: edit.content },
        ...(call.thoughtSignature ? { thoughtSignature: call.thoughtSignature } : {})
      }
      const r = await diffConfirmWrite(subCall, ctx, edit.path, before, edit.content)
      subResults.push(r)
    }
    const ok = subResults.filter(r => !r.error).length
    const total = subResults.length
    return {
      id: call.id,
      name: call.name,
      result: `Applied ${ok}/${total} edits. ${subResults.map(r => r.error ? `✗ ${r.error}` : `✓ ${r.result}`).join('; ')}`,
      ...(ok === 0 ? { error: 'All edits rejected or failed' } : {})
    }
  }
}

// ============================================================================
// Command: run_command
// ============================================================================

const runCommandHandler: ToolHandler = {
  mode: 'sequential',
  async handle(call, ctx) {
    const command = String(call.args.command ?? '')
    const verdict = ctx.tools.classifyCommand(command)
    if (!verdict.allowed) {
      ctx.sender.send('ai:event', {
        id: ctx.sendId,
        event: { type: 'tool-blocked', callId: call.id, name: 'run_command', command, reason: verdict.reason ?? 'denylist' }
      })
      return {
        id: call.id, name: call.name,
        result: `Command: ${command}`,
        error: `Blocked by safety policy: ${verdict.reason ?? 'denylist'}`
      }
    }
    ctx.sender.send('ai:event', { id: ctx.sendId, event: { type: 'pending-command', callId: call.id, command } })
    const accepted = await new Promise<boolean>(resolve => {
      ctx.pendingCommands.set(ctx.scopedKey(ctx.sendId, call.id), { sendId: ctx.sendId, resolve })
    })
    if (!accepted) {
      ctx.sender.send('ai:event', { id: ctx.sendId, event: { type: 'command-result', callId: call.id, command, status: 'rejected' } })
      return { id: call.id, name: call.name, result: `Command: ${command}`, error: 'User rejected' }
    }
    try {
      const result = await ctx.tools.runCommand(command)
      ctx.sender.send('ai:event', {
        id: ctx.sendId,
        event: { type: 'command-result', callId: call.id, command, status: 'ok', exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr }
      })
      return { id: call.id, name: call.name, result }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      ctx.sender.send('ai:event', {
        id: ctx.sendId,
        event: { type: 'command-result', callId: call.id, command, status: 'error', error: msg }
      })
      return { id: call.id, name: call.name, result: '', error: msg }
    }
  }
}

// ============================================================================
// Browser: navigate / read_page / screenshot
// ============================================================================

async function dispatchBrowser(call: ToolCall, ctx: ToolContext): Promise<ToolResult> {
  try {
    // Args are JSON-stringified once and embedded via JSON.stringify(JSON.stringify(...))
    // so the runtime JSON.parse is the only thing that touches LLM-supplied data.
    const argsLiteral = JSON.stringify(JSON.stringify(call.args ?? {}))
    let action: string
    if (call.name === 'browser_navigate') {
      action = `return await api.navigate(String(a.url ?? ''));`
    } else if (call.name === 'browser_read_page') {
      action = `const text = await api.readPage(a.selector ? String(a.selector) : undefined);
                return { url: api.getURL(), title: api.getTitle(), text };`
    } else {
      action = `const dataUrl = await api.screenshot();
                return { url: api.getURL(), dataUrl };`
    }
    const snippet = `(async () => {
      const api = window.geminigrokBrowser;
      if (!api) return { __err: 'Вкладка Browser не открыта — попроси пользователя открыть её' };
      const a = JSON.parse(${argsLiteral});
      ${action}
    })()`
    const result = await ctx.sender.exec(snippet)
    if (result && typeof result === 'object' && '__err' in result) {
      return { id: call.id, name: call.name, result: '', error: String((result as { __err: unknown }).__err) }
    }
    return { id: call.id, name: call.name, result: result ?? '' }
  } catch (err) {
    return { id: call.id, name: call.name, result: '', error: err instanceof Error ? err.message : String(err) }
  }
}

const browserHandler: ToolHandler = {
  mode: 'sequential',
  async handle(call, ctx) {
    const result = await dispatchBrowser(call, ctx)
    // Journal what AI looked at on the web
    try {
      if (!result.error) {
        const url = String(call.args.url ?? '')
        const label = call.name === 'browser_navigate' ? `Браузер → ${url}`
                    : call.name === 'browser_read_page' ? `Браузер: прочитан текст`
                    : `Браузер: скриншот`
        ctx.recordJournal(ctx.projectPath, 'tool', label, null)
      }
    } catch { /* journal not critical */ }
    // Screenshot → queue as attachment for next user message
    if (call.name === 'browser_screenshot' && !result.error) {
      const r = result.result as { dataUrl?: string; url?: string } | string
      const dataUrl = typeof r === 'object' && r ? r.dataUrl : undefined
      if (dataUrl && dataUrl.startsWith('data:image/')) {
        const m = /^data:(image\/[\w+-]+);base64,(.+)$/.exec(dataUrl)
        if (m) {
          ctx.pendingAttachments.push({
            name: `screenshot-${Date.now()}.png`,
            mimeType: m[1],
            data: m[2],
            size: Math.floor(m[2].length * 0.75)
          })
          result.result = { url: typeof r === 'object' ? r.url : null, attached: true }
        }
      }
    }
    const s = summarizeToolCall(call.name, call.args, undefined)
    if (s) emitActivity(ctx, call, result.error ? 'error' : 'ok', s.label, s.detail)
    return result
  }
}

// ============================================================================
// Connectors: list_connectors, connector_query
// ============================================================================

const listConnectorsHandler: ToolHandler = {
  mode: 'sequential',
  async handle(call, ctx) {
    const list = ctx.connectors.list()
    const result = JSON.stringify(list)
    const s = summarizeToolCall(call.name, call.args, result)
    if (s) emitActivity(ctx, call, 'ok', s.label, s.detail)
    return { id: call.id, name: call.name, result }
  }
}

const connectorQueryHandler: ToolHandler = {
  mode: 'sequential',
  async handle(call, ctx) {
    try {
      const cid = String(call.args.id ?? '')
      if (!cid) {
        return { id: call.id, name: call.name, result: '', error: 'connector_query: id обязателен' }
      }
      const { id: _omit, ...rest } = call.args as Record<string, unknown> & { id?: unknown }
      void _omit
      const result = await ctx.connectors.query(cid, rest, ctx.signal)
      const s = summarizeToolCall(call.name, call.args, undefined)
      if (s) emitActivity(ctx, call, 'ok', s.label, s.detail)
      // Journal connector queries
      try {
        const entity = call.args.entity ? ` · ${call.args.entity}` : ''
        const path = call.args.path ? ` · ${call.args.path}` : ''
        ctx.recordJournal(ctx.projectPath, 'tool', `Коннектор ${cid}${entity}${path}`, null)
      } catch { /* journal not critical */ }
      return { id: call.id, name: call.name, result: typeof result === 'string' ? result : JSON.stringify(result) }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      emitActivity(ctx, call, 'error', call.name, msg)
      try { ctx.recordJournal(ctx.projectPath, 'tool', `Коннектор упал: ${String(call.args.id ?? '?')}`, msg) } catch { /* journal not critical */ }
      return { id: call.id, name: call.name, result: '', error: msg }
    }
  }
}

// ============================================================================
// Plans: create_plan
// ============================================================================

const createPlanHandler: ToolHandler = {
  mode: 'sequential',
  async handle(call, ctx) {
    try {
      const title = String(call.args.title ?? 'План без названия')
      const rawSteps = Array.isArray(call.args.steps) ? call.args.steps : []
      const steps = rawSteps
        .filter((s: unknown): s is Record<string, unknown> => typeof s === 'object' && s !== null)
        .map((s) => ({
          title: String((s as Record<string, unknown>).title ?? ''),
          detail: (s as Record<string, unknown>).detail != null
            ? String((s as Record<string, unknown>).detail)
            : null
        }))
        .filter(s => s.title.length > 0)
      if (steps.length === 0) {
        return { id: call.id, name: call.name, result: '', error: 'create_plan: пустой список шагов' }
      }
      const plan = ctx.recordPlan(ctx.projectPath, title, steps)
      try { ctx.recordJournal(ctx.projectPath, 'note', `План: ${title}`, `${steps.length} шагов`) } catch { /* journal not critical */ }
      ctx.sender.send('ai:event', { id: ctx.sendId, event: { type: 'plan-created', planId: plan.id, title, stepCount: steps.length } })
      return { id: call.id, name: call.name, result: `Plan #${plan.id} created with ${steps.length} steps. User will execute/confirm in the Plan view.` }
    } catch (err) {
      return { id: call.id, name: call.name, result: '', error: err instanceof Error ? err.message : String(err) }
    }
  }
}

// ============================================================================
// Registry — single source of truth for tool dispatch
// ============================================================================

const HANDLER_REGISTRY: Record<string, ToolHandler> = {
  // Confirm-write — go through the diff modal
  'write_file': writeFileHandler,
  'apply_patch': applyPatchHandler,
  'propose_edits': proposeEditsHandler,
  // Sequential, side-effecting
  'run_command': runCommandHandler,
  'browser_navigate': browserHandler,
  'browser_read_page': browserHandler,
  'browser_screenshot': browserHandler,
  'list_connectors': listConnectorsHandler,
  'connector_query': connectorQueryHandler,
  'create_plan': createPlanHandler
}

/**
 * Look up the handler for a tool call. Falls back to the generic parallel-read
 * handler (which calls into ctx.tools.execute) for anything not explicitly
 * registered — that's the safe default for new pure-info tools.
 */
export function lookupHandler(name: string): ToolHandler {
  return HANDLER_REGISTRY[name] ?? readHandler
}
