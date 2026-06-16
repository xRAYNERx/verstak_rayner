import { describe, expect, it, vi, beforeEach } from 'vitest'
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const fakeLocalAppData = join(tmpdir(), `verstak-updater-test-${process.pid}`)

vi.mock('electron', () => ({
  app: {
    getName: () => 'Verstak',
    getPath: (key: string) => {
      if (key === 'localAppData') return fakeLocalAppData
      throw new Error(`unexpected path: ${key}`)
    },
  },
}))

describe('updater-cache', () => {
  beforeEach(() => {
    rmSync(fakeLocalAppData, { recursive: true, force: true })
  })

  it('clearPendingUpdateCache removes pending installer files', async () => {
    const { getUpdaterCacheRoot, clearPendingUpdateCache } = await import('../electron/updater-cache')
    const pending = join(getUpdaterCacheRoot(), 'pending')
    mkdirSync(pending, { recursive: true })
    writeFileSync(join(pending, 'update-info.json'), '{}')

    clearPendingUpdateCache()

    expect(existsSync(pending)).toBe(false)
  })
})