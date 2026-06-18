import { describe, expect, it, vi, beforeEach, afterAll } from 'vitest'
import { createHash } from 'crypto'
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const fakeLocalAppData = join(tmpdir(), `verstak-updater-test-${process.pid}`)

// getUpdaterCacheRoot() читает process.env.LOCALAPPDATA в первую очередь (а
// app.getPath('appData') — лишь фолбэк). На Windows реальный LOCALAPPDATA задан,
// поэтому без подмены тесты били бы по НАСТОЯЩЕМУ кэшу апдейтера. Изолируем во
// временную папку.
const ORIG_LOCALAPPDATA = process.env.LOCALAPPDATA
process.env.LOCALAPPDATA = fakeLocalAppData

vi.mock('electron', () => ({
  app: {
    getName: () => 'Verstak',
    getPath: () => fakeLocalAppData,
  },
}))

afterAll(() => {
  if (ORIG_LOCALAPPDATA === undefined) delete process.env.LOCALAPPDATA
  else process.env.LOCALAPPDATA = ORIG_LOCALAPPDATA
  rmSync(fakeLocalAppData, { recursive: true, force: true })
})

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

  it('reconcileCachedDownload accepts installer.exe without remote sha512', async () => {
    const {
      getUpdaterCacheRoot,
      reconcileCachedDownload,
    } = await import('../electron/updater-cache')
    const root = getUpdaterCacheRoot()
    mkdirSync(root, { recursive: true })
    const payload = 'loose-installer-payload'
    writeFileSync(join(root, 'installer.exe'), payload)

    const repaired = await reconcileCachedDownload('Verstak-Setup-9.9.9-x64.exe', '', 0)

    expect(repaired).toBe(join(root, 'pending', 'Verstak-Setup-9.9.9-x64.exe'))
    expect(existsSync(join(root, 'pending', 'update-info.json'))).toBe(true)
  })

  it('reconcileCachedDownload ignores pending for a different version', async () => {
    const { getUpdaterCacheRoot, reconcileCachedDownload } = await import('../electron/updater-cache')
    const root = getUpdaterCacheRoot()
    const pending = join(root, 'pending')
    mkdirSync(pending, { recursive: true })
    const payload = 'pending-old-version'
    const sha512 = createHash('sha512').update(payload).digest('base64')
    const fileName = 'Verstak-Setup-1.5.7-x64.exe'
    writeFileSync(join(pending, fileName), payload)
    writeFileSync(join(pending, 'update-info.json'), JSON.stringify({ fileName, sha512 }))

    const repaired = await reconcileCachedDownload('Verstak-Setup-1.5.11-x64.exe', sha512, payload.length)

    expect(repaired).toBeNull()
  })

  it('clearAllUpdaterCache removes entire updater directory', async () => {
    const { getUpdaterCacheRoot, clearAllUpdaterCache } = await import('../electron/updater-cache')
    const root = getUpdaterCacheRoot()
    mkdirSync(join(root, 'pending'), { recursive: true })
    writeFileSync(join(root, 'installer.exe'), 'x')

    clearAllUpdaterCache()

    expect(existsSync(root)).toBe(false)
  })

  it('clearPendingIfWrongVersion removes stale installer', async () => {
    const { getUpdaterCacheRoot, clearPendingIfWrongVersion } = await import('../electron/updater-cache')
    const pending = join(getUpdaterCacheRoot(), 'pending')
    mkdirSync(pending, { recursive: true })
    writeFileSync(join(pending, 'Verstak-Setup-1.5.7-x64.exe'), 'old')
    writeFileSync(
      join(pending, 'update-info.json'),
      JSON.stringify({ fileName: 'Verstak-Setup-1.5.7-x64.exe', sha512: 'abc==' }),
    )

    clearPendingIfWrongVersion('1.5.11')

    expect(existsSync(pending)).toBe(false)
  })

  it('reconcileCachedDownload trusts valid pending without re-hash', async () => {
    const { getUpdaterCacheRoot, reconcileCachedDownload } = await import('../electron/updater-cache')
    const root = getUpdaterCacheRoot()
    const pending = join(root, 'pending')
    mkdirSync(pending, { recursive: true })
    const payload = 'pending-ready-payload'
    const sha512 = createHash('sha512').update(payload).digest('base64')
    const fileName = 'Verstak-Setup-1.5.7-x64.exe'
    writeFileSync(join(pending, fileName), payload)
    writeFileSync(join(pending, 'update-info.json'), JSON.stringify({ fileName, sha512 }))

    const repaired = await reconcileCachedDownload(fileName, sha512, payload.length)

    expect(repaired).toBe(join(pending, fileName))
  })

  it('reconcileCachedDownload repairs installer.exe in cache root', async () => {
    const {
      getUpdaterCacheRoot,
      reconcileCachedDownload,
    } = await import('../electron/updater-cache')
    const root = getUpdaterCacheRoot()
    mkdirSync(root, { recursive: true })
    const payload = 'fake-installer-payload'
    const sha512 = createHash('sha512').update(payload).digest('base64')
    writeFileSync(join(root, 'installer.exe'), payload)

    const repaired = await reconcileCachedDownload('Verstak-Setup-1.5.7-x64.exe', sha512, payload.length)

    expect(repaired).toBe(join(root, 'pending', 'Verstak-Setup-1.5.7-x64.exe'))
    expect(existsSync(join(root, 'pending', 'update-info.json'))).toBe(true)
    expect(existsSync(join(root, 'installer.exe'))).toBe(false)
  })
})