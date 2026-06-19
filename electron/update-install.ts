import { spawn } from 'child_process'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { tmpdir } from 'os'
import { app } from 'electron'
import { fetchReleaseArtifactMeta } from './update-remote'
import { reconcileCachedDownload } from './updater-cache'

export function currentInstallDir(): string {
  return dirname(process.execPath)
}

export function resourcesDir(): string {
  return join(dirname(process.execPath), 'resources')
}

export function sevenZipPath(): string {
  return join(resourcesDir(), '7za.exe')
}

export async function resolveInstallerForVersion(version: string): Promise<string | null> {
  const meta = await fetchReleaseArtifactMeta(version)
  if (!meta) return null
  return reconcileCachedDownload(meta.fileName, meta.sha512, meta.size)
}

function psQuotePath(value: string): string {
  return value.replace(/'/g, "''")
}

/**
 * Detached watchdog: ждёт завершения Verstak, распаковывает Setup → payload → robocopy,
 * перезапускает приложение. Fallback — Setup --silent.
 */
export function spawnSilentUpdateWatchdog(
  installerPath: string,
  installDir: string,
  parentPid: number,
): void {
  const workDir = join(tmpdir(), 'verstak-update')
  mkdirSync(workDir, { recursive: true })
  const scriptPath = join(workDir, `apply-${Date.now()}.ps1`)
  const setup = psQuotePath(installerPath)
  const target = psQuotePath(installDir)
  const sevenZip = psQuotePath(sevenZipPath())

  const script = `$ErrorActionPreference = 'Stop'
$parent = ${parentPid}
$setup = '${setup}'
$target = '${target}'
$sevenZip = '${sevenZip}'
$work = Join-Path $env:TEMP ('verstak-update\\' + [guid]::NewGuid().ToString('N'))

function Wait-VerstakExit {
  if ($parent -gt 0) {
    Wait-Process -Id $parent -Timeout 180 -ErrorAction SilentlyContinue
  }
  $deadline = (Get-Date).AddSeconds(90)
  while ((Get-Date) -lt $deadline) {
    $alive = Get-Process -Name 'Verstak' -ErrorAction SilentlyContinue
    if (-not $alive) { break }
    Start-Sleep -Milliseconds 400
  }
  Start-Sleep -Seconds 2
}

function Invoke-SevenZip([string]$Archive, [string]$OutDir) {
  New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
  $p = Start-Process -FilePath $sevenZip -ArgumentList @('x', $Archive, "-o$OutDir", '-y', '-bso0', '-bsp0') -PassThru -Wait -WindowStyle Hidden
  if ($p.ExitCode -ne 0) { throw "7za exit $($p.ExitCode)" }
}

function Find-FileRecursive([string]$Root, [string]$Name) {
  $q = New-Object System.Collections.Queue
  $q.Enqueue($Root)
  while ($q.Count -gt 0) {
    $dir = [string]$q.Dequeue()
    Get-ChildItem -LiteralPath $dir -ErrorAction SilentlyContinue | ForEach-Object {
      if ($_.PSIsContainer) { $q.Enqueue($_.FullName) }
      elseif ($_.Name -ieq $Name) { return $_.FullName }
    }
  }
  return $null
}

function Test-PayloadRoot([string]$Root) {
  foreach ($rel in @('Verstak.exe', 'resources\\app.asar')) {
    $abs = Join-Path $Root $rel
    if (-not (Test-Path -LiteralPath $abs)) { throw "payload missing $rel" }
    if ((Get-Item -LiteralPath $abs).Length -le 0) { throw "payload empty $rel" }
  }
}

function Remove-StaleUnpacked([string]$InstallDir) {
  $unpacked = Join-Path $InstallDir 'resources\\app.asar.unpacked'
  if (Test-Path -LiteralPath $unpacked) {
    Remove-Item -LiteralPath $unpacked -Recurse -Force
  }
}

function Invoke-RobocopyPayload([string]$PayloadRoot, [string]$InstallDir) {
  $p = Start-Process -FilePath 'robocopy' -ArgumentList @(
    $PayloadRoot, $InstallDir, '/E', '/XD', 'locales', '/NFL', '/NDL', '/NJH', '/NJS', '/NP'
  ) -PassThru -Wait -WindowStyle Hidden
  if ($p.ExitCode -ge 8) { throw "robocopy exit $($p.ExitCode)" }
}

function Start-Verstak([string]$InstallDir) {
  $exe = Join-Path $InstallDir 'Verstak.exe'
  if (-not (Test-Path -LiteralPath $exe)) { throw 'Verstak.exe missing after update' }
  Start-Process -FilePath $exe | Out-Null
}

function Invoke-SetupSilent {
  $p = Start-Process -FilePath $setup -ArgumentList @('--silent', "--install-dir=$target", '--restart') -PassThru -Wait -WindowStyle Hidden
  return ($p.ExitCode -eq 0)
}

function Invoke-PayloadUpdate {
  if (-not (Test-Path -LiteralPath $sevenZip)) { return $false }
  $setupRoot = Join-Path $work 'setup'
  $payloadRoot = Join-Path $work 'payload'
  Invoke-SevenZip $setup $setupRoot
  $archive = Find-FileRecursive $setupRoot 'app-payload.7z'
  if (-not $archive) { return $false }
  Invoke-SevenZip $archive $payloadRoot
  Test-PayloadRoot $payloadRoot
  Remove-StaleUnpacked $target
  Invoke-RobocopyPayload $payloadRoot $target
  Start-Verstak $target
  return $true
}

try {
  Wait-VerstakExit
  New-Item -ItemType Directory -Force -Path $work | Out-Null
  if (Invoke-PayloadUpdate) { exit 0 }
  if (Invoke-SetupSilent) { exit 0 }
  exit 1
} catch {
  exit 1
} finally {
  if ($work -and (Test-Path -LiteralPath $work)) {
    Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
  }
}
`

  writeFileSync(scriptPath, script, 'utf8')
  const child = spawn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', scriptPath],
    { detached: true, stdio: 'ignore', windowsHide: true },
  )
  child.unref()
}

export async function beginSilentUpdateAndQuit(version: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!app.isPackaged) return { ok: false, reason: 'not-packaged' }

  const installerPath = await resolveInstallerForVersion(version)
  if (!installerPath) return { ok: false, reason: 'installer-missing' }
  if (!existsSync(installerPath)) return { ok: false, reason: 'installer-missing' }

  spawnSilentUpdateWatchdog(installerPath, currentInstallDir(), process.pid)
  app.quit()
  return { ok: true }
}