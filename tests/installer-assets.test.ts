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
  it('sidebar/header/buttons exist with NSIS dimensions after generate:installer', () => {
    const files: Array<[string, number, number]> = [
      ['installerSidebar.bmp', 164, 314],
      ['uninstallerSidebar.bmp', 164, 314],
      ['installerHeader.bmp', 150, 57],
      ['uninstallerHeader.bmp', 150, 57],
      ['btn-next.bmp', 96, 34],
      ['btn-back.bmp', 96, 34],
      ['btn-cancel.bmp', 96, 34],
      ['btn-install.bmp', 120, 34],
      ['btn-finish.bmp', 120, 34],
      ['btn-close.bmp', 46, 36],
      ['btn-browse.bmp', 64, 18],
      ['titlebar.bmp', 500, 40],
    ]

    for (const [name, w, h] of files) {
      const file = path.join(BUILD, name)
      expect(fs.existsSync(file), name).toBe(true)
      const size = readBmpSize(fs.readFileSync(file))
      expect(size).toEqual({ width: w, height: h, bpp: 24 })
    }
  })

  it('custom NSIS UI scripts define Verstak branding', () => {
    const nsh = fs.readFileSync(path.join(BUILD, 'installer.nsh'), 'utf8')
    const ui = fs.readFileSync(path.join(BUILD, 'verstak-ui.nsh'), 'utf8')

    expect(nsh).toMatch(/!define MUI_BGCOLOR "2E3440"/)
    expect(nsh).toContain('customWelcomePage')
    expect(nsh).toContain('customFinishPage')
    expect(nsh).toContain('MUI_DIRECTORYPAGE_BGCOLOR')
    expect(nsh).not.toContain('VerstakApplyDarkChrome')

    expect(ui).toContain('VerstakApplyBorderless')
    expect(ui).toContain('Добро пожаловать в Verstak')
    expect(ui).toContain('${NSD_CreateBitmap}')
    expect(ui).toContain('VERSTAK_WIN_W 500')
    expect(ui).not.toContain('VerstakHideMuiNav')
    expect(ui).not.toContain('footerReuse')
  })
})