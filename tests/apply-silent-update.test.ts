import { describe, expect, it } from 'vitest'
import { createRequire } from 'module'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const require = createRequire(import.meta.url)
const { findFileRecursive, removeStaleUnpacked, parseArgs } = require('../scripts/apply-silent-update.cjs') as {
  findFileRecursive: (root: string, name: string) => string | null
  removeStaleUnpacked: (installDir: string) => void
  parseArgs: (argv: string[]) => { installer: string; installDir: string; sevenZip: string; restart: boolean }
}

describe('apply-silent-update', () => {
  it('parses CLI args', () => {
    expect(parseArgs([
      '--installer=C:\\setup.exe',
      '--install-dir=C:\\Verstak',
      '--seven-zip=C:\\7za.exe',
      '--no-restart',
    ])).toEqual({
      installer: 'C:\\setup.exe',
      installDir: 'C:\\Verstak',
      sevenZip: 'C:\\7za.exe',
      restart: false,
    })
  })

  it('finds nested files', () => {
    const root = join(tmpdir(), `verstak-test-${Date.now()}`)
    const nested = join(root, 'a', 'b')
    mkdirSync(nested, { recursive: true })
    writeFileSync(join(nested, 'app-payload.7z'), 'x')
    try {
      expect(findFileRecursive(root, 'app-payload.7z')).toBe(join(nested, 'app-payload.7z'))
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('removes stale app.asar.unpacked', () => {
    const root = join(tmpdir(), `verstak-test-${Date.now()}`)
    const unpacked = join(root, 'resources', 'app.asar.unpacked')
    mkdirSync(unpacked, { recursive: true })
    writeFileSync(join(unpacked, 'stale.node'), 'x')
    try {
      removeStaleUnpacked(root)
      expect(existsSync(unpacked)).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})