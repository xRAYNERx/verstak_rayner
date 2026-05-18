export interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FileNode[]
}

declare global {
  interface Window {
    api: {
      projects: { pick: () => Promise<string | null> }
      files: {
        tree: (root: string) => Promise<FileNode[]>
        read: (path: string) => Promise<string>
      }
    }
  }
}

export {}
