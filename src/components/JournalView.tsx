import { useEffect, useState } from 'react'
import { useProject } from '../store/projectStore'
import type { JournalEntry } from '../types/api'

const KIND_LABEL: Record<JournalEntry['kind'], string> = {
  manual: 'Заметка',
  session: 'Сессия',
  tool: 'Действие',
  note: 'Заметка'
}

const KIND_COLOR: Record<JournalEntry['kind'], string> = {
  manual: 'var(--accent)',
  session: 'var(--success)',
  tool: 'var(--warning)',
  note: 'var(--text-tertiary)'
}

type KindFilter = 'all' | JournalEntry['kind']

export function JournalView() {
  const { path } = useProject()
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [draft, setDraft] = useState('')
  const [draftDetail, setDraftDetail] = useState('')
  const [filter, setFilter] = useState<KindFilter>('all')
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDetail, setEditDetail] = useState('')

  async function refresh() {
    if (!path) return
    const list = await window.api.journal.list(path, 200)
    setEntries(list)
  }

  const visible = entries.filter(e => {
    if (filter !== 'all' && e.kind !== filter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      if (!e.title.toLowerCase().includes(q) && !(e.detail ?? '').toLowerCase().includes(q)) return false
    }
    return true
  })

  const counts: Record<KindFilter, number> = { all: entries.length, manual: 0, session: 0, tool: 0, note: 0 }
  for (const e of entries) counts[e.kind]++

  useEffect(() => { void refresh() }, [path])

  if (!path) {
    return (
      <div className="gg-panel">
        <div className="gg-panel-empty" style={{ marginTop: 80 }}>Открой проект чтобы видеть журнал</div>
      </div>
    )
  }

  async function addNote() {
    const title = draft.trim()
    if (!title) return
    await window.api.journal.append(path!, 'manual', title, draftDetail.trim() || null)
    setDraft('')
    setDraftDetail('')
    await refresh()
  }

  async function remove(id: number) {
    if (editingId === id) cancelEdit()
    await window.api.journal.remove(id)
    await refresh()
  }

  function startEdit(entry: JournalEntry) {
    setEditingId(entry.id)
    setEditTitle(entry.title)
    setEditDetail(entry.detail ?? '')
  }

  function cancelEdit() {
    setEditingId(null)
    setEditTitle('')
    setEditDetail('')
  }

  async function saveEdit() {
    if (editingId == null) return
    const title = editTitle.trim()
    if (!title) return
    const updated = await window.api.journal.updateManual(editingId, title, editDetail.trim() || null)
    if (updated) {
      cancelEdit()
      await refresh()
    }
  }

  return (
    <div className="gg-panel">
      <div className="gg-panel-header">
        <h2 className="gg-panel-title">Журнал разработки</h2>
        <div className="gg-panel-meta">{visible.length} из {entries.length}</div>
      </div>

      <div className="gg-journal-toolbar">
        <div className="gg-journal-filters" role="tablist">
          {(['all', 'session', 'tool', 'manual', 'note'] as KindFilter[]).map(k => (
            <button
              key={k}
              type="button"
              className={`gg-journal-chip ${filter === k ? 'is-active' : ''}`}
              onClick={() => setFilter(k)}
            >
              {k === 'all' ? 'Все' : k === 'session' ? 'Сессии' : k === 'tool' ? 'Действия' : k === 'manual' ? 'Заметки' : 'Прочее'}
              <span className="gg-journal-chip-count">{counts[k]}</span>
            </button>
          ))}
        </div>
        <input
          className="gg-input gg-journal-search"
          placeholder="Поиск…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="gg-panel-body">
        <div className="gg-journal-compose">
          <input
            className="gg-input"
            placeholder="Что произошло? Краткое название"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void addNote() } }}
          />
          <textarea
            className="gg-input gg-journal-detail"
            placeholder="Детали (опционально)"
            value={draftDetail}
            rows={2}
            onChange={e => setDraftDetail(e.target.value)}
          />
          <button className="gg-btn gg-btn-primary" onClick={() => void addNote()} disabled={!draft.trim()}>
            Записать
          </button>
        </div>

        {entries.length === 0 && (
          <div className="gg-panel-empty">
            Журнал пуст. Все действия AI (правки файлов, выполненные команды) автоматически попадают сюда.
            Также можно добавлять заметки руками.
          </div>
        )}

        <div className="gg-journal-list">
          {visible.map(e => (
            <div key={e.id} className={`gg-journal-entry${editingId === e.id ? ' is-editing' : ''}`}>
              <div className="gg-journal-meta">
                <span className="gg-journal-kind" style={{ color: KIND_COLOR[e.kind], borderColor: KIND_COLOR[e.kind] }}>
                  {KIND_LABEL[e.kind]}
                </span>
                <span className="gg-journal-time">{formatTime(e.createdAt)}</span>
                {e.kind === 'manual' && editingId !== e.id && (
                  <button
                    className="gg-journal-edit"
                    onClick={() => startEdit(e)}
                    title="Редактировать"
                    type="button"
                  >
                    ✎
                  </button>
                )}
                <button className="gg-journal-remove" onClick={() => void remove(e.id)} title="Удалить" type="button">×</button>
              </div>
              {editingId === e.id ? (
                <div className="gg-journal-edit-form">
                  <input
                    className="gg-input"
                    value={editTitle}
                    onChange={ev => setEditTitle(ev.target.value)}
                    onKeyDown={ev => {
                      if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); void saveEdit() }
                      if (ev.key === 'Escape') cancelEdit()
                    }}
                    autoFocus
                  />
                  <textarea
                    className="gg-input gg-journal-detail"
                    value={editDetail}
                    rows={2}
                    onChange={ev => setEditDetail(ev.target.value)}
                    onKeyDown={ev => { if (ev.key === 'Escape') cancelEdit() }}
                  />
                  <div className="gg-journal-edit-actions">
                    <button
                      className="gg-btn gg-btn-primary"
                      type="button"
                      onClick={() => void saveEdit()}
                      disabled={!editTitle.trim()}
                    >
                      Сохранить
                    </button>
                    <button className="gg-btn gg-btn-ghost" type="button" onClick={cancelEdit}>
                      Отмена
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="gg-journal-title">{e.title}</div>
                  {e.detail && <div className="gg-journal-detail-text">{e.detail}</div>}
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}