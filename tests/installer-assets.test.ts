import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

const BUILD = path.join(process.cwd(), 'build')

function readBmpSize(buf: Buffer) {
  return {
    width: buf.readInt32LE(18),
    height: buf.readInt32LE(22),
    bpp: buf.readUInt16LE(28),
  }
}

describe('installer BMP assets', () => {
  it('sidebar/header exist with NSIS dimensions after generate:installer', () => {
    const files: Array<[string, number, number]> = [
      ['installerSidebar.bmp', 164, 314],
      ['uninstallerSidebar.bmp', 164, 314],
      ['installerHeader.bmp', 150, 57],
      ['uninstallerHeader.bmp', 150, 57],
    ]

    for (const [name, w, h] of files) {
      const file = path.join(BUILD, name)
      expect(fs.existsSync(file), name).toBe(true)
      const size = readBmpSize(fs.readFileSync(file))
      expect(size).toEqual({ width: w, height: h, bpp: 24 })
    }
  })

  it('installer.nsh uses standard Nord MUI without custom nsDialogs UI', () => {
    const nsh = fs.readFileSync(path.join(BUILD, 'installer.nsh'), 'utf8')

    expect(nsh).toMatch(/!define MUI_BGCOLOR "2E3440"/)
    expect(nsh).toContain('MUI_PAGE_WELCOME')
    expect(nsh).toContain('MUI_PAGE_FINISH')
    expect(nsh).toContain('MUI_DIRECTORYPAGE_BGCOLOR')
    expect(nsh).not.toContain('nsDialogs::')
    expect(nsh).not.toContain('VerstakApplyBorderless')
    expect(nsh).not.toContain('VerstakApplyDarkChrome')
    expect(fs.existsSync(path.join(BUILD, 'verstak-ui.nsh'))).toBe(false)
  })
})