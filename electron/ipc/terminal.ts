import { ipcMain, BrowserWindow } from 'electron'
import * as pty from '@homebridge/node-pty-prebuilt-multiarch'

const sessions = new Map<number, pty.IPty>()

export function registerTerminalIpc(): void {
  ipcMain.handle('term:spawn', (e, cwd: string) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return -1
    const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash'
    const p = pty.spawn(shell, [], { cwd, cols: 100, rows: 30, env: process.env as Record<string, string> })
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
