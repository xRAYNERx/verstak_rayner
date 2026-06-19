import type { Database } from 'better-sqlite3'
import { basename } from 'path'
import { pickProjectColor } from '../../src/lib/project-avatar'
import { sortProjectsByName } from '../../src/lib/project-sort'
import type { RemoteSource } from '../projects/remote-source'

/** local — обычная папка; git — клонированный репо; ssh — файлы на сервере (live). */
export type ProjectKind = 'local' | 'git' | 'ssh'

export interface ProjectMeta {
  path: string
  name: string
  color: string
  iconPath: string | null
  lastOpenedAt: number
  hidden: boolean
  /** Тип источника проекта (по умолчанию 'local'). */
  kind: ProjectKind
  /** Параметры удалённого источника (git/ssh). null для локального. */
  remote: RemoteSource | null
}

export interface ProjectMetaPatch {
  name?: string
  iconPath?: string | null
  hidden?: boolean
}

export interface Projects {
  list: () => ProjectMeta[]
  upsert: (path: string) => ProjectMeta
  /** Создать удалённый проект (git/ssh) с уже разобранным источником. */
  createRemote: (path: string, kind: 'git' | 'ssh', remote: RemoteSource) => ProjectMeta
  touch: (path: string) => void
  rename: (path: string, name: string) => void
  updateMeta: (path: string, patch: ProjectMetaPatch) => ProjectMeta | null
  remove: (path: string) => void
}

const SELECT_COLS = 'path, name, color, icon_path as iconPath, last_opened_at as lastOpenedAt, hidden, kind, remote_json as remoteJson'

function parseRemote(json: string | null | undefined): RemoteSource | null {
  if (!json) return null
  try { return JSON.parse(json) as RemoteSource } catch { return null }
}

function mapRow(row: ProjectMeta & { icon_path?: string | null; hidden?: number | boolean; kind?: string; remoteJson?: string | null; remote_json?: string | null }): ProjectMeta {
  return {
    path: row.path,
    name: row.name,
    color: row.color,
    iconPath: row.iconPath ?? row.icon_path ?? null,
    lastOpenedAt: row.lastOpenedAt,
    hidden: Boolean(row.hidden),
    kind: (row.kind as ProjectKind) ?? 'local',
    remote: parseRemote(row.remoteJson ?? row.remote_json)
  }
}

export function createProjects(db: Database): Projects {
  return {
    list() {
      const rows = db.prepare(`SELECT ${SELECT_COLS} FROM projects`).all() as ProjectMeta[]
      return sortProjectsByName(rows.map(mapRow))
    },
    upsert(path) {
      const now = Date.now()
      const existing = db.prepare(`SELECT ${SELECT_COLS} FROM projects WHERE path = ?`).get(path) as ProjectMeta | undefined
      if (existing) {
        return mapRow(existing)
      }
      const name = basename(path) || path
      const color = pickProjectColor(path)
      // hidden задаём явно (а не полагаемся на DEFAULT 0 миграции) — ревью:
      // явное значение надёжнее при изменении дефолтов в будущем.
      db.prepare('INSERT INTO projects (path, name, color, icon_path, last_opened_at, hidden) VALUES (?, ?, ?, NULL, ?, 0)').run(path, name, color, now)
      return { path, name, color, iconPath: null, lastOpenedAt: now, hidden: false, kind: 'local', remote: null }
    },
    createRemote(path, kind, remote) {
      const now = Date.now()
      const existing = db.prepare(`SELECT ${SELECT_COLS} FROM projects WHERE path = ?`).get(path) as ProjectMeta | undefined
      if (existing) return mapRow(existing)
      const name = remote.name || basename(path) || path
      const color = pickProjectColor(path)
      db.prepare('INSERT INTO projects (path, name, color, icon_path, last_opened_at, hidden, kind, remote_json) VALUES (?, ?, ?, NULL, ?, 0, ?, ?)')
        .run(path, name, color, now, kind, JSON.stringify(remote))
      return { path, name, color, iconPath: null, lastOpenedAt: now, hidden: false, kind, remote }
    },
    touch(path) {
      db.prepare('UPDATE projects SET last_opened_at = ? WHERE path = ?').run(Date.now(), path)
    },
    rename(path, name) {
      db.prepare('UPDATE projects SET name = ? WHERE path = ?').run(name.trim(), path)
    },
    updateMeta(path, patch) {
      const row = db.prepare(`SELECT ${SELECT_COLS} FROM projects WHERE path = ?`).get(path) as ProjectMeta | undefined
      if (!row) return null
      const name = patch.name !== undefined ? patch.name.trim() : row.name
      const iconPath = patch.iconPath !== undefined ? patch.iconPath : (row.iconPath ?? null)
      const hidden = patch.hidden !== undefined ? (patch.hidden ? 1 : 0) : (row.hidden ? 1 : 0)
      db.prepare('UPDATE projects SET name = ?, icon_path = ?, hidden = ? WHERE path = ?').run(name, iconPath, hidden, path)
      return mapRow({ ...row, name, iconPath, hidden: Boolean(hidden) })
    },
    remove(path) {
      db.prepare('DELETE FROM projects WHERE path = ?').run(path)
    }
  }
}
