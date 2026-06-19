import { app, dialog } from 'electron'
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'fs'
import { dirname, join } from 'path'

export type NativeProbeResult = 'ok' | 'missing' | 'abi_mismatch' | 'unknown'

/** Путь к better_sqlite3.node в установленной сборке (Electron ABI). */
export function betterSqlite3NodePath(): string {
  return join(
    process.resourcesPath,
    'app.asar.unpacked',
    'node_modules',
    'better-sqlite3',
    'build',
    'Release',
    'better_sqlite3.node',
  )
}

/** Резервная копия .node из текущей сборки (кладётся в afterPack). */
export function betterSqlite3FixSourcePath(): string {
  return join(process.resourcesPath, 'native-fix', 'better_sqlite3.node')
}

export function probeBetterSqlite3Node(nodePath: string): NativeProbeResult {
  if (!existsSync(nodePath)) return 'missing'
  try {
    process.dlopen({ exports: {} }, nodePath)
    return 'ok'
  } catch (err) {
    const text = String(err instanceof Error ? err.message : err)
    if (/NODE_MODULE_VERSION/.test(text)) return 'abi_mismatch'
    return 'unknown'
  }
}

export function repairBetterSqlite3FromBundle(): boolean {
  const target = betterSqlite3NodePath()
  const source = betterSqlite3FixSourcePath()
  if (!existsSync(source)) return false
  mkdirSync(dirname(target), { recursive: true })
  copyFileSync(source, target)
  return probeBetterSqlite3Node(target) === 'ok'
}

/**
 * После robocopy /MIR или частичного апдейта в app.asar.unpacked может остаться
 * better_sqlite3.node под Node ABI — Electron не откроет verstak.db.
 * Восстанавливаем из native-fix/ той же сборки до загрузки better-sqlite3.
 */
export function ensureBetterSqlite3Healthy(): void {
  if (!app.isPackaged) return

  const target = betterSqlite3NodePath()
  let probe = probeBetterSqlite3Node(target)

  if (probe === 'ok') return

  if (probe === 'abi_mismatch') {
    try {
      const buildDir = join(
        process.resourcesPath,
        'app.asar.unpacked',
        'node_modules',
        'better-sqlite3',
        'build',
      )
      if (existsSync(buildDir)) rmSync(buildDir, { recursive: true, force: true })
    } catch {
      // best-effort
    }
    probe = probeBetterSqlite3Node(target)
  }

  if (probe !== 'ok' && repairBetterSqlite3FromBundle()) return

  const hint =
    probe === 'abi_mismatch'
      ? 'После обновления остался старый native-модуль SQLite (несовпадение ABI).\n\n'
      : probe === 'missing'
        ? 'Не найден native-модуль SQLite в папке приложения.\n\n'
        : ''

  dialog.showErrorBox(
    'Verstak: не удалось подготовить базу данных',
    `${hint}Что сделать:\n` +
      '1. Закрой все копии Verstak\n' +
      '2. Переустанови или выполни: npm run deploy:local\n' +
      '3. Запусти Verstak снова\n\n' +
      `Путь модуля: ${target}`,
  )
  app.exit(1)
}

export function isNativeModuleError(message: string): boolean {
  return /NODE_MODULE_VERSION|better_sqlite3\.node|was compiled against a different/i.test(message)
}