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

/** Токены из src/styles/theme.css (:root Nord) */
const THEME = {
  bgBase: '#2e3440',
  bgElevated: '#353c4a',
  bgOverlay: '#3b4252',
  bgInput: '#2b313c',
  borderSubtle: '#353c4a',
  borderDefault: '#434c5e',
  borderStrong: '#4c566a',
  textPrimary: '#eceff4',
  textSecondary: '#d8dee9',
  textTertiary: '#97a1b5',
  accent: '#88c0d0',
  accentMuted: 'rgba(136, 192, 208, 0.14)',
  error: '#bf616a',
}

function noiseFilter(id) {
  return `<filter id="${id}" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch" result="n"/>
    <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.04 0" in="n" result="a"/>
    <feBlend in="SourceGraphic" in2="a" mode="overlay"/>
  </filter>`
}

function featureRow(y, color, text) {
  return `<circle cx="24" cy="${y}" r="3.5" fill="${color}" opacity="0.95"/>
  <circle cx="24" cy="${y}" r="6" fill="${color}" opacity="0.22"/>
  <text x="36" y="${y + 4}" fill="${THEME.textSecondary}" font-family="Segoe UI,Inter,sans-serif" font-size="8.5" font-weight="500">${text}</text>`
}

function sidebarSvg({ accent, modeLabel, modeSub, features, stepCount = 4, activeStep = 0 }) {
  const steps = Array.from({ length: stepCount }, (_, i) => {
    const cx = 82 - ((stepCount - 1) * 10) / 2 + i * 10
    const active = i <= activeStep
    return `<circle cx="${cx}" cy="296" r="${active ? 3.5 : 2.5}" fill="${active ? accent : THEME.borderStrong}" opacity="${active ? 1 : 0.55}"/>`
  }).join('')

  const featureRows = features.map((f, i) => featureRow(214 + i * 18, accent, f)).join('')

  return Buffer.from(`<svg width="164" height="314" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="shell" x1="0" y1="0" x2="0.2" y2="1">
      <stop offset="0%" stop-color="${THEME.bgElevated}"/>
      <stop offset="55%" stop-color="${THEME.bgBase}"/>
      <stop offset="100%" stop-color="#262b33"/>
    </linearGradient>
    <linearGradient id="titlebar" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(236,239,244,0.06)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="34%" r="48%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
    ${noiseFilter('noise')}
  </defs>

  <rect width="164" height="314" fill="url(#shell)"/>
  <rect width="164" height="314" fill="url(#glow)"/>
  <rect width="164" height="314" filter="url(#noise)" opacity="0.55"/>

  <!-- rail accent -->
  <rect x="0" y="0" width="3" height="314" fill="${accent}" opacity="0.72"/>
  <rect x="3" y="0" width="1" height="314" fill="${accent}" opacity="0.18"/>

  <!-- titlebar strip -->
  <rect x="3" y="0" width="161" height="36" fill="url(#titlebar)"/>
  <line x1="3" y1="36" x2="164" y2="36" stroke="${THEME.borderSubtle}" stroke-width="1"/>
  <text x="14" y="23" fill="${THEME.textSecondary}" font-family="Segoe UI,Inter,sans-serif" font-size="8" font-weight="600" letter-spacing="2.2">VERSTAK</text>

  <!-- glass card -->
  <rect x="18" y="52" width="128" height="128" rx="14" fill="${THEME.bgOverlay}" opacity="0.55"/>
  <rect x="18" y="52" width="128" height="128" rx="14" fill="none" stroke="${THEME.borderDefault}" stroke-width="1" opacity="0.65"/>
  <rect x="19" y="53" width="126" height="40" rx="13" fill="rgba(255,255,255,0.03)"/>

  <!-- mode label -->
  <text x="82" y="196" text-anchor="middle" fill="${accent}" font-family="Segoe UI,Inter,sans-serif" font-size="10.5" font-weight="700" letter-spacing="1.8">${modeLabel}</text>
  <text x="82" y="210" text-anchor="middle" fill="${THEME.textTertiary}" font-family="Segoe UI,Inter,sans-serif" font-size="7.5">${modeSub}</text>

  <!-- features -->
  <rect x="16" y="202" width="132" height="62" rx="10" fill="rgba(0,0,0,0.18)" stroke="${THEME.borderSubtle}" stroke-width="1" opacity="0.7"/>
  ${featureRows}

  <!-- steps -->
  ${steps}
</svg>`)
}

function headerSvg({ accent }) {
  return Buffer.from(`<svg width="150" height="57" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="hdr" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#3d4454"/>
      <stop offset="100%" stop-color="${THEME.bgElevated}"/>
    </linearGradient>
    ${noiseFilter('hdrNoise')}
  </defs>
  <rect width="150" height="57" fill="url(#hdr)"/>
  <rect width="150" height="57" filter="url(#hdrNoise)" opacity="0.35"/>
  <rect x="0" y="0" width="3" height="57" fill="${accent}" opacity="0.9"/>
  <rect x="0" y="0" width="150" height="1" fill="rgba(236,239,244,0.07)"/>
  <line x1="0" y1="56" x2="150" y2="56" stroke="${THEME.borderDefault}" stroke-width="1"/>
  <!-- logo slot: 12..46 -->
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

async function toBmp(pipeline, width, height, flattenBg = THEME.bgBase) {
  const { data, info } = await pipeline
    .resize(width, height)
    .flatten({ background: flattenBg })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  if (info.width !== width || info.height !== height || info.channels !== 3) {
    throw new Error(`raw: expected ${width}×${height}×3, got ${info.width}×${info.height}×${info.channels}`)
  }
  return encodeBmp24(data, width, height)
}

async function compositeSidebar(logoBuf, variant) {
  const isUninstall = variant === 'uninstall'
  const accent = isUninstall ? THEME.error : THEME.accent
  const bg = await sharp(sidebarSvg({
    accent,
    modeLabel: isUninstall ? 'УДАЛЕНИЕ' : 'УСТАНОВКА',
    modeSub: isUninstall ? 'Verstak IDE' : 'IDE для AI-агентов',
    features: isUninstall
      ? ['Удаление файлов', 'Очистка ярлыков', 'Данные приложения']
      : ['AI-агенты и модели', 'Проекты и память', 'Skills и артефакты'],
    activeStep: isUninstall ? 0 : 0,
  })).png().toBuffer()

  const logo = await sharp(logoBuf)
    .resize(72, 72, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()

  return toBmp(
    sharp(bg).composite([{ input: logo, top: 78, left: 46 }]),
    164,
    314,
  )
}

async function compositeHeader(logoBuf, accent = THEME.accent) {
  const bg = await sharp(headerSvg({ accent })).png().toBuffer()
  const logo = await sharp(logoBuf)
    .resize(30, 30, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()

  return toBmp(
    sharp(bg).composite([{ input: logo, top: 13, left: 14 }]).flatten({ background: THEME.bgElevated }),
    150,
    57,
    THEME.bgElevated,
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
  const sidebar = await compositeSidebar(logoBuf, 'install')
  const uninstallSidebar = await compositeSidebar(logoBuf, 'uninstall')
  const header = await compositeHeader(logoBuf, THEME.accent)
  const uninstallHeader = await compositeHeader(logoBuf, THEME.error)

  assertBmp(sidebar, 164, 314, 'installerSidebar')
  assertBmp(uninstallSidebar, 164, 314, 'uninstallerSidebar')
  assertBmp(header, 150, 57, 'installerHeader')
  assertBmp(uninstallHeader, 150, 57, 'uninstallerHeader')

  fs.writeFileSync(path.join(OUT_DIR, 'installerSidebar.bmp'), sidebar)
  fs.writeFileSync(path.join(OUT_DIR, 'uninstallerSidebar.bmp'), uninstallSidebar)
  fs.writeFileSync(path.join(OUT_DIR, 'installerHeader.bmp'), header)
  fs.writeFileSync(path.join(OUT_DIR, 'uninstallerHeader.bmp'), uninstallHeader)

  console.log('OK: build/installerSidebar.bmp (164×314)')
  console.log('OK: build/uninstallerSidebar.bmp (164×314)')
  console.log('OK: build/installerHeader.bmp (150×57)')
  console.log('OK: build/uninstallerHeader.bmp (150×57)')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})