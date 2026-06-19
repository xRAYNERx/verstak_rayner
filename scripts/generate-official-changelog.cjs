#!/usr/bin/env node
/**
 * Генерирует electron/official-changelog.ts из ENTRIES в sync-verstak-changelog.cjs.
 * Запуск: node scripts/generate-official-changelog.cjs
 */
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const ROOT = path.join(__dirname, '..')
const SRC = path.join(__dirname, 'sync-verstak-changelog.cjs')
const OUT = path.join(ROOT, 'electron', 'official-changelog.ts')

function loadEntries() {
  const code = fs.readFileSync(SRC, 'utf8')
  const start = code.indexOf('const ENTRIES = [')
  if (start < 0) throw new Error('ENTRIES not found in sync-verstak-changelog.cjs')
  let depth = 0
  let end = -1
  for (let i = code.indexOf('[', start); i < code.length; i++) {
    const ch = code[i]
    if (ch === '[') depth += 1
    else if (ch === ']') {
      depth -= 1
      if (depth === 0) {
        end = i + 1
        break
      }
    }
  }
  if (end < 0) throw new Error('ENTRIES array end not found')
  const literal = code.slice(code.indexOf('[', start), end)
  return vm.runInNewContext(`(${literal})`, {}, { filename: SRC })
}

function parseRuDate(s) {
  const m = String(s || '').match(/(\d{2})\.(\d{2})\.(\d{4})/)
  if (!m) return undefined
  const [, dd, mm, yyyy] = m
  return `${yyyy}-${mm}-${dd}T12:00:00Z`
}

function normalizeVersion(raw) {
  const m = String(raw || '').trim().match(/^v?(\d+\.\d+\.\d+)/)
  return m ? m[1] : String(raw || '').trim().replace(/^v/, '')
}

function semverGt(a, b) {
  const pa = normalizeVersion(a).split('.').map((n) => Number(n) || 0)
  const pb = normalizeVersion(b).split('.').map((n) => Number(n) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0
    const db = pb[i] ?? 0
    if (da > db) return true
    if (da < db) return false
  }
  return false
}

function entryVersion(entry) {
  return entry.version || entry.treeVersion || null
}

function buildNoteBody(entries) {
  const lines = []
  for (const entry of entries) {
    lines.push(`### ${entry.title}`)
    for (const change of entry.changes || []) {
      lines.push(`- ${change}`)
    }
  }
  return lines.join('\n')
}

function buildNotesFromEntries(entries) {
  const byVersion = new Map()
  for (const entry of entries) {
    const version = entryVersion(entry)
    if (!version) continue
    const key = normalizeVersion(version)
    if (!byVersion.has(key)) byVersion.set(key, [])
    byVersion.get(key).push(entry)
  }

  const notes = []
  for (const [version, group] of byVersion) {
    const publishedAt = parseRuDate(
      group.find((e) => e.build || e.deployed)?.build
        || group.find((e) => e.build || e.deployed)?.deployed,
    )
    notes.push({
      version,
      name: `Verstak ${version}`,
      publishedAt,
      body: buildNoteBody(group),
      htmlUrl: `https://github.com/frolofpavel/verstak/releases/tag/v${version}`,
    })
  }

  notes.sort((a, b) => {
    if (semverGt(a.version, b.version)) return -1
    if (semverGt(b.version, a.version)) return 1
    return 0
  })
  return notes
}

module.exports = { buildNotesFromEntries, entryVersion, normalizeVersion, semverGt }

const entries = loadEntries()
const notes = buildNotesFromEntries(entries)

const header = `import type { ReleaseNote } from './update-remote'
import { normalizeVersion, semverGt } from './update-remote'

/** Автоген из scripts/sync-verstak-changelog.cjs — не править вручную. */
export const OFFICIAL_NOTES: ReleaseNote[] = `

const footer = `

function inVersionRange(note: ReleaseNote, since: string, upTo: string): boolean {
  const v = normalizeVersion(note.version)
  return semverGt(v, since) && !semverGt(v, upTo)
}

export function getAllOfficialReleaseNotes(): ReleaseNote[] {
  return OFFICIAL_NOTES.map(note => ({ ...note }))
}

export function getOfficialReleaseNote(version: string): ReleaseNote | undefined {
  const key = normalizeVersion(version)
  return OFFICIAL_NOTES.find(note => normalizeVersion(note.version) === key)
}

export function getOfficialReleaseNotesInRange(sinceVersion: string, upToVersion: string): ReleaseNote[] {
  const since = normalizeVersion(sinceVersion)
  const upTo = normalizeVersion(upToVersion)
  return OFFICIAL_NOTES.filter(note => inVersionRange(note, since, upTo))
}
`

const body = JSON.stringify(notes, null, 2)
  .replace(/"([^"]+)":/g, '$1:')
  .replace(/"/g, "'")

fs.writeFileSync(OUT, `${header}${body}${footer}`)
console.log(`[generate-official-changelog] ${notes.length} versions → electron/official-changelog.ts`)