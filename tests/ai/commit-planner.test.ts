import { describe, it, expect } from 'vitest'
import { buildCommitPlan } from '../../electron/ai/commit-planner'
import type { GitDiffStatEntry } from '../../electron/ipc/git'

/**
 * Тесты Conventional Commit Planner (Dev Task Flow, Фаза 4) — чистая логика
 * разбивки diff на группы (CLAUDE.md п.7). Без БД / git / окружения.
 */

function stat(path: string, added = 5, removed = 1): GitDiffStatEntry {
  return { path, added, removed, status: 'modified' }
}

describe('buildCommitPlan', () => {
  it('разбивает backend и frontend в разные группы со своими scope', () => {
    const { groups } = buildCommitPlan({
      diffStat: [
        stat('electron/ipc/git.ts'),
        stat('electron/storage/dev-tasks.ts'),
        stat('src/components/DevTaskPanel.tsx'),
        stat('src/store/projectStore.ts')
      ]
    })
    const keys = groups.map(g => `${g.type}(${g.scope})`)
    expect(keys).toContain('feat(ipc)')
    expect(keys).toContain('feat(storage)')
    expect(keys).toContain('feat(ui)')
    expect(keys).toContain('feat(store)')
    // Четыре разных зоны → четыре группы.
    expect(groups.length).toBe(4)
    // Файлы не теряются и попадают в свою группу.
    const ipcGroup = groups.find(g => g.scope === 'ipc')!
    expect(ipcGroup.files).toEqual(['electron/ipc/git.ts'])
  })

  it('файлы одной зоны сливаются в одну группу', () => {
    const { groups } = buildCommitPlan({
      diffStat: [
        stat('electron/ai/commit-planner.ts'),
        stat('electron/ai/tools.ts')
      ]
    })
    expect(groups.length).toBe(1)
    expect(groups[0].scope).toBe('ai')
    expect(groups[0].files.length).toBe(2)
  })

  it('tests/ → отдельная группа type=test независимо от summary=feat', () => {
    const { groups } = buildCommitPlan({
      diffStat: [
        stat('electron/ai/commit-planner.ts'),
        stat('tests/ai/commit-planner.test.ts')
      ],
      summary: 'feat: новый commit planner'
    })
    const testGroup = groups.find(g => g.scope === 'tests')
    expect(testGroup).toBeDefined()
    expect(testGroup!.type).toBe('test')
    // Продуктовая группа получает feat из summary.
    const aiGroup = groups.find(g => g.scope === 'ai')!
    expect(aiGroup.type).toBe('feat')
  })

  it('docs/ → type=docs', () => {
    const { groups } = buildCommitPlan({ diffStat: [stat('docs/COMPETITIVE_ROADMAP.md')] })
    expect(groups[0].type).toBe('docs')
    expect(groups[0].scope).toBe('docs')
  })

  it('conventional type: summary "почини баг" → fix для продуктовых групп', () => {
    const { groups, commitMessage } = buildCommitPlan({
      diffStat: [stat('electron/ipc/git.ts')],
      summary: 'почини баг с парсингом ветки'
    })
    expect(groups[0].type).toBe('fix')
    expect(commitMessage.startsWith('fix(ipc):')).toBe(true)
  })

  it('conventional type: summary про рефакторинг → refactor', () => {
    const { groups } = buildCommitPlan({
      diffStat: [stat('electron/ai/tools.ts')],
      summary: 'вынести serializeMsg в отдельный модуль'
    })
    expect(groups[0].type).toBe('refactor')
  })

  it('одна группа → однострочный commitMessage с summary как subject', () => {
    const { commitMessage } = buildCommitPlan({
      diffStat: [stat('src/components/Foo.tsx')],
      summary: 'добавить кнопку коммита'
    })
    expect(commitMessage).toBe('feat(ui): добавить кнопку коммита')
  })

  it('несколько групп → header по доминирующей + тело со списком', () => {
    const { commitMessage } = buildCommitPlan({
      diffStat: [
        stat('electron/ipc/git.ts'),
        stat('electron/ipc/dev-task.ts'),
        stat('electron/ipc/verify.ts'),       // ipc = 3 файла (доминирует)
        stat('src/components/DevTaskPanel.tsx')
      ],
      summary: 'фазы 3-4 dev task flow'
    })
    const lines = commitMessage.split('\n')
    expect(lines[0]).toBe('feat(ipc): фазы 3-4 dev task flow')   // доминирует ipc (3 файла)
    expect(commitMessage).toContain('- feat(ipc):')
    expect(commitMessage).toContain('- feat(ui):')
  })

  it('пустой diff → план без групп и нейтральное сообщение', () => {
    const plan = buildCommitPlan({ diffStat: [] })
    expect(plan.groups).toEqual([])
    expect(plan.commitMessage.length).toBeGreaterThan(0)
    expect(plan.prSummary).toContain('Нет отслеженных изменений')
  })

  it('prSummary содержит группы, файлы и затронутые зоны', () => {
    const { prSummary } = buildCommitPlan({
      diffStat: [stat('electron/storage/dev-tasks.ts')],
      summary: 'storage dev tasks',
      affectedZones: ['electron/storage/']
    })
    expect(prSummary).toContain('## storage dev tasks')
    expect(prSummary).toContain('`electron/storage/dev-tasks.ts`')
    expect(prSummary).toContain('Затронутые зоны')
    expect(prSummary).toContain('`electron/storage/`')
  })
})
