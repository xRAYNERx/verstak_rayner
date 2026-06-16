const fs = require('fs')
const path = require('path')
const asar = require('@electron/asar')

const instAsar = path.join(process.env.LOCALAPPDATA, 'Programs', 'Verstak', 'resources', 'app.asar')
const buildAsar = path.join(__dirname, '..', 'release', 'win-unpacked', 'resources', 'app.asar')

function inspect(label, asarPath) {
  const listing = asar.listPackage(asarPath)
  const js = listing.find(f => /out[\\/]renderer[\\/]assets[\\/]index-.*\.js$/.test(f))
  const pkgBuf = asar.extractFile(asarPath, 'package.json')
  const version = JSON.parse(pkgBuf.toString('utf8')).version
  let jsBuf = Buffer.alloc(0)
  if (js) {
    for (const candidate of [js, js.replace(/^\\+/, ''), js.replace(/\\/g, '/')]) {
      try {
        jsBuf = asar.extractFile(asarPath, candidate)
        break
      } catch { /* try next */ }
    }
  }
  const text = jsBuf.toString('utf8')
  const stat = fs.statSync(asarPath)
  console.log(`\n[${label}]`)
  console.log('  version:', version)
  console.log('  asar:', stat.mtime.toISOString(), stat.size)
  console.log('  bundle:', js || 'n/a')
  console.log('  viewReleaseNotes:', text.includes('viewReleaseNotes'))
  console.log('  WhatsNewModal:', text.includes('WhatsNewModal'))
}

inspect('installed', instAsar)
if (fs.existsSync(buildAsar)) inspect('build', buildAsar)