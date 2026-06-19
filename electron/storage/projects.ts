import type { Database } from 'better-sqlite3'
import { basename } from 'path'
import { pickProjectColor } from '../../src/lib/project-avatar'
import { sortProjectsByName } from '../../src/lib/project-sort'

export interface ProjectMeta {
  path: string
  name: string
  color: string
  iconPath: string | null
  lastOpenedAt: number
  hidden: boolean
}

export interface ProjectMetaPatch {
  name?: string
  iconPath?: string | null
  hidden?: boolean
}

export interface Projects {
  list: () => ProjectMeta[]
  upsert: (path: string) => ProjectMeta
  touch: (path: string) => void
  rename: (path: string, name: string) => void
  updateMeta: (path: string, patch: ProjectMetaPatch) => ProjectMeta | null
  remove: (path: string) => void
}

function mapRow(row: ProjectMeta & { icon_path?: string | null; hidden?: number | boolean }): ProjectMeta {
  return {
    path: row.path,
    name: row.name,
    color: row.color,
    iconPath: row.iconPath ?? row.icon_path ?? null,
    lastOpenedAt: row.lastOpenedAt,
    hidden: Boolean(row.hidden)
  }
}

export function createProjects(db: Database): Projects {
  return {
    list() {
      const rows = db.prepare(`
        SELECT path, name, color, icon_path as iconPath, last_opened_at as lastOpenedAt, hidden
        FROM projects
      `).all() as ProjectMeta[]
      return sortProjectsByName(rows.map(mapRow))
    },
    upsert(path) {
      const now = Date.now()
      const existing = db.prepare(
        'SELECT path, name, color, icon_path as iconPath, last_opened_at as lastOpenedAt, hidden FROM projects WHERE path = ?'
      ).get(path) as ProjectMeta | undefined
      if (existing) {
        return mapRow(existing)
      }
      const name = basename(path) || path
      const color = pickProjectColor(path)
      // hidden задаём явно (а не полагаемся на DEFAULT 0 миграции) — ревью:
      // явное значение надёжнее при изменении дефолтов в будущем.
      db.prepare('INSERT INTO projects (path, name, color, icon_path, last_opened_at, hidden) VALUES (?, ?, ?, NULL, ?, 0)').run(path, name, color, now)
      return { path, name, color, iconPath: null, lastOpenedAt: now, hidden: false }
    },
    touch(path) {
      db.prepare('UPDATE projects SET last_opened_at = ? WHERE path = ?').run(Date.now(), path)
    },
    rename(path, name) {
      db.prepare('UPDATE projects SET name = ? WHERE path = ?').run(name.trim(), path)
    },
    updateMeta(path, patch) {
      const row = db.prepare(
        'SELECT path, name, color, icon_path as iconPath, last_opened_at as lastOpenedAt, hidden FROM projects WHERE path = ?'
      ).get(path) as ProjectMeta | undefined
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
