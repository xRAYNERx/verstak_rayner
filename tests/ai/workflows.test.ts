import { describe, it, expect } from 'vitest'
import { WORKFLOWS, getWorkflow } from '../../electron/ai/workflows/registry'
import { buildWorkflowPrompt } from '../../electron/ai/workflows/workflow-runner'

describe('workflows registry', () => {
  it('getWorkflow возвращает marketing-audit', () => {
    const wf = getWorkflow('marketing-audit')
    expect(wf).toBeDefined()
    expect(wf?.id).toBe('marketing-audit')
    expect(wf?.name).toBe('Аудит конкурентов')
  })

  it('marketing-audit содержит ровно 8 шагов с ожидаемыми id', () => {
    const wf = getWorkflow('marketing-audit')
    expect(wf?.steps).toHaveLength(8)
    expect(wf?.steps.map(s => s.id)).toEqual([
      'parse_brief',
      'find_competitors',
      'research_competitors',
      'extract_positioning',
      'generate_insights',
      'generate_lead_magnets',
      'build_landing_structure',
      'create_artifact'
    ])
  })

  it('getWorkflow возвращает undefined для неизвестного id', () => {
    expect(getWorkflow('nope')).toBeUndefined()
  })

  it('каталог WORKFLOWS включает marketing-audit + RU-пак (F9)', () => {
    const ids = WORKFLOWS.map(w => w.id)
    expect(ids).toContain('marketing-audit')
    expect(ids).toContain('ydirect-metrika-audit')
    expect(ids).toContain('bitrix-stale-deals')
    expect(ids).toContain('onec-sheets-reconcile')
  })

  it('у всех workflow уникальные id и непустые шаги с уникальными step.id', () => {
    const ids = WORKFLOWS.map(w => w.id)
    expect(new Set(ids).size).toBe(ids.length) // id уникальны
    for (const w of WORKFLOWS) {
      expect(w.name.length, `${w.id} name`).toBeGreaterThan(0)
      expect(w.description.length, `${w.id} description`).toBeGreaterThan(0)
      expect(w.steps.length, `${w.id} steps`).toBeGreaterThan(0)
      const stepIds = w.steps.map(s => s.id)
      expect(new Set(stepIds).size, `${w.id} step ids`).toBe(stepIds.length)
      for (const s of w.steps) {
        expect(s.title.length, `${w.id}/${s.id} title`).toBeGreaterThan(0)
        expect(s.instruction.length, `${w.id}/${s.id} instruction`).toBeGreaterThan(0)
      }
    }
  })

  it('финальный шаг каждого RU-сценария собирает артефакт через generate_html', () => {
    for (const id of ['ydirect-metrika-audit', 'bitrix-stale-deals', 'onec-sheets-reconcile']) {
      const wf = getWorkflow(id)!
      const last = wf.steps[wf.steps.length - 1]
      expect(last.suggestedTools, `${id} финал`).toContain('generate_html')
    }
  })
})

describe('buildWorkflowPrompt', () => {
  const wf = getWorkflow('marketing-audit')!

  it('включает все 8 шагов по заголовкам', () => {
    const prompt = buildWorkflowPrompt(wf, 'Кофейня в Москве, средний чек 400₽')
    for (const step of wf.steps) {
      expect(prompt).toContain(step.title)
    }
  })

  it('нумерует шаги от 1 до 8', () => {
    const prompt = buildWorkflowPrompt(wf, 'бриф')
    expect(prompt).toContain('1. Разбор брифа')
    expect(prompt).toContain('8. Сборка артефакта')
  })

  it('требует начать с create_plan и завершить generate_html', () => {
    const prompt = buildWorkflowPrompt(wf, 'бриф')
    expect(prompt).toContain('create_plan')
    expect(prompt).toContain('generate_html')
  })

  it('включает бриф пользователя', () => {
    const prompt = buildWorkflowPrompt(wf, 'Кофейня в Москве')
    expect(prompt).toContain('Кофейня в Москве')
  })

  it('подставляет плейсхолдер при пустом брифе', () => {
    const prompt = buildWorkflowPrompt(wf, '   ')
    expect(prompt).toContain('бриф не указан')
  })
})
