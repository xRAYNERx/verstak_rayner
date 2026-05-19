import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  projects: {
    pick: () => ipcRenderer.invoke('projects:pick'),
    setCurrent: (path: string | null) => ipcRenderer.invoke('projects:set-current', path)
  },
  files: {
    tree: (root: string) => ipcRenderer.invoke('files:tree', root),
    read: (path: string) => ipcRenderer.invoke('files:read', path)
  },
  settings: {
    getKey: (key: string) => ipcRenderer.invoke('settings:get-key', key),
    setKey: (key: string, value: string) => ipcRenderer.invoke('settings:set-key', key, value)
  },
  ai: {
    send: (messages: unknown[], projectPath: string | null) =>
      ipcRenderer.invoke('ai:send', messages, projectPath),
    resolveWrite: (callId: string, accept: boolean) =>
      ipcRenderer.invoke('ai:resolve-write', callId, accept),
    resolveCommand: (callId: string, accept: boolean) =>
      ipcRenderer.invoke('ai:resolve-command', callId, accept),
    onEvent: (cb: (data: { id: number; event: unknown }) => void) => {
      const handler = (_e: unknown, data: { id: number; event: unknown }) => cb(data)
      ipcRenderer.on('ai:event', handler)
      return () => { ipcRenderer.off('ai:event', handler) }
    }
  },
  chats: {
    list: (projectPath: string) => ipcRenderer.invoke('chats:list', projectPath),
    append: (projectPath: string, role: 'user' | 'assistant', content: string) =>
      ipcRenderer.invoke('chats:append', projectPath, role, content)
  },
  term: {
    spawn: (cwd: string) => ipcRenderer.invoke('term:spawn', cwd) as Promise<number>,
    write: (id: number, data: string) => ipcRenderer.invoke('term:write', id, data),
    resize: (id: number, cols: number, rows: number) => ipcRenderer.invoke('term:resize', id, cols, rows),
    kill: (id: number) => ipcRenderer.invoke('term:kill', id),
    onData: (cb: (data: { id: number; data: string }) => void) => {
      const handler = (_e: unknown, data: { id: number; data: string }) => cb(data)
      ipcRenderer.on('term:data', handler)
      return () => { ipcRenderer.off('term:data', handler) }
    },
    onExit: (cb: (data: { id: number }) => void) => {
      const handler = (_e: unknown, data: { id: number }) => cb(data)
      ipcRenderer.on('term:exit', handler)
      return () => { ipcRenderer.off('term:exit', handler) }
    }
  }
})
