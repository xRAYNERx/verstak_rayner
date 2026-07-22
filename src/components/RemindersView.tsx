import { useEffect, useMemo, useState } from 'react'
import { useProject } from '../store/projectStore'
import type { ProjectTaskPriority, ProjectTaskStatus, Task } from '../types/api'

type TaskFilter = 'all' | 'active' | 'mine' | 'overdue' | 'done'

const STATUS_OPTIONS: Array<{ id: ProjectTaskStatus; label: string }> = [
  { id: 'new', label: 'Новая' },
  { id: 'in_progress', label: 'В работе' },
  { id: 'review', label: 'На проверке' },
  { id: 'done', label: 'Готово' }
]

const PRIORITY_OPTIONS: Array<{ id: ProjectTaskPriority; label: string }> = [
  { id: 'low', label: 'Низкий' },
  { id: 'normal', label: 'Обычный' },
  { id: 'high', label: 'Высокий' },
  { id: 'urgent', label: 'Срочный' }
]

const FILTERS: Array<{ id: TaskFilter; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'active', label: 'Активные' },
  { id: 'mine', label: 'Мои' },
  { id: 'overdue', label: 'Просроченные' },
  { id: 'done', label: 'Готовые' }
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
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
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

export function RemindersView() {
  const { path } = useProject()
  const [tasks, setTasks] = useState<Task[]>([])
  const [filter, setFilter] = useState<TaskFilter>('active')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<ProjectTaskPriority>('normal')
  const [deadline, setDeadline] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function refresh() {
    if (!path) return
    try {
      setError(null)
      const nextTasks = await window.api.tasks.list(path)
      setTasks(nextTasks)
      setSelectedId(prev => (prev && nextTasks.some(t => t.id === prev)) ? prev : nextTasks[0]?.id ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  useEffect(() => { void refresh() }, [path])

  const selectedTask = useMemo(
    () => tasks.find(task => task.id === selectedId) ?? null,
    [tasks, selectedId]
  )

  const visibleTasks = useMemo(() => {
    if (filter === 'active') return tasks.filter(task => !isTaskDone(task))
    if (filter === 'mine') return tasks.filter(task => !task.assigneeId || task.assigneeId === 'local-user')
    if (filter === 'overdue') return tasks.filter(isTaskOverdue)
    if (filter === 'done') return tasks.filter(isTaskDone)
    return tasks
  }, [tasks, filter])

  const activeCount = tasks.filter(task => !isTaskDone(task)).length
  const overdueCount = tasks.filter(isTaskOverdue).length

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
      await window.api.tasks.update(id, patch)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function removeTask(id: number) {
    try {
      setError(null)
      await window.api.tasks.softDelete(id)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="gg-panel gg-project-tasks-panel">
      <div className="gg-panel-header gg-project-tasks-header">
        <div>
          <h2 className="gg-panel-title">Задачи</h2>
          <div className="gg-project-tasks-subtitle">Локальные задачи проекта. Структура готова для будущей синхронизации и внешних задачников</div>
        </div>
        <div className="gg-panel-meta">{activeCount} активных · {overdueCount} просроченных</div>
      </div>

      <div className="gg-project-tasks-toolbar">
        <div className="gg-project-tasks-filters" role="tablist" aria-label="Фильтр задач">
          {FILTERS.map(item => (
            <button
              key={item.id}
              type="button"
              className={`gg-project-tasks-filter ${filter === item.id ? 'is-active' : ''}`}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button className="gg-btn gg-btn-ghost" type="button" onClick={() => void refresh()}>Обновить</button>
      </div>

      <div className="gg-panel-body gg-project-tasks-body">
        <section className="gg-project-task-compose" aria-label="Новая задача">
          <div className="gg-project-task-compose-main">
            <input
              className="gg-input"
              placeholder="Новая задача"
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) void createTask() }}
            />
            <textarea
              className="gg-input gg-project-task-description-input"
              placeholder="Описание, детали, что важно учесть"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
            />
          </div>
          <div className="gg-project-task-compose-controls">
            <select className="gg-input" value={priority} onChange={e => setPriority(e.target.value as ProjectTaskPriority)}>
              {PRIORITY_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
            <input className="gg-input" type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)} />
            <button className="gg-btn gg-btn-primary" type="button" onClick={() => void createTask()} disabled={!title.trim()}>Создать</button>
          </div>
          {error && <div className="gg-reminder-message is-error">{error}</div>}
          {notice && <div className="gg-reminder-message is-ok">{notice}</div>}
        </section>

        <div className="gg-project-tasks-layout">
          <section className="gg-project-task-list" aria-label="Список задач">
            {visibleTasks.length === 0 ? (
              <div className="gg-panel-empty">Задач по этому фильтру нет</div>
            ) : visibleTasks.map(task => (
              <button
                key={task.id}
                type="button"
                className={`gg-project-task-card ${selectedId === task.id ? 'is-active' : ''} ${isTaskDone(task) ? 'is-done' : ''} ${isTaskOverdue(task) ? 'is-overdue' : ''}`}
                onClick={() => setSelectedId(task.id)}
              >
                <span className="gg-project-task-card-head">
                  <span className="gg-project-task-card-title">{task.title}</span>
                  <span className={`gg-project-task-status is-${task.status}`}>{statusLabel(task.status)}</span>
                </span>
                {task.description && <span className="gg-project-task-card-desc">{task.description}</span>}
                <span className="gg-project-task-card-meta">
                  <span>{priorityLabel(task.priority)}</span>
                  <span>{formatDateTime(task.deadlineAt)}</span>
                  <span>{sourceLabel(task)}</span>
                </span>
              </button>
            ))}
          </section>

          <section className="gg-project-task-detail" aria-label="Детали задачи">
            {selectedTask ? (
              <>
                <div className="gg-project-task-detail-head">
                  <div>
                    <div className="gg-project-task-detail-kicker">Открытая задача</div>
                    <input
                      className="gg-input gg-project-task-title-input"
                      value={selectedTask.title}
                      onChange={e => setTasks(prev => prev.map(task => task.id === selectedTask.id ? { ...task, title: e.target.value, text: e.target.value } : task))}
                      onBlur={e => void updateTask(selectedTask.id, { title: e.currentTarget.value })}
                    />
                  </div>
                  <button className="gg-btn gg-btn-ghost" type="button" onClick={() => void removeTask(selectedTask.id)}>Удалить</button>
                </div>

                <textarea
                  className="gg-input gg-project-task-detail-description"
                  value={selectedTask.description ?? ''}
                  placeholder="Описание задачи"
                  rows={5}
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
                    <span>Дедлайн</span>
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

                <div className="gg-project-task-sync-note">
                  <span className="gg-project-task-sync-dot" />
                  <span>Синхронизация: локально. Позже здесь появятся Битрикс24 и другие задачники</span>
                </div>
              </>
            ) : (
              <div className="gg-panel-empty">Выбери задачу слева или создай новую</div>
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
