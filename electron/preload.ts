import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  projects: { pick: () => ipcRenderer.invoke('projects:pick') },
  files: {
    tree: (root: string) => ipcRenderer.invoke('files:tree', root),
    read: (path: string) => ipcRenderer.invoke('files:read', path)
  },
  settings: {
    getKey: (key: string) => ipcRenderer.invoke('settings:get-key', key),
    setKey: (key: string, value: string) => ipcRenderer.invoke('settings:set-key', key, value)
  },
  ai: {
    send: (messages: unknown[]) => ipcRenderer.invoke('ai:send', messages),
    onEvent: (cb: (data: { id: number; event: unknown }) => void) => {
      const handler = (_e: unknown, data: { id: number; event: unknown }) => cb(data)
      ipcRenderer.on('ai:event', handler)
      return () => { ipcRenderer.off('ai:event', handler) }
    }
  }
})
