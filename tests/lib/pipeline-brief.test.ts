import { describe, it, expect } from 'vitest'
import { EMPTY_BRIEF, isBriefReady, buildPlanPrompt, buildExecutePrompt } from '../../src/lib/pipeline-brief'

describe('pipeline-brief', () => {
  it('EMPTY_BRIEF не готов', () => {
    expect(isBriefReady(EMPTY_BRIEF)).toBe(false)
  })

  it('готов когда есть цель И DoD (границы опциональны)', () => {
    expect(isBriefReady({ goal: 'fix', constraints: '', dod: 'npm run type' })).toBe(true)
  })

  it('не готов без DoD или без цели', () => {
    expect(isBriefReady({ goal: 'fix', constraints: '', dod: '' })).toBe(false)
    expect(isBriefReady({ goal: '', constraints: 'x', dod: 'test' })).toBe(false)
    expect(isBriefReady({ goal: '   ', constraints: '', dod: '  ' })).toBe(false)
  })

  it('buildPlanPrompt: цель/границы/DoD + read-only инструкция', () => {
    const p = buildPlanPrompt({ goal: 'починить tsc', constraints: 'не трогать билд', dod: 'npm run type' })
    expect(p).toContain('Задача: починить tsc')
    expect(p).toContain('Не трогать: не трогать билд')
    expect(p).toContain('DoD: npm run type')
    expect(p).toContain('НЕ вноси изменений')
    expect(p).toContain('create_plan')
  })

  it('buildPlanPrompt: пустые границы → «—»', () => {
    expect(buildPlanPrompt({ goal: 'g', constraints: '', dod: 'd' })).toContain('Не трогать: —')
  })

  it('buildExecutePrompt: planId + DoD + attest_verification', () => {
    const p = buildExecutePrompt({ goal: 'g', constraints: '', dod: 'npm test' }, 42)
    expect(p).toContain('plan id=42')
    expect(p).toContain('DoD: npm test')
    expect(p).toContain('attest_verification')
  })
})
