import { useEffect, useState, useCallback } from 'react'
import { useProject } from '../store/projectStore'
import type { DevTaskState, GitDiffStatEntry } from '../types/api'

/**
 * Вкладка «Задача» (Dev Task Flow, Фаза 2) — read-only состояние активной
 * dev_task + откат одной кнопкой.
 *
 * Шапка: заголовок + state-бейдж + ветка (work_branch || 'in-place') + risk.
 * Тело: секция «Изменения» — список изменённых файлов из window.api.git.diff
 * (статус, +added/-removed), клик → reveal в проводнике. Кнопка «↩ Откатить
 * задачу» (devtask:revert, с confirm) и «Обновить».
 *
 * Фаза 2 — только наблюдение + revert. git-write / commit / пакет — Фазы 3-5.
 */

const STATE_LABEL: Record<DevTaskState, string> = {
  draft: 'черновик',
  branching: 'ветвление',
  in_progress: 'в работе',
  review_ready: 'к ревью',
  paused: 'пауза',
  packaged: 'упакована',
  committed: 'закоммичена',
  cancelled: 'отменена'
}

function statusGlyph(status: string): string {
  // git status из numstat у нас 'modified' | 'binary'; для наглядности
  // показываем буквенный маркер.
  if (status === 'binary') return 'B'
  if (status === 'added') return 'A'
  if (status === 'deleted') return 'D'
  return 'M'
}

export function DevTaskPanel() {
  const path = useProject(s => s.path)
  const devTask = useProject(s => s.devTask)
  const activeDevTaskId = useProject(s => s.activeDevTaskId)
  const refreshDevTask = useProject(s => s.refreshDevTask)
  const closeDevTask = useProject(s => s.closeDevTask)
  const [diff, setDiff] = useState<GitDiffStatEntry[]>([])
  const [loading, setLoading] = useState(false)

  const loadDiff = useCallback(async () => {
    setLoading(true)
    try {
      const d = await window.api.git.diff()
      setDiff(d.stat)
    } catch { /* не git-репозиторий / IPC недоступен — пустой список */ }
    setLoading(false)
  }, [])

  // refresh = снимок задачи (state мог обновиться) + git diff изменений.
  const refresh = useCallback(async () => {
    await refreshDevTask()
    await loadDiff()
  }, [refreshDevTask, loadDiff])

  // Поллинг раз в 3с пока вкладка открыта — diff/state живые во время прогона.
  useEffect(() => {
    void refresh()
    const t = setInterval(() => void refresh(), 3000)
    return () => clearInterval(t)
  }, [refresh])

  const handleRevert = useCallback(async () => {
    if (activeDevTaskId == null) return
    const ok = window.confirm(
      'Откатить ВСЕ файловые правки этой задачи к чекпоинту?\n\n' +
      'Файлы вернутся к состоянию на момент открытия задачи. Действие не отменить.'
    )
    if (!ok) return
    try {
      const success = await window.api.devtask.revert(activeDevTaskId)
      if (success && path) {
        // Дерево могло измениться — перечитываем, как делает CheckpointButton.
        const tree = await window.api.files.tree(path)
        useProject.setState({ tree })
      }
    } catch { /* откат не прошёл — состояние не меняем */ }
    await refresh()
  }, [activeDevTaskId, path, refresh])

  if (!path) {
    return (
      <div className="gg-panel">
        <div className="gg-panel-empty" style={{ marginTop: 80 }}>Открой проект чтобы видеть задачу</div>
      </div>
    )
  }

  if (!devTask) {
    return (
      <div className="gg-panel">
        <div className="gg-panel-header">
          <h2 className="gg-panel-title">Задача</h2>
        </div>
        <div className="gg-devtask-empty">
          <div className="gg-devtask-empty-icon">🗂️</div>
          <div className="gg-devtask-empty-title">Нет активной задачи</div>
          <div className="gg-devtask-empty-hint">
            Задача открывается из плана агента (preflight) — кнопкой «Открыть задачу».
            Тогда здесь появятся изменения и кнопка отката.
          </div>
        </div>
      </div>
    )
  }

  const branch = devTask.workBranch || (devTask.baseBranch ? `${devTask.baseBranch} · in-place` : 'in-place')

  return (
    <div className="gg-panel">
      <div className="gg-panel-header">
        <h2 className="gg-panel-title">Задача</h2>
        <div className="gg-panel-meta">
          <button className="gg-btn gg-btn-ghost" onClick={() => void refresh()} title="Обновить">↻ Обновить</button>
        </div>
      </div>

      <div className="gg-devtask-head">
        <div className="gg-devtask-title" title={devTask.title}>{devTask.title}</div>
        <div className="gg-devtask-tags">
          <span className={`gg-devtask-state is-${devTask.state}`}>{STATE_LABEL[devTask.state] ?? devTask.state}</span>
          <span className="gg-devtask-branch" title="Рабочая ветка (Фаза 2 — правки in-place)">⎇ {branch}</span>
          {devTask.risk && <span className={`gg-devtask-risk is-${devTask.risk}`}>риск: {devTask.risk}</span>}
        </div>
        {devTask.summary && <div className="gg-devtask-summary">{devTask.summary}</div>}
      </div>

      <div className="gg-panel-body">
        <div className="gg-devtask-section">
          <div className="gg-devtask-section-title">Изменения ({diff.length})</div>
          {diff.length === 0 ? (
            <div className="gg-devtask-section-empty">
              {loading ? 'Загрузка…' : 'Нет изменений в рабочем дереве.'}
            </div>
          ) : (
            <div className="gg-devtask-files">
              {diff.map(f => (
                <button
                  key={f.path}
                  className="gg-devtask-file"
                  title={`Открыть в проводнике: ${f.path}`}
                  onClick={() => void window.api.files.revealInExplorer(f.path).catch(() => {})}
                >
                  <span className={`gg-devtask-file-status is-${f.status}`}>{statusGlyph(f.status)}</span>
                  <span className="gg-devtask-file-path">{f.path}</span>
                  <span className="gg-devtask-file-stat">
                    {f.added > 0 && <span className="gg-devtask-add">+{f.added}</span>}
                    {f.removed > 0 && <span className="gg-devtask-del">−{f.removed}</span>}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="gg-devtask-actions">
          <button
            className="gg-btn gg-devtask-revert"
            onClick={() => void handleRevert()}
            disabled={devTask.checkpointId == null}
            title={devTask.checkpointId == null ? 'У задачи нет чекпоинта' : 'Откатить все правки к чекпоинту задачи'}
          >
            ↩ Откатить задачу
          </button>
          <button className="gg-btn gg-btn-ghost" onClick={() => closeDevTask()} title="Убрать задачу из активных (не удаляет)">
            Снять как активную
          </button>
        </div>
      </div>
    </div>
  )
}
