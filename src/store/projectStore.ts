import { create } from 'zustand'
import type { FileNode, ChatMessage, ProjectMeta } from '../types/api'

interface PendingWrite {
  callId: string
  path: string
  before: string
  after: string
}

interface PendingCommand {
  callId: string
  command: string
}

interface ActivityEntry {
  id: string
  kind: 'read' | 'list' | 'write' | 'command' | 'blocked'
  label: string
  detail?: string
  status: 'pending' | 'ok' | 'rejected' | 'error' | 'blocked'
  timestamp: number
}

export type ViewId = 'chat' | 'tasks' | 'journal' | 'plan' | 'workflow' | 'calendar'

interface ProjectState {
  path: string | null
  tree: FileNode[]
  messages: ChatMessage[]
  isStreaming: boolean
  pendingWrite: PendingWrite | null
  pendingCommand: PendingCommand | null
  activity: ActivityEntry[]
  activeView: ViewId
  projectList: ProjectMeta[]
  setProject: (path: string) => Promise<void>
  closeProject: () => void
  refreshProjectList: () => Promise<void>
  removeProject: (path: string) => Promise<void>
  setActiveView: (v: ViewId) => void
  addMessage: (msg: ChatMessage) => void
  updateLastAssistant: (text: string) => void
  setStreaming: (v: boolean) => void
  setPendingWrite: (w: PendingWrite | null) => void
  setPendingCommand: (c: PendingCommand | null) => void
  pushActivity: (entry: ActivityEntry) => void
  updateActivity: (id: string, patch: Partial<ActivityEntry>) => void
  clearActivity: () => void
}

export const useProject = create<ProjectState>((set, get) => ({
  path: null,
  tree: [],
  messages: [],
  isStreaming: false,
  pendingWrite: null,
  pendingCommand: null,
  activity: [],
  activeView: 'chat',
  projectList: [],
  setProject: async (path) => {
    const tree = await window.api.files.tree(path)
    const history = await window.api.chats.list(path)
    await window.api.projects.setCurrent(path)
    const projectList = await window.api.projects.list()
    set({
      path,
      tree,
      messages: history.map(m => ({ role: m.role, content: m.content })),
      pendingWrite: null,
      pendingCommand: null,
      activity: [],
      activeView: 'chat',
      projectList
    })
  },
  closeProject: () => set({
    path: null,
    tree: [],
    messages: [],
    activity: [],
    pendingWrite: null,
    pendingCommand: null
  }),
  refreshProjectList: async () => {
    const projectList = await window.api.projects.list()
    set({ projectList })
  },
  removeProject: async (path: string) => {
    await window.api.projects.remove(path)
    const projectList = await window.api.projects.list()
    const state = get()
    if (state.path === path) {
      set({ path: null, tree: [], messages: [], projectList })
    } else {
      set({ projectList })
    }
  },
  setActiveView: (v) => set({ activeView: v }),
  addMessage: (msg) => set(s => ({ messages: [...s.messages, msg] })),
  updateLastAssistant: (text) => set(s => {
    const msgs = [...s.messages]
    const last = msgs[msgs.length - 1]
    if (last?.role === 'assistant') msgs[msgs.length - 1] = { ...last, content: last.content + text }
    return { messages: msgs }
  }),
  setStreaming: (v) => set({ isStreaming: v }),
  setPendingWrite: (w) => set({ pendingWrite: w }),
  setPendingCommand: (c) => set({ pendingCommand: c }),
  pushActivity: (entry) => set(s => ({ activity: [...s.activity, entry] })),
  updateActivity: (id, patch) => set(s => ({
    activity: s.activity.map(a => a.id === id ? { ...a, ...patch } : a)
  })),
  clearActivity: () => set({ activity: [] })
}))

export type { ActivityEntry, PendingCommand }
