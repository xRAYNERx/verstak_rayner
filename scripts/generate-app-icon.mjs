/**
 * Генерирует icon.png + icon.ico из дизайна gg-auth-logo-icon (стартовый экран).
 * Запуск: node scripts/generate-app-icon.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

// Дизайн gg-auth-logo-icon: radius 14/48, gradient 135deg #5865f2 → #9b59ff
function iconSvg(size) {
  const r = Math.round((14 / 48) * size)
  const fontSize = Math.round(size * 0.58)
  const ls = Math.max(1, Math.round(fontSize * 0.03))
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#5865f2"/>
      <stop offset="100%" stop-color="#9b59ff"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${r}" fill="url(#g)"/>
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" alignment-baseline="middle"
    font-family="Segoe UI, system-ui, -apple-system, sans-serif"
    font-size="${fontSize}" font-weight="800" fill="#ffffff" letter-spacing="-${ls}">V</text>
</svg>`)
}

async function pngFromSvg(size) {
  return sharp(iconSvg(size)).png().toBuffer()
}

async function main() {
  const sizes = [16, 32, 48, 64, 128, 256, 512]
  const pngs = {}
  for (const s of sizes) {
    pngs[s] = await pngFromSvg(s)
  }

  const resourcesDir = path.join(ROOT, 'resources')
  const assetsDir = path.join(ROOT, 'src', 'assets')
  fs.mkdirSync(resourcesDir, { recursive: true })
  fs.mkdirSync(assetsDir, { recursive: true })

  fs.writeFileSync(path.join(resourcesDir, 'icon.png'), pngs[512])
  fs.writeFileSync(path.join(assetsDir, 'icon.png'), pngs[512])

  const icoSizes = [16, 32, 48, 64, 128, 256]
  const ico = await pngToIco(icoSizes.map(s => pngs[s]))
  fs.writeFileSync(path.join(resourcesDir, 'icon.ico'), ico)

  console.log('OK: resources/icon.png (512), resources/icon.ico, src/assets/icon.png')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})