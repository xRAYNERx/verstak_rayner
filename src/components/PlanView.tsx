import { useEffect, useState } from 'react'
import { useProject } from '../store/projectStore'
import type { Plan, PlanStep, StepStatus } from '../types/api'

const STEP_LABEL: Record<StepStatus, string> = {
  pending: 'ждёт',
  running: 'выполняется',
  done: 'готово',
  skipped: 'пропущено',
  failed: 'ошибка'
}

const STEP_COLOR: Record<StepStatus, string> = {
  pending: 'var(--text-tertiary)',
  running: 'var(--accent)',
  done: 'var(--success)',
  skipped: 'var(--text-disabled)',
  failed: 'var(--error)'
}

export function PlanView() {
  const { path } = useProject()
  const [plans, setPlans] = useState<Plan[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [composer, setComposer] = useState<{ title: string; rawSteps: string }>({ title: '', rawSteps: '' })

  async function refresh() {
    if (!path) return
    const list = await window.api.plans.list(path)
    setPlans(list)
    if (list.length > 0 && (activeId === null || !list.some(p => p.id === activeId))) {
      setActiveId(list[0].id)
    }
  }

  useEffect(() => { void refresh() }, [path])

  if (!path) {
    return (
      <div className="gg-panel">
        <div className="gg-panel-empty" style={{ marginTop: 80 }}>Открой проект чтобы видеть планы</div>
      </div>
    )
  }

  async function createPlan() {
    const title = composer.title.trim()
    if (!title) return
    const steps = composer.rawSteps.split('\n').map(s => s.trim()).filter(Boolean).map(s => ({ title: s }))
    if (steps.length === 0) return
    await window.api.plans.create(path!, title, steps)
    setComposer({ title: '', rawSteps: '' })
    await refresh()
  }

  async function toggleStep(step: PlanStep) {
    const next: StepStatus = step.status === 'done' ? 'pending' : 'done'
    await window.api.plans.updateStep(step.id, { status: next })
    await refresh()
  }

  async function removePlan(id: number) {
    if (!window.confirm('Удалить план?')) return
    await window.api.plans.remove(id)
    await refresh()
  }

  const active = plans.find(p => p.id === activeId) ?? null
  const doneCount = active?.steps.filter(s => s.status === 'done').length ?? 0
  const totalCount = active?.steps.length ?? 0

  return (
    <div className="gg-panel">
      <div className="gg-panel-header">
        <h2 className="gg-panel-title">Планы</h2>
        <div className="gg-panel-meta">{plans.length} плана(ов)</div>
      </div>

      <div className="gg-panel-body">
        <div className="gg-plan-compose">
          <input
            className="gg-input"
            placeholder="Название плана"
            value={composer.title}
            onChange={e => setComposer(c => ({ ...c, title: e.target.value }))}
          />
          <textarea
            className="gg-input gg-plan-steps-textarea"
            placeholder="Шаги, по одному на строку"
            value={composer.rawSteps}
            rows={3}
            onChange={e => setComposer(c => ({ ...c, rawSteps: e.target.value }))}
          />
          <button
            className="gg-btn gg-btn-primary"
            onClick={() => void createPlan()}
            disabled={!composer.title.trim() || !composer.rawSteps.trim()}
            style={{ alignSelf: 'flex-end' }}
          >
            Создать план
          </button>
        </div>

        {plans.length === 0 && (
          <div className="gg-panel-empty">
            Планов ещё нет. Создай первый сверху или попроси AI: «составь план для X».
          </div>
        )}

        {plans.length > 0 && (
          <div className="gg-plan-layout">
            <div className="gg-plan-list">
              {plans.map(p => (
                <button
                  key={p.id}
                  className={`gg-plan-list-item ${activeId === p.id ? 'is-active' : ''}`}
                  onClick={() => setActiveId(p.id)}
                >
                  <div className="gg-plan-list-title">{p.title}</div>
                  <div className="gg-plan-list-meta">
                    {p.steps.filter(s => s.status === 'done').length} / {p.steps.length}
                    {' · '}
                    {p.status}
                  </div>
                </button>
              ))}
            </div>

            {active && (
              <div className="gg-plan-detail">
                <div className="gg-plan-detail-header">
                  <div className="gg-plan-detail-title">{active.title}</div>
                  <div className="gg-plan-detail-meta">
                    {doneCount} / {totalCount} шагов · {active.status}
                  </div>
                  <button className="gg-btn gg-btn-ghost gg-btn-danger" onClick={() => void removePlan(active.id)}>Удалить</button>
                </div>
                <div className="gg-plan-steps">
                  {active.steps.map(step => (
                    <div key={step.id} className={`gg-plan-step is-${step.status}`}>
                      <button
                        className={`gg-task-check ${step.status === 'done' ? 'is-done' : ''}`}
                        onClick={() => void toggleStep(step)}
                        title={STEP_LABEL[step.status]}
                      >
                        {step.status === 'done' ? '✓' : ''}
                      </button>
                      <div className="gg-plan-step-body">
                        <div className="gg-plan-step-title">{step.title}</div>
                        {step.detail && <div className="gg-plan-step-detail">{step.detail}</div>}
                        {step.result && <div className="gg-plan-step-result">{step.result}</div>}
                      </div>
                      <div className="gg-plan-step-status" style={{ color: STEP_COLOR[step.status] }}>
                        {STEP_LABEL[step.status]}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
