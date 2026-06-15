import { useEffect, useState, useCallback } from 'react'
import { useProject } from '../store/projectStore'

/**
 * Компактный индикатор активной dev_task (Dev Task Flow, Фаза 2) в composer-строке.
 *
 * Показывает: ● Задача: <title> · <state> · N файлов. Клик → вкладка «Задача».
 * Если активной задачи нет — ничего не рендерит (бейдж не шумит).
 *
 * Активную задачу разрешаем сами: при смене проекта/чата store сбрасывает
 * activeDevTaskId, поэтому здесь подтягиваем новейшую активную dev_task для
 * текущего чата через devtask:list. Это переживает переключение чатов без
 * хранения снимков в store (минимализм Фазы 2).
 */
export function DevTaskBadge() {
  const path = useProject(s => s.path)
  const activeChatId = useProject(s => s.activeChatId)
  const devTask = useProject(s => s.devTask)
  const activeDevTaskId = useProject(s => s.activeDevTaskId)
  const setActiveView = useProject(s => s.setActiveView)
  const refreshDevTask = useProject(s => s.refreshDevTask)
  const [fileCount, setFileCount] = useState(0)

  // Разрешаем активную задачу для текущего чата, если её нет в store. Берём
  // новейшую не-финальную (state != committed/cancelled) задачу этого чата.
  const resolve = useCallback(async () => {
    if (!path) return
    if (activeDevTaskId != null) { void refreshDevTask(); return }
    try {
      const list = await window.api.devtask.list(path)
      const active = list.find(t =>
        t.chatId === activeChatId && t.state !== 'committed' && t.state !== 'cancelled'
      )
      if (active) useProject.setState({ activeDevTaskId: active.id, devTask: active })
    } catch { /* IPC недоступен в dev — бейдж просто не покажется */ }
  }, [path, activeChatId, activeDevTaskId, refreshDevTask])

  useEffect(() => {
    void resolve()
  }, [resolve])

  // Счётчик изменённых файлов — лёгкий git diff, обновляем при смене задачи.
  useEffect(() => {
    if (!devTask) { setFileCount(0); return }
    let alive = true
    void window.api.git.diff()
      .then(d => { if (alive) setFileCount(d.stat.length) })
      .catch(() => { if (alive) setFileCount(0) })
    return () => { alive = false }
  }, [devTask])

  if (!devTask) return null

  return (
    <button
      type="button"
      className={`gg-devtask-badge is-${devTask.state}`}
      onClick={() => setActiveView('task')}
      title={`Открыть вкладку «Задача»: ${devTask.title}`}
    >
      <span className="gg-devtask-badge-dot" aria-hidden>●</span>
      <span className="gg-devtask-badge-title">{devTask.title}</span>
      <span className="gg-devtask-badge-meta">{devTask.state}{fileCount > 0 ? ` · ${fileCount} ф.` : ''}</span>
    </button>
  )
}
