export interface FileNode {
  name: string
  path: string  // absolute
  isDirectory: boolean
  children?: FileNode[]
  collapsed?: boolean
  fileCount?: number
  sizeBytes?: number
  truncated?: boolean
}
