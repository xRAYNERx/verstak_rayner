/**
 * Генерирует фирменные BMP для NSIS-установщика Verstak (Nord-тема).
 * Запуск: node scripts/generate-installer-assets.mjs  (npm run generate:installer)
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const SOURCE = path.join(ROOT, 'resources', 'icon-source.png')
const OUT_DIR = path.join(ROOT, 'build')

const COLORS = {
  base: '#2e3440',
  elevated: '#353c4a',
  accent: '#88c0d0',
  text: '#eceff4',
  muted: '#97a1b5',
}

function sidebarSvg() {
  return Buffer.from(`<svg width="164" height="314" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${COLORS.elevated}"/>
      <stop offset="100%" stop-color="${COLORS.base}"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="28%" r="55%">
      <stop offset="0%" stop-color="${COLORS.accent}" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="${COLORS.accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="164" height="314" fill="url(#bg)"/>
  <rect width="164" height="314" fill="url(#glow)"/>
  <rect x="0" y="0" width="3" height="314" fill="${COLORS.accent}" opacity="0.55"/>
  <text x="82" y="248" text-anchor="middle" fill="${COLORS.accent}" font-family="Segoe UI,Inter,sans-serif" font-size="11" font-weight="700" letter-spacing="2.5">VERSTAK</text>
  <text x="82" y="268" text-anchor="middle" fill="${COLORS.muted}" font-family="Segoe UI,Inter,sans-serif" font-size="8.5">IDE для AI-агентов</text>
</svg>`)
}

function headerSvg() {
  return Buffer.from(`<svg width="150" height="57" xmlns="http://www.w3.org/2000/svg">
  <rect width="150" height="57" fill="${COLORS.elevated}"/>
  <rect x="0" y="0" width="3" height="57" fill="${COLORS.accent}" opacity="0.85"/>
  <text x="50" y="36" fill="${COLORS.text}" font-family="Segoe UI,Inter,sans-serif" font-size="15" font-weight="600">Verstak</text>
  <text x="50" y="50" fill="${COLORS.muted}" font-family="Segoe UI,Inter,sans-serif" font-size="8">Установка</text>
</svg>`)
}

/** NSIS требует 24-bit uncompressed BMP. */
function encodeBmp24(rgb, width, height) {
  const rowStride = Math.ceil((width * 3) / 4) * 4
  const pixelDataSize = rowStride * height
  const fileSize = 54 + pixelDataSize
  const buf = Buffer.alloc(fileSize)

  buf.write('BM', 0)
  buf.writeUInt32LE(fileSize, 2)
  buf.writeUInt32LE(54, 10)
  buf.writeUInt32LE(40, 14)
  buf.writeInt32LE(width, 18)
  buf.writeInt32LE(height, 22)
  buf.writeUInt16LE(1, 26)
  buf.writeUInt16LE(24, 28)
  buf.writeUInt32LE(pixelDataSize, 34)

  let offset = 54
  for (let y = height - 1; y >= 0; y--) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3
      buf[offset++] = rgb[i + 2]
      buf[offset++] = rgb[i + 1]
      buf[offset++] = rgb[i]
    }
    offset += rowStride - width * 3
  }
  return buf
}

async function toBmp(pipeline, width, height) {
  const { data, info } = await pipeline
    .resize(width, height)
    .flatten({ background: COLORS.base })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  if (info.width !== width || info.height !== height || info.channels !== 3) {
    throw new Error(`raw: expected ${width}×${height}×3, got ${info.width}×${info.height}×${info.channels}`)
  }
  return encodeBmp24(data, width, height)
}

async function compositeSidebar(logoBuf) {
  const bg = await sharp(sidebarSvg()).png().toBuffer()
  const logo = await sharp(logoBuf)
    .resize(88, 88, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()

  return toBmp(
    sharp(bg).composite([{ input: logo, top: 118, left: 38 }]),
    164,
    314,
  )
}

async function compositeHeader(logoBuf) {
  const bg = await sharp(headerSvg()).png().toBuffer()
  const logo = await sharp(logoBuf)
    .resize(34, 34, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()

  return toBmp(
    sharp(bg).composite([{ input: logo, top: 11, left: 12 }]).flatten({ background: COLORS.elevated }),
    150,
    57,
  )
}

function assertBmp(buf, w, h, label) {
  const dib = 14
  const width = buf.readInt32LE(dib + 4)
  const height = buf.readInt32LE(dib + 8)
  const bpp = buf.readUInt16LE(dib + 14)
  if (width !== w || height !== h || bpp !== 24) {
    throw new Error(`${label}: expected ${w}×${h}×24, got ${width}×${height}×${bpp}`)
  }
}

async function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error(`[generate-installer-assets] Нет ${SOURCE}`)
    process.exit(1)
  }

  fs.mkdirSync(OUT_DIR, { recursive: true })

  const logoBuf = await sharp(SOURCE).png().toBuffer()
  const sidebar = await compositeSidebar(logoBuf)
  const header = await compositeHeader(logoBuf)

  assertBmp(sidebar, 164, 314, 'installerSidebar')
  assertBmp(header, 150, 57, 'installerHeader')

  fs.writeFileSync(path.join(OUT_DIR, 'installerSidebar.bmp'), sidebar)
  fs.writeFileSync(path.join(OUT_DIR, 'uninstallerSidebar.bmp'), sidebar)
  fs.writeFileSync(path.join(OUT_DIR, 'installerHeader.bmp'), header)

  console.log('OK: build/installerSidebar.bmp (164×314)')
  console.log('OK: build/uninstallerSidebar.bmp (164×314)')
  console.log('OK: build/installerHeader.bmp (150×57)')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})