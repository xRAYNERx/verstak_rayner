/**
 * Пересборка нативных модулей под Electron с обходом двух Windows-граблей,
 * из-за которых node-pty не собирался и терминал был мёртв (см. dev-journal 18.06):
 *
 *  1) NoDefaultCurrentDirectoryInExePath=1 (выставлено в системе Павла) → cmd не
 *     ищет исполняемые в текущей папке → winpty.gyp не находит GetCommitHash.bat.
 *  2) Нет Spectre-mitigated VS-библиотек → conpty/winpty падают с MSB8040.
 *
 * Снимаем env-переменную и отключаем SpectreMitigation в gyp-файлах node-pty
 * (идемпотентно — переживает npm install), затем electron-rebuild обоих натив-модулей.
 */
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const ptyDir = path.join(root, 'node_modules', '@homebridge', 'node-pty-prebuilt-multiarch')

// 1) Отключаем SpectreMitigation в gyp node-pty (binding.gyp + winpty подпроект).
for (const rel of ['binding.gyp', path.join('deps', 'winpty', 'src', 'winpty.gyp')]) {
  const f = path.join(ptyDir, rel)
  if (!fs.existsSync(f)) continue
  const before = fs.readFileSync(f, 'utf8')
  const after = before.replace(/'SpectreMitigation':\s*'Spectre'/g, "'SpectreMitigation': 'false'")
  if (after !== before) {
    fs.writeFileSync(f, after)
    console.log('[rebuild-native] SpectreMitigation off →', rel)
  }
}

// 2) Снимаем env-переменную, ломающую поиск GetCommitHash.bat в winpty-сборке.
const env = { ...process.env }
delete env.NoDefaultCurrentDirectoryInExePath

const targets = 'better-sqlite3,@homebridge/node-pty-prebuilt-multiarch'
console.log('[rebuild-native] electron-rebuild -f -o', targets)
execFileSync('npx', ['electron-rebuild', '-f', '-o', targets], { cwd: root, env, stdio: 'inherit', shell: true })
