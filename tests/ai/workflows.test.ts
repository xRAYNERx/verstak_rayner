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

  it('marketing-audit — единственный в каталоге WORKFLOWS', () => {
    expect(WORKFLOWS.map(w => w.id)).toContain('marketing-audit')
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
