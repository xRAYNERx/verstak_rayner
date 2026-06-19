import { describe, expect, it } from 'vitest'
import { parseSilentInstallArgs } from '../../electron/installer/silent-args'

describe('parseSilentInstallArgs', () => {
  it('parses silent install flags', () => {
    expect(parseSilentInstallArgs([
      '--silent',
      '--install-dir=C:\\Users\\RAYNER\\AppData\\Local\\Programs\\Verstak',
      '--restart',
    ])).toEqual({
      silent: true,
      installDir: 'C:\\Users\\RAYNER\\AppData\\Local\\Programs\\Verstak',
      restart: true,
    })
  })

  it('ignores unrelated args', () => {
    expect(parseSilentInstallArgs(['--foo', '--install-dir="D:\\Verstak"'])).toEqual({
      silent: false,
      installDir: 'D:\\Verstak',
      restart: false,
    })
  })
})