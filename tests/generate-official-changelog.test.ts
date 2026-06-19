import { describe, expect, it } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { buildNotesFromEntries } = require('../scripts/generate-official-changelog.cjs') as {
  buildNotesFromEntries: (entries: Array<{
    version?: string
    treeVersion?: string
    title: string
    changes?: string[]
    deployed?: string
  }>) => Array<{ version: string; body: string }>
}

// Re-export helper for tests — attach to module
// buildNotesFromEntries is not exported yet — export it from the script

describe('generate-official-changelog', () => {
  it('includes entries with treeVersion only', () => {
    const notes = buildNotesFromEntries([
      {
        treeVersion: '1.5.15',
        title: 'Rayner tweak',
        deployed: '19.06.2026',
        changes: ['Тихая установка'],
      },
      {
        version: '1.5.15',
        title: 'Upstream 1.5.15',
        deployed: '19.06.2026',
        changes: ['Справка в приложении'],
      },
    ])
    const hit = notes.find((n) => n.version === '1.5.15')
    expect(hit).toBeDefined()
    expect(hit?.body).toContain('Rayner tweak')
    expect(hit?.body).toContain('Upstream 1.5.15')
  })

  it('includes 1.5.16 when present', () => {
    const notes = buildNotesFromEntries([
      {
        version: '1.5.16',
        title: 'Pipeline',
        deployed: '19.06.2026',
        changes: ['Brief→Proof'],
      },
    ])
    expect(notes.some((n) => n.version === '1.5.16')).toBe(true)
  })
})