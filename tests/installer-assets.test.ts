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
    const sidebar = path.join(BUILD, 'installerSidebar.bmp')
    const header = path.join(BUILD, 'installerHeader.bmp')
    expect(fs.existsSync(sidebar)).toBe(true)
    expect(fs.existsSync(header)).toBe(true)

    const sb = readBmpSize(fs.readFileSync(sidebar))
    const hd = readBmpSize(fs.readFileSync(header))
    expect(sb).toEqual({ width: 164, height: 314, bpp: 24 })
    expect(hd).toEqual({ width: 150, height: 57, bpp: 24 })
  })

  it('installer.nsh defines Verstak branding macros', () => {
    const nsh = fs.readFileSync(path.join(BUILD, 'installer.nsh'), 'utf8')
    expect(nsh).toContain('customWelcomePage')
    expect(nsh).toMatch(/!define MUI_BGCOLOR "2E3440"/)
    expect(nsh).toContain('Добро пожаловать в Verstak')
  })
})