/**
 * Восстанавливает pending-кэш electron-updater из installer.exe в корне verstak-updater.
 * Запуск: node scripts/repair-updater-cache.mjs [version]
 */
import { createHash } from 'crypto'
import {
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const version = process.argv[2] || '1.5.7'
const cacheRoot = join(homedir(), 'AppData', 'Local', 'verstak-updater')
const pending = join(cacheRoot, 'pending')

async function hashFileSha512Base64(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha512')
    const stream = createReadStream(filePath, { highWaterMark: 4 * 1024 * 1024 })
    stream.on('data', chunk => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('base64')))
  })
}

function parseLatestYml(yml) {
  const pathMatch = yml.match(/^path:\s*(.+)$/m)
  const shaMatch = yml.match(/^sha512:\s*(.+)$/m)
  const sizeMatch = yml.match(/^\s+size:\s*(\d+)$/m)
  if (!pathMatch?.[1] || !shaMatch?.[1]) return null
  return {
    fileName: pathMatch[1].trim(),
    sha512: shaMatch[1].trim(),
    size: sizeMatch?.[1] ? Number(sizeMatch[1]) : 0,
  }
}

const ymlUrl = `https://github.com/frolofpavel/verstak/releases/download/v${version}/latest.yml`
const ymlRes = await fetch(ymlUrl, { headers: { 'User-Agent': 'Verstak-Repair' } })
if (!ymlRes.ok) {
  console.error('latest.yml fetch failed:', ymlRes.status)
  process.exit(1)
}
const meta = parseLatestYml(await ymlRes.text())
if (!meta) {
  console.error('failed to parse latest.yml')
  process.exit(1)
}

const candidates = [
  join(cacheRoot, 'installer.exe'),
  join(cacheRoot, meta.fileName),
  join(pending, meta.fileName),
  join(pending, 'installer.exe'),
]

let source = null
for (const p of candidates) {
  if (!existsSync(p)) continue
  const size = statSync(p).size
  if (meta.size > 0 && size !== meta.size) {
    console.log('skip size mismatch:', p, size, '!=', meta.size)
    continue
  }
  const hash = await hashFileSha512Base64(p)
  if (hash !== meta.sha512) {
    console.log('skip sha mismatch:', p)
    continue
  }
  source = p
  break
}

if (!source) {
  console.error('no matching installer in cache')
  process.exit(1)
}

const target = join(pending, meta.fileName)
mkdirSync(pending, { recursive: true })
if (source !== target) copyFileSync(source, target)

writeFileSync(join(pending, 'update-info.json'), JSON.stringify({
  fileName: meta.fileName,
  sha512: meta.sha512,
  isAdminRightsRequired: false,
}))

for (const name of ['installer.exe', 'current.blockmap']) {
  const p = join(cacheRoot, name)
  if (existsSync(p)) rmSync(p, { force: true })
}

console.log('OK: repaired pending cache for', version)
console.log('  source:', source)
console.log('  target:', target)