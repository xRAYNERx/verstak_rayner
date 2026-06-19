import { describe, it, expect } from 'vitest'
import { isTypeScriptFile, shouldAutoDiagnose, formatDiagnosticHint } from '../../electron/ai/diagnostic-loop'

describe('diagnostic-loop', () => {
  it('isTypeScriptFile: .ts/.tsx да, остальное нет', () => {
    expect(isTypeScriptFile('src/foo.ts')).toBe(true)
    expect(isTypeScriptFile('src/Bar.tsx')).toBe(true)
    expect(isTypeScriptFile('README.md')).toBe(false)
    expect(isTypeScriptFile('a.json')).toBe(false)
    expect(isTypeScriptFile('script.js')).toBe(false)
  })

  it('shouldAutoDiagnose: только при включено + есть TS-правки + модель сама не проверила', () => {
    expect(shouldAutoDiagnose({ enabled: true, tsWritesThisTurn: 1, modelCheckedThisTurn: false })).toBe(true)
    // выключено
    expect(shouldAutoDiagnose({ enabled: false, tsWritesThisTurn: 1, modelCheckedThisTurn: false })).toBe(false)
    // нет TS-правок
    expect(shouldAutoDiagnose({ enabled: true, tsWritesThisTurn: 0, modelCheckedThisTurn: false })).toBe(false)
    // модель уже проверила сама — не дублируем tsc
    expect(shouldAutoDiagnose({ enabled: true, tsWritesThisTurn: 2, modelCheckedThisTurn: true })).toBe(false)
  })

  it('formatDiagnosticHint: ошибки → нудж с телом', () => {
    const out = formatDiagnosticHint('Found 1 error:\n\nsrc/a.ts:10:5 — TS2345: bad type')
    expect(out).not.toBeNull()
    expect(out).toContain('почини')
    expect(out).toContain('TS2345')
  })

  it('formatDiagnosticHint: чисто / нет tsconfig / пусто → null (нудж не нужен)', () => {
    expect(formatDiagnosticHint('✅ Нет ошибок TypeScript.')).toBeNull()
    expect(formatDiagnosticHint('tsconfig.json не найден — проект не TypeScript.')).toBeNull()
    expect(formatDiagnosticHint('')).toBeNull()
    expect(formatDiagnosticHint('   ')).toBeNull()
  })
})
