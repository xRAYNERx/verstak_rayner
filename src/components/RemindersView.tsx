import { useEffect, useMemo, useState } from 'react'
import { useProject } from '../store/projectStore'
import type { ProjectTaskPriority, ProjectTaskStatus, Task } from '../types/api'

type TaskFilter = 'active' | 'today' | 'overdue' | 'done' | 'all'

const STATUS_OPTIONS: Array<{ id: ProjectTaskStatus; label: string }> = [
  { id: 'new', label: 'Новая' },
  { id: 'in_progress', label: 'В работе' },
  { id: 'review', label: 'На проверке' },
  { id: 'paused', label: 'Ждёт' },
  { id: 'done', label: 'Готово' },
  { id: 'cancelled', label: 'Отменена' }
]

const PRIORITY_OPTIONS: Array<{ id: ProjectTaskPriority; label: string }> = [
  { id: 'low', label: 'Низкий' },
  { id: 'normal', label: 'Обычный' },
  { id: 'high', label: 'Высокий' },
  { id: 'urgent', label: 'Срочный' }
]

const FILTERS: Array<{ id: TaskFilter; label: string }> = [
  { id: 'active', label: 'Активные' },
  { id: 'today', label: 'Сегодня' },
  { id: 'overdue', label: 'Просроченные' },
  { id: 'done', label: 'Готовые' },
  { id: 'all', label: 'Все' }
]

function toLocalInputValue(ts: number | null): string {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromLocalInputValue(value: string): number | null {
  if (!value) return null
  const ts = new Date(value).getTime()
  return Number.isFinite(ts) ? ts : null
}

function formatDateTime(ts: number | null): string {
  if (!ts) return 'Без срока'
  return new Date(ts).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function isSameDay(ts: number | null, base = Date.now()): boolean {
  if (!ts) return false
  const a = new Date(ts)
  const b = new Date(base)
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function statusLabel(status: ProjectTaskStatus): string {
  return STATUS_OPTIONS.find(option => option.id === status)?.label ?? status
}

function priorityLabel(priority: ProjectTaskPriority): string {
  return PRIORITY_OPTIONS.find(option => option.id === priority)?.label ?? priority
}

function sourceLabel(task: Task): string {
  if (task.source === 'bitrix24') return 'Битрикс24'
  if (task.source === 'jira') return 'Jira'
  if (task.source === 'external') return 'Внешний источник'
  return 'Verstak'
}

function isTaskDone(task: Task): boolean {
  return task.status === 'done' || task.status === 'cancelled' || task.done
}

function isTaskOverdue(task: Task): boolean {
  return Boolean(task.deadlineAt && task.deadlineAt < Date.now() && !isTaskDone(task))
}

function taskTitleFromText(text: string): string {
  const clean = text.trim().replace(/\s+/g, ' ')
  if (clean.length <= 80) return clean
  return `${clean.slice(0, 77).trim()}...`
}

function sortTasks(a: Task, b: Task): number {
  const doneDelta = Number(isTaskDone(a)) - Number(isTaskDone(b))
  if (doneDelta !== 0) return doneDelta
  const priorityRank: Record<ProjectTaskPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 }
  const priorityDelta = priorityRank[a.priority] - priorityRank[b.priority]
  if (priorityDelta !== 0) return priorityDelta
  const aDue = a.deadlineAt ?? Number.MAX_SAFE_INTEGER
  const bDue = b.deadlineAt ?? Number.MAX_SAFE_INTEGER
  if (aDue !== bDue) return aDue - bDue
  return b.updatedAt - a.updatedAt
}

export function RemindersView() {
  const { path } = useProject()
  const [tasks, setTasks] = useState<Task[]>([])
  const [filter, setFilter] = useState<TaskFilter>('active')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<ProjectTaskPriority>('normal')
  const [deadline, setDeadline] = useState('')
  const [query, setQuery] = useState('')
  const [isComposerOpen, setIsComposerOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function refresh() {
    if (!path) return
    try {
      setError(null)
      const nextTasks = await window.api.tasks.list(path)
      setTasks(nextTasks)
      setSelectedId(prev => (prev && nextTasks.some(t => t.id === prev)) ? prev : nextTasks.sort(sortTasks)[0]?.id ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  useEffect(() => { void refresh() }, [path])

  const selectedTask = useMemo(
    () => tasks.find(task => task.id === selectedId) ?? null,
    [tasks, selectedId]
  )

  const stats = useMemo(() => {
    const active = tasks.filter(task => !isTaskDone(task)).length
    const today = tasks.filter(task => isSameDay(task.deadlineAt) && !isTaskDone(task)).length
    const overdue = tasks.filter(isTaskOverdue).length
    const done = tasks.filter(isTaskDone).length
    return { active, today, overdue, done, all: tasks.length }
  }, [tasks])

  const visibleTasks = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase()
    return tasks
      .filter(task => {
        if (filter === 'active') return !isTaskDone(task)
        if (filter === 'today') return isSameDay(task.deadlineAt) && !isTaskDone(task)
        if (filter === 'overdue') return isTaskOverdue(task)
        if (filter === 'done') return isTaskDone(task)
        return true
      })
      .filter(task => {
        if (!cleanQuery) return true
        return `${task.title} ${task.description ?? ''} ${statusLabel(task.status)} ${priorityLabel(task.priority)}`
          .toLowerCase()
          .includes(cleanQuery)
      })
      .sort(sortTasks)
  }, [tasks, filter, query])

  if (!path) {
    return (
      <div className="gg-panel">
        <div className="gg-panel-empty" style={{ marginTop: 80 }}>Открой проект, чтобы управлять задачами</div>
      </div>
    )
  }

  async function createTask() {
    const cleanTitle = title.trim()
    if (!cleanTitle) {
      setError('Введите название задачи')
      return
    }
    try {
      setError(null)
      setNotice(null)
      const created = await window.api.tasks.create({
        projectPath: path!,
        title: cleanTitle,
        description: description.trim() || null,
        priority,
        deadlineAt: fromLocalInputValue(deadline)
      })
      setTitle('')
      setDescription('')
      setPriority('normal')
      setDeadline('')
      setIsComposerOpen(false)
      setNotice('Задача создана')
      await refresh()
      setSelectedId(created.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function updateTask(id: number, patch: Partial<Pick<Task, 'title' | 'description' | 'status' | 'priority' | 'deadlineAt'>>) {
    try {
      setError(null)
      setNotice(null)
      await window.api.tasks.update(id, patch)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function removeTask(id: number) {
    try {
      setError(null)
      setNotice('Задача убрана')
      await window.api.tasks.softDelete(id)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="gg-panel gg-project-tasks-panel">
      <div className="gg-project-tasks-shell">
        <header className="gg-project-tasks-hero">
          <div>
            <div className="gg-panel-kicker">Управление проектом</div>
            <h2 className="gg-panel-title">Задачи</h2>
            <p>Рабочий список проекта: что нужно сделать, что ждёт проверки и что уже закрыто</p>
          </div>
          <div className="gg-project-tasks-statline" aria-label="Сводка задач">
            <span><b>{stats.active}</b> активных</span>
            <span><b>{stats.today}</b> сегодня</span>
            <span className={stats.overdue > 0 ? 'is-alert' : ''}><b>{stats.overdue}</b> просроченных</span>
          </div>
        </header>

        <section className="gg-project-tasks-command" aria-label="Быстрое создание задачи">
          <div className="gg-project-task-quick-input">
            <input
              className="gg-input"
              placeholder="Что нужно сделать?"
              value={title}
              onFocus={() => setIsComposerOpen(true)}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey && !isComposerOpen) void createTask()
              }}
            />
            <button className="gg-btn gg-btn-primary" type="button" onClick={() => void createTask()} disabled={!title.trim()}>
              Создать
            </button>
          </div>
          {isComposerOpen && (
            <div className="gg-project-task-compose" aria-label="Детали новой задачи">
              <textarea
                className="gg-input gg-project-task-description-input"
                placeholder="Описание, ссылки, критерии готовности"
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={3}
              />
              <div className="gg-project-task-compose-controls">
                <select className="gg-input" value={priority} onChange={e => setPriority(e.target.value as ProjectTaskPriority)}>
                  {PRIORITY_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                </select>
                <input className="gg-input" type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)} />
                <button className="gg-btn gg-btn-ghost" type="button" onClick={() => {
                  setIsComposerOpen(false)
                  setDescription('')
                  setDeadline('')
                  setPriority('normal')
                }}>
                  Свернуть
                </button>
              </div>
            </div>
          )}
          {(error || notice) && (
            <div className={`gg-project-task-message ${error ? 'is-error' : 'is-ok'}`}>
              {error ?? notice}
            </div>
          )}
        </section>

        <div className="gg-project-tasks-tools">
          <div className="gg-project-tasks-filters" role="tablist" aria-label="Фильтр задач">
            {FILTERS.map(item => (
              <button
                key={item.id}
                type="button"
                className={`gg-project-tasks-filter ${filter === item.id ? 'is-active' : ''}`}
                onClick={() => setFilter(item.id)}
              >
                <span>{item.label}</span>
                <b>{stats[item.id]}</b>
              </button>
            ))}
          </div>
          <div className="gg-project-tasks-search">
            <input
              className="gg-input"
              placeholder="Поиск по задачам"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
            <button className="gg-btn gg-btn-ghost" type="button" onClick={() => void refresh()}>Обновить</button>
          </div>
        </div>

        <div className="gg-project-tasks-layout">
          <section className="gg-project-task-list" aria-label="Список задач">
            {visibleTasks.length === 0 ? (
              <div className="gg-project-task-empty">
                <strong>Здесь пока пусто</strong>
                <span>Создай задачу вручную или добавь её из сообщения чата</span>
              </div>
            ) : visibleTasks.map(task => (
              <button
                key={task.id}
                type="button"
                className={`gg-project-task-card ${selectedId === task.id ? 'is-active' : ''} ${isTaskDone(task) ? 'is-done' : ''} ${isTaskOverdue(task) ? 'is-overdue' : ''}`}
                onClick={() => setSelectedId(task.id)}
              >
                <span className="gg-project-task-card-main">
                  <span className={`gg-project-task-status-dot is-${task.status}`} aria-hidden />
                  <span>
                    <span className="gg-project-task-card-title">{task.title}</span>
                    {task.description && <span className="gg-project-task-card-desc">{task.description}</span>}
                  </span>
                </span>
                <span className="gg-project-task-card-meta">
                  <span>{statusLabel(task.status)}</span>
                  <span>{priorityLabel(task.priority)}</span>
                  <span className={isTaskOverdue(task) ? 'is-alert' : ''}>{formatDateTime(task.deadlineAt)}</span>
                </span>
              </button>
            ))}
          </section>

          <section className="gg-project-task-detail" aria-label="Детали задачи">
            {selectedTask ? (
              <>
                <div className="gg-project-task-detail-head">
                  <div>
                    <div className="gg-project-task-detail-kicker">Задача</div>
                    <input
                      className="gg-input gg-project-task-title-input"
                      value={selectedTask.title}
                      onChange={e => setTasks(prev => prev.map(task => task.id === selectedTask.id ? { ...task, title: e.target.value, text: e.target.value } : task))}
                      onBlur={e => void updateTask(selectedTask.id, { title: e.currentTarget.value })}
                    />
                  </div>
                  <div className="gg-project-task-detail-actions">
                    {!isTaskDone(selectedTask) && selectedTask.status !== 'in_progress' && (
                      <button className="gg-btn gg-btn-ghost" type="button" onClick={() => void updateTask(selectedTask.id, { status: 'in_progress' })}>В работу</button>
                    )}
                    {!isTaskDone(selectedTask) && (
                      <button className="gg-btn gg-btn-primary" type="button" onClick={() => void updateTask(selectedTask.id, { status: 'done' })}>Готово</button>
                    )}
                    {isTaskDone(selectedTask) && (
                      <button className="gg-btn gg-btn-ghost" type="button" onClick={() => void updateTask(selectedTask.id, { status: 'new' })}>Вернуть</button>
                    )}
                  </div>
                </div>

                <textarea
                  className="gg-input gg-project-task-detail-description"
                  value={selectedTask.description ?? ''}
                  placeholder="Описание задачи"
                  rows={6}
                  onChange={e => setTasks(prev => prev.map(task => task.id === selectedTask.id ? { ...task, description: e.target.value } : task))}
                  onBlur={e => void updateTask(selectedTask.id, { description: e.currentTarget.value })}
                />

                <div className="gg-project-task-detail-grid">
                  <label>
                    <span>Статус</span>
                    <select className="gg-input" value={selectedTask.status} onChange={e => void updateTask(selectedTask.id, { status: e.target.value as ProjectTaskStatus })}>
                      {STATUS_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>Приоритет</span>
                    <select className="gg-input" value={selectedTask.priority} onChange={e => void updateTask(selectedTask.id, { priority: e.target.value as ProjectTaskPriority })}>
                      {PRIORITY_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>Срок</span>
                    <input
                      className="gg-input"
                      type="datetime-local"
                      value={toLocalInputValue(selectedTask.deadlineAt)}
                      onChange={e => void updateTask(selectedTask.id, { deadlineAt: fromLocalInputValue(e.target.value) })}
                    />
                  </label>
                  <label>
                    <span>Источник</span>
                    <div className="gg-project-task-readonly">{sourceLabel(selectedTask)}</div>
                  </label>
                </div>

                <div className="gg-project-task-footer">
                  <div className="gg-project-task-sync-note">
                    <span className="gg-project-task-sync-dot" />
                    <span>Локальная задача. Интеграции с задачниками подключим позже</span>
                  </div>
                  <button className="gg-btn gg-btn-ghost" type="button" onClick={() => void removeTask(selectedTask.id)}>Удалить</button>
                </div>
              </>
            ) : (
              <div className="gg-project-task-empty">
                <strong>Выбери задачу</strong>
                <span>Детали появятся здесь</span>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

export function buildTaskTitleFromChatText(text: string): string {
  return taskTitleFromText(text)
}
