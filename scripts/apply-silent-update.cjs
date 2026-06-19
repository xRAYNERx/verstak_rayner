#!/usr/bin/env node
/**
 * Тихая установка обновления: распаковка Setup → app-payload.7z → robocopy в installDir.
 * Вызывается из watchdog PowerShell после выхода Verstak.
 *
 * node scripts/apply-silent-update.cjs --installer=... --install-dir=... --seven-zip=...
 */
const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')

function parseArgs(argv) {
  const out = { installer: '', installDir: '', sevenZip: '', restart: true }
  for (const raw of argv) {
    if (raw.startsWith('--installer=')) out.installer = raw.slice('--installer='.length)
    else if (raw.startsWith('--install-dir=')) out.installDir = raw.slice('--install-dir='.length)
    else if (raw.startsWith('--seven-zip=')) out.sevenZip = raw.slice('--seven-zip='.length)
    else if (raw === '--no-restart') out.restart = false
  }
  return out
}

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    encoding: 'utf8',
    windowsHide: true,
    shell: false,
    ...opts,
  })
  return result
}

function extract7z(sevenZip, archivePath, outDir) {
  fs.mkdirSync(outDir, { recursive: true })
  const result = run(sevenZip, ['x', archivePath, `-o${outDir}`, '-y', '-bso0', '-bsp0'])
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim()
    throw new Error(detail || `7za failed (${result.status})`)
  }
}

function findFileRecursive(root, fileName) {
  const stack = [root]
  while (stack.length) {
    const dir = stack.pop()
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name)
      if (entry.isFile() && entry.name.toLowerCase() === fileName.toLowerCase()) return abs
      if (entry.isDirectory()) stack.push(abs)
    }
  }
  return null
}

function verifyPayloadRoot(root) {
  for (const rel of ['Verstak.exe', path.join('resources', 'app.asar')]) {
    const abs = path.join(root, rel)
    if (!fs.existsSync(abs) || fs.statSync(abs).size <= 0) {
      throw new Error(`Повреждён payload: отсутствует ${rel}`)
    }
  }
}

function removeStaleUnpacked(installDir) {
  const unpacked = path.join(installDir, 'resources', 'app.asar.unpacked')
  if (fs.existsSync(unpacked)) {
    fs.rmSync(unpacked, { recursive: true, force: true })
  }
}

function robocopyPayload(payloadRoot, installDir) {
  const result = run('robocopy', [
    payloadRoot,
    installDir,
    '/E',
    '/XD',
    'locales',
    '/NFL',
    '/NDL',
    '/NJH',
    '/NJS',
    '/NP',
  ])
  const code = result.status ?? 1
  if (code >= 8) {
    throw new Error(`robocopy failed with code ${code}`)
  }
}

function launchApp(installDir) {
  const exe = path.join(installDir, 'Verstak.exe')
  if (!fs.existsSync(exe)) throw new Error('Verstak.exe not found after update')
  const result = run('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    `Start-Process -FilePath '${exe.replace(/'/g, "''")}'`,
  ])
  if (result.status !== 0) {
    throw new Error('Failed to restart Verstak')
  }
}

function trySilentSetup(installerPath, installDir) {
  const result = run(installerPath, [
    '--silent',
    `--install-dir=${installDir}`,
    '--restart',
  ])
  return (result.status ?? 1) === 0
}

function applySilentUpdate(opts) {
  const installer = path.resolve(opts.installer)
  const installDir = path.resolve(opts.installDir)
  let sevenZip = opts.sevenZip ? path.resolve(opts.sevenZip) : ''

  if (!fs.existsSync(installer)) throw new Error(`Installer not found: ${installer}`)
  if (!fs.existsSync(installDir)) throw new Error(`Install dir not found: ${installDir}`)

  const workDir = path.join(os.tmpdir(), 'verstak-update', String(Date.now()))
  const setupRoot = path.join(workDir, 'setup')
  const payloadRoot = path.join(workDir, 'payload')

  try {
    if (!sevenZip || !fs.existsSync(sevenZip)) {
      if (trySilentSetup(installer, installDir)) return { ok: true, method: 'setup-silent' }
      throw new Error('7za.exe not found in app resources and Setup --silent failed')
    }

    extract7z(sevenZip, installer, setupRoot)
    const payloadArchive = findFileRecursive(setupRoot, 'app-payload.7z')
    if (!payloadArchive) {
      if (trySilentSetup(installer, installDir)) return { ok: true, method: 'setup-silent' }
      throw new Error('app-payload.7z not found in Setup archive')
    }

    extract7z(sevenZip, payloadArchive, payloadRoot)
    verifyPayloadRoot(payloadRoot)
    removeStaleUnpacked(installDir)
    robocopyPayload(payloadRoot, installDir)

    if (opts.restart) launchApp(installDir)
    return { ok: true, method: 'payload-robocopy' }
  } finally {
    try {
      fs.rmSync(workDir, { recursive: true, force: true })
    } catch {
      // ignore cleanup errors
    }
  }
}

if (require.main === module) {
  try {
    const opts = parseArgs(process.argv.slice(2))
    const result = applySilentUpdate(opts)
    console.log(`[apply-silent-update] ok (${result.method})`)
    process.exit(0)
  } catch (err) {
    console.error('[apply-silent-update]', err instanceof Error ? err.message : err)
    process.exit(1)
  }
}

module.exports = { applySilentUpdate, parseArgs, findFileRecursive, removeStaleUnpacked }