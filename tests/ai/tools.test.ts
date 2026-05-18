import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { createFileTools } from '../../electron/ai/tools'

describe('file tools', () => {
  let root: string
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'gg-'))
    writeFileSync(join(root, 'README.md'), '# Test')
    mkdirSync(join(root, 'src'))
    writeFileSync(join(root, 'src', 'index.ts'), 'export {}')
  })
  afterEach(() => { rmSync(root, { recursive: true, force: true }) })

  it('read_file returns file contents', async () => {
    const tools = createFileTools(root)
    const result = await tools.execute('read_file', { path: 'README.md' })
    expect(result).toBe('# Test')
  })

  it('list_directory returns entries', async () => {
    const tools = createFileTools(root)
    const result = await tools.execute('list_directory', { path: '.' }) as string[]
    expect(result).toContain('README.md')
    expect(result).toContain('src/')
  })

  it('rejects path traversal', async () => {
    const tools = createFileTools(root)
    await expect(tools.execute('read_file', { path: '../../../etc/passwd' })).rejects.toThrow()
  })
})
