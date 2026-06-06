import { useEffect, useMemo, useState } from 'react'
import { useProject } from '../store/projectStore'
import type { AuditEntry } from '../types/api'

/**
 * Agent Run Inspector — flagship transparency screen.
 *
 * Makes the agent's behavior VISIBLE: groups raw audit entries into "runs"
 * and shows, per run, the ordered sequence of what the agent did (tool calls,
 * file writes, commands, errors, provider switches, memory saves) with timing.
 *
 * Data source: window.api.audit (query/export). No new IPC — read-only over
 * the existing audit log.
 */

// Gap (ms) between consecutive entries above which we start a new run.
const RUN_GAP_MS = 2 * 60 * 1000

const ACTION_ICON: Record<string, string> = {
  tool_call: '🔧',
  tool_result: '📤',
  write_file: '✏️',
  run_command: '▶️',
  error: '⚠️',
  provider_switch: '🔀',
  memory_save: '🧠',
  session_start: '▪️',
  session_end: '▪️'
}

const ACTION_LABEL: Record<string, string> = {
  tool_call: 'вызов инструмента',
  tool_result: 'результат',
  write_file: 'правка файла',
  run_command: 'команда',
  error: 'ошибка',
  provider_switch: 'смена провайдера',
  memory_save: 'память',
  session_start: 'старт сессии',
  session_end: 'конец сессии'
}

interface Run {
  key: string
  entries: AuditEntry[]
  start: number
  end: number
  providerId: string | null
  model: string | null
}

// Собрать Run из набора записей (общий хвост для обеих веток группировки).
function buildRun(entries: AuditEntry[], key: string): Run {
  const first = entries[0]
  const last = entries[entries.length - 1]
  // Provider/model: take the last non-null seen in the run (reflects the
  // provider actually doing the work after any switch).
  let providerId: string | null = first.providerId
  let model: string | null = first.model
  for (const e of entries) {
    if (e.providerId) providerId = e.providerId
    if (e.model) model = e.model
  }
  return {
    key,
    entries,
    start: first.timestamp,
    end: last.timestamp,
    providerId,
    model
  }
}

/**
 * Group entries into runs. Записи начиная с миграции 9 несут явный runId —
 * по нему и группируем (одна карточка = один runId). Легаси-строки без runId
 * группируются прежней эвристикой: сортировка по времени, разрыв при gap >
 * RUN_GAP_MS, смене chatId или маркере session_start.
 */
function groupRuns(entries: AuditEntry[]): Run[] {
  const withRunId = entries.filter(e => e.runId)
  const legacy = entries.filter(e => !e.runId)

  const runs: Run[] = []

  // Ветка с явным runId — группируем по нему, внутри run'а сортируем по времени.
  const byRunId = new Map<string, AuditEntry[]>()
  for (const e of withRunId) {
    const list = byRunId.get(e.runId!) ?? []
    list.push(e)
    byRunId.set(e.runId!, list)
  }
  for (const [rid, list] of byRunId) {
    const sorted = [...list].sort((a, b) => a.timestamp - b.timestamp)
    runs.push(buildRun(sorted, `run-${rid}`))
  }

  // Легаси-ветка — прежняя эвристика для строк до миграции 9.
  const sorted = [...legacy].sort((a, b) => a.timestamp - b.timestamp)
  let current: AuditEntry[] = []
  const flush = () => {
    if (current.length === 0) return
    const first = current[0]
    const last = current[current.length - 1]
    runs.push(buildRun(current, `${first.id}-${last.id}`))
    current = []
  }
  for (const e of sorted) {
    if (current.length > 0) {
      const prev = current[current.length - 1]
      const gap = e.timestamp - prev.timestamp
      const chatChanged = e.chatId !== prev.chatId
      if (gap > RUN_GAP_MS || chatChanged || e.action === 'session_start') {
        flush()
      }
    }
    current.push(e)
  }
  flush()

  // Newest run first — сортируем все run'ы (обе ветки) по времени старта.
  return runs.sort((a, b) => b.start - a.start)
}

function summarize(entries: AuditEntry[]): string {
  const counts: Record<string, number> = {}
  for (const e of entries) counts[e.action] = (counts[e.action] ?? 0) + 1
  const parts: string[] = []
  if (counts.write_file) parts.push(`${counts.write_file} ${plural(counts.write_file, 'правка', 'правки', 'правок')}`)
  if (counts.run_command) parts.push(`${counts.run_command} ${plural(counts.run_command, 'команда', 'команды', 'команд')}`)
  if (counts.tool_call) parts.push(`${counts.tool_call} ${plural(counts.tool_call, 'вызов', 'вызова', 'вызовов')}`)
  if (counts.provider_switch) parts.push(`${counts.provider_switch} ${plural(counts.provider_switch, 'переключение', 'переключения', 'переключений')}`)
  if (counts.memory_save) parts.push(`${counts.memory_save} в память`)
  if (counts.error) parts.push(`${counts.error} ${plural(counts.error, 'ошибка', 'ошибки', 'ошибок')}`)
  return parts.length ? parts.join(', ') : `${entries.length} событий`
}

// Russian plural picker (1 правка / 2 правки / 5 правок).
function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few
  return many
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function formatClock(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}мс`
  const sec = Math.round(ms / 1000)
  if (sec < 60) return `${sec}с`
  const min = Math.floor(sec / 60)
  const rem = sec % 60
  return `${min}м ${rem}с`
}

// Pretty-print JSON-ish detail; otherwise truncate.
function formatDetail(detail: string): string {
  const trimmed = detail.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2)
    } catch {
      // fall through to raw
    }
  }
  return trimmed
}

function RunCard({ run }: { run: Run }) {
  const [open, setOpen] = useState(false)
  const hasError = run.entries.some(e => e.action === 'error')
  return (
    <div className={`gg-run-card ${hasError ? 'has-error' : ''}`}>
      <button className="gg-run-head" onClick={() => setOpen(v => !v)}>
        <span className="gg-run-caret">{open ? '▾' : '▸'}</span>
        <span className="gg-run-provider">{run.providerId ?? 'неизвестно'}</span>
        {run.model && <span className="gg-run-model">{run.model}</span>}
        <span className="gg-run-time">{formatTime(run.start)}</span>
        <span className="gg-run-summary">{summarize(run.entries)}</span>
        <span className="gg-run-count">{run.entries.length} · {formatDuration(run.end - run.start)}</span>
      </button>
      {open && (
        <div className="gg-run-steps">
          {run.entries.map(e => (
            <div key={e.id} className={`gg-run-step is-${e.action}`}>
              <span className="gg-run-step-icon" aria-hidden>{ACTION_ICON[e.action] ?? '·'}</span>
              <span className="gg-run-step-clock">{formatClock(e.timestamp)}</span>
              <span className="gg-run-step-action">{ACTION_LABEL[e.action] ?? e.action}</span>
              {e.detail && <pre className="gg-run-step-detail">{formatDetail(e.detail)}</pre>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function AgentRunInspector() {
  const { path } = useProject()
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [csv, setCsv] = useState<string | null>(null)

  async function refresh() {
    if (!path) return
    setLoading(true)
    try {
      const list = await window.api.audit.query(path, { limit: 500 })
      setEntries(list)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [path])

  const runs = useMemo(() => groupRuns(entries), [entries])

  if (!path) {
    return (
      <div className="gg-panel">
        <div className="gg-panel-empty" style={{ marginTop: 80 }}>Открой проект чтобы видеть запуски агента</div>
      </div>
    )
  }

  async function exportCsv() {
    const data = await window.api.audit.export(path!)
    setCsv(data)
  }

  async function copyCsv() {
    if (csv) await navigator.clipboard.writeText(csv)
  }

  return (
    <div className="gg-panel">
      <div className="gg-panel-header">
        <h2 className="gg-panel-title">Инспектор запусков</h2>
        <div className="gg-panel-meta">{runs.length} запусков · {entries.length} событий</div>
      </div>

      <div className="gg-inspector-toolbar">
        <button className="gg-btn gg-btn-ghost" onClick={() => void refresh()} disabled={loading}>
          {loading ? 'Загрузка…' : '↻ Обновить'}
        </button>
        <button className="gg-btn gg-btn-ghost" onClick={() => void exportCsv()} disabled={entries.length === 0}>
          Экспорт CSV
        </button>
      </div>

      <div className="gg-panel-body">
        {entries.length === 0 && (
          <div className="gg-panel-empty">
            Пока нет записей о запусках агента — поработай с агентом, и здесь появится прозрачная история.
          </div>
        )}

        <div className="gg-run-list">
          {runs.map(run => <RunCard key={run.key} run={run} />)}
        </div>
      </div>

      {csv !== null && (
        <div className="gg-inspector-csv-overlay" onClick={() => setCsv(null)}>
          <div className="gg-inspector-csv-modal" onClick={e => e.stopPropagation()}>
            <div className="gg-inspector-csv-head">
              <span>CSV — журнал аудита</span>
              <div className="gg-inspector-csv-actions">
                <button className="gg-btn gg-btn-ghost" onClick={() => void copyCsv()}>Скопировать</button>
                <button className="gg-btn gg-btn-ghost" onClick={() => setCsv(null)}>Закрыть</button>
              </div>
            </div>
            <textarea className="gg-input gg-inspector-csv-text" readOnly value={csv} />
          </div>
        </div>
      )}
    </div>
  )
}
