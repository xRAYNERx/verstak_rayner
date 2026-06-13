import { describe, it, expect } from 'vitest'
import { sandboxArgsForMode } from '../../electron/ai/codex-cli'

// Регрессия: режим Verstak (auto/bypass) не доходил до `codex exec` —
// он стартовал в read-only и не мог писать («авто не встало»). Маппинг
// режима в sandbox-флаг закрывает это. Платформа передаётся явно, чтобы
// тест был детерминирован независимо от ОС запуска.
describe('codex sandboxArgsForMode (unix)', () => {
  it('auto allows workspace writes', () => {
    expect(sandboxArgsForMode('auto', false)).toEqual(['-s', 'workspace-write'])
  })

  it('accept-edits allows workspace writes', () => {
    expect(sandboxArgsForMode('accept-edits', false)).toEqual(['-s', 'workspace-write'])
  })

  it('bypass skips sandbox entirely', () => {
    expect(sandboxArgsForMode('bypass', false)).toEqual(['--dangerously-bypass-approvals-and-sandbox'])
  })

  it('ask stays read-only', () => {
    expect(sandboxArgsForMode('ask', false)).toEqual(['-s', 'read-only'])
  })

  it('plan stays read-only', () => {
    expect(sandboxArgsForMode('plan', false)).toEqual(['-s', 'read-only'])
  })

  it('undefined defaults to read-only (safe)', () => {
    expect(sandboxArgsForMode(undefined, false)).toEqual(['-s', 'read-only'])
  })
})

// Регрессия Windows: дефолтная elevated-песочница Codex падает на setup
// («windows sandbox: spawn setup refresh», openai/codex#25497) — даже чтение
// файла не выполняется. Форсим unelevated-вариант через -c windows.sandbox,
// сохраняя семантику режима.
describe('codex sandboxArgsForMode (windows)', () => {
  it('ask forces unelevated sandbox + read-only', () => {
    expect(sandboxArgsForMode('ask', true)).toEqual([
      '-c', 'windows.sandbox=unelevated', '-s', 'read-only'
    ])
  })

  it('plan forces unelevated sandbox + read-only', () => {
    expect(sandboxArgsForMode('plan', true)).toEqual([
      '-c', 'windows.sandbox=unelevated', '-s', 'read-only'
    ])
  })

  it('undefined forces unelevated sandbox + read-only', () => {
    expect(sandboxArgsForMode(undefined, true)).toEqual([
      '-c', 'windows.sandbox=unelevated', '-s', 'read-only'
    ])
  })

  it('auto forces unelevated sandbox + workspace-write', () => {
    expect(sandboxArgsForMode('auto', true)).toEqual([
      '-c', 'windows.sandbox=unelevated', '-s', 'workspace-write'
    ])
  })

  it('accept-edits forces unelevated sandbox + workspace-write', () => {
    expect(sandboxArgsForMode('accept-edits', true)).toEqual([
      '-c', 'windows.sandbox=unelevated', '-s', 'workspace-write'
    ])
  })

  it('bypass skips sandbox entirely (no windows fix needed)', () => {
    expect(sandboxArgsForMode('bypass', true)).toEqual(['--dangerously-bypass-approvals-and-sandbox'])
  })
})
