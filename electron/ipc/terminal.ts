import { ipcMain, BrowserWindow } from 'electron'
import * as pty from '@homebridge/node-pty-prebuilt-multiarch'

const sessions = new Map<number, pty.IPty>()

export function registerTerminalIpc(): void {
  ipcMain.handle('term:spawn', (e, cwd: string) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return -1
    const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash'
    const env = {
      ...(process.env as Record<string, string>),
      LANG: 'en_US.UTF-8',
      LC_ALL: 'en_US.UTF-8',
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor'
    }
    const args = process.platform === 'win32'
      ? [
          '-NoLogo',
          '-NoExit',
          '-ExecutionPolicy',
          'Bypass',
          '-Command',
          "[Console]::InputEncoding=[System.Text.UTF8Encoding]::new(); [Console]::OutputEncoding=[System.Text.UTF8Encoding]::new(); $OutputEncoding=[System.Text.UTF8Encoding]::new(); chcp 65001 > $null"
        ]
      : []
    const p = pty.spawn(shell, args, { cwd, cols: 100, rows: 30, env })
    const id = p.pid
    sessions.set(id, p)
    p.onData(data => e.sender.send('term:data', { id, data }))
    p.onExit(() => { sessions.delete(id); e.sender.send('term:exit', { id }) })
    return id
  })
  ipcMain.handle('term:write', (_e, id: number, data: string) => sessions.get(id)?.write(data))
  ipcMain.handle('term:resize', (_e, id: number, cols: number, rows: number) => sessions.get(id)?.resize(cols, rows))
  ipcMain.handle('term:kill', (_e, id: number) => { sessions.get(id)?.kill(); sessions.delete(id) })
}
