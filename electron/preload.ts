import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  projects: {
    pick: () => ipcRenderer.invoke('projects:pick') as Promise<string | null>
  },
  files: {
    tree: (root: string) => ipcRenderer.invoke('files:tree', root),
    read: (path: string) => ipcRenderer.invoke('files:read', path) as Promise<string>
  }
})
