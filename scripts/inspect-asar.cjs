const asar = require('@electron/asar')
const path = require('path')

const asarPath = path.join(process.env.LOCALAPPDATA, 'Programs', 'Verstak', 'resources', 'app.asar')
const list = asar.listPackage(asarPath)

function extract(rel) {
  const candidates = [rel, `\\${rel}`, rel.replace(/\//g, '\\')]
  for (const c of list) {
    const norm = c.replace(/^\\+/, '').replace(/\\/g, '/')
    if (norm === rel) {
      for (const tryPath of [c, norm, c.replace(/^\\+/, '')]) {
        try { return asar.extractFile(asarPath, tryPath).toString('utf8') } catch { /* */ }
      }
    }
  }
  return null
}

const pre = extract('out/preload/preload.mjs')
const listJs = list.map(f => f.replace(/^\\+/, '').replace(/\\/g, '/')).filter(f => /out\/renderer\/assets\/index-.*\.js$/.test(f))
const js = listJs[0] ? extract(listJs[0]) : null

console.log('preload found:', !!pre)
if (pre) {
  console.log('  getReleaseNotes:', pre.includes('getReleaseNotes'))
  console.log('  update:get-release-notes:', pre.includes('update:get-release-notes'))
}
console.log('renderer:', listJs[0] || 'n/a')
if (js) {
  console.log('  themeFab:', js.includes('themeFab'))
  console.log('  ThemeCycleButton:', js.includes('ThemeCycleButton'))
  console.log('  getReleaseNotes:', js.includes('getReleaseNotes'))
}