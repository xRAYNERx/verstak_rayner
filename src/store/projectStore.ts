import { create } from 'zustand'
import type { FileNode, ChatMessage } from '../types/api'

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

interface ProjectState {
  path: string | null
  tree: FileNode[]
  messages: ChatMessage[]
  isStreaming: boolean
  pendingWrite: PendingWrite | null
  pendingCommand: PendingCommand | null
  activity: ActivityEntry[]
  setProject: (path: string) => Promise<void>
  addMessage: (msg: ChatMessage) => void
  updateLastAssistant: (text: string) => void
  setStreaming: (v: boolean) => void
  setPendingWrite: (w: PendingWrite | null) => void
  setPendingCommand: (c: PendingCommand | null) => void
  pushActivity: (entry: ActivityEntry) => void
  updateActivity: (id: string, patch: Partial<ActivityEntry>) => void
  clearActivity: () => void
}

export const useProject = create<ProjectState>((set) => ({
  path: null,
  tree: [],
  messages: [],
  isStreaming: false,
  pendingWrite: null,
  pendingCommand: null,
  activity: [],
  setProject: async (path) => {
    const tree = await window.api.files.tree(path)
    const history = await window.api.chats.list(path)
    await window.api.projects.setCurrent(path)
    set({
      path,
      tree,
      messages: history.map(m => ({ role: m.role, content: m.content })),
      pendingWrite: null,
      pendingCommand: null,
      activity: []
    })
  },
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
