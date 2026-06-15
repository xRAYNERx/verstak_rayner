export const UPDATE_OWNER = 'frolofpavel'
export const UPDATE_REPO = 'verstak'

const SEMVER_RE = /^v?(\d+\.\d+\.\d+)/

export function normalizeVersion(raw: string): string {
  const m = raw.trim().match(SEMVER_RE)
  return m ? m[1] : raw.trim().replace(/^v/, '')
}

export function semverGt(a: string, b: string): boolean {
  const pa = normalizeVersion(a).split('.').map(n => Number(n) || 0)
  const pb = normalizeVersion(b).split('.').map(n => Number(n) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0
    const db = pb[i] ?? 0
    if (da > db) return true
    if (da < db) return false
  }
  return false
}

export function maxSemver(versions: string[]): string | null {
  let best: string | null = null
  for (const v of versions) {
    const n = normalizeVersion(v)
    if (!SEMVER_RE.test(n)) continue
    if (!best || semverGt(n, best)) best = n
  }
  return best
}

export function releaseFeedBase(version: string): string {
  return `https://github.com/${UPDATE_OWNER}/${UPDATE_REPO}/releases/download/v${normalizeVersion(version)}`
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Verstak-Updater' },
    })
    if (!res.ok) return null
    return await res.json() as T
  } catch {
    return null
  }
}

async function fetchPackageJsonVersion(): Promise<string | null> {
  try {
    const res = await fetch(
      `https://raw.githubusercontent.com/${UPDATE_OWNER}/${UPDATE_REPO}/main/package.json`,
      { headers: { 'User-Agent': 'Verstak-Updater' } },
    )
    if (res.ok) {
      const pkg = await res.json() as { version?: string }
      if (pkg.version) return normalizeVersion(pkg.version)
    }
  } catch { /* ignore */ }
  return null
}

/** Последняя версия: max(GitHub Release, semver-теги, package.json на main). */
export async function fetchRemoteVersion(): Promise<string | null> {
  const candidates: string[] = []

  const latestRelease = await fetchJson<{ tag_name?: string; name?: string }>(
    `https://api.github.com/repos/${UPDATE_OWNER}/${UPDATE_REPO}/releases/latest`,
  )
  if (latestRelease?.tag_name || latestRelease?.name) {
    candidates.push(normalizeVersion(latestRelease.tag_name || latestRelease.name || ''))
  }

  const tags = await fetchJson<Array<{ name: string }>>(
    `https://api.github.com/repos/${UPDATE_OWNER}/${UPDATE_REPO}/tags?per_page=30`,
  )
  const fromTags = maxSemver((tags ?? []).map(t => t.name))
  if (fromTags) candidates.push(fromTags)

  const fromPkg = await fetchPackageJsonVersion()
  if (fromPkg) candidates.push(fromPkg)

  return maxSemver(candidates)
}

/** electron-updater часто падает, если на GitHub ещё нет Release с latest.yml — это не сбой для пользователя. */
export function isBenignUpdaterError(message: string): boolean {
  const m = message.toLowerCase()
  return (
    m.includes('404')
    || m.includes('not found')
    || m.includes('latest.yml')
    || m.includes('no published')
    || m.includes('cannot find')
    || m.includes('net::')
    || m.includes('httperror')
  )
}

export async function releaseArtifactsReady(version: string): Promise<boolean> {
  try {
    const res = await fetch(`${releaseFeedBase(version)}/latest.yml`, {
      headers: { 'User-Agent': 'Verstak-Updater' },
    })
    return res.ok
  } catch {
    return false
  }
}