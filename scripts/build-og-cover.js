import sharp from 'sharp'
import { readFileSync, readdirSync, existsSync, mkdirSync } from 'fs'
import { join, dirname, extname } from 'path'
import { fileURLToPath } from 'url'
import { TRIPS } from '../trips.config.js'

const __dir = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dir, '..')
const W = 1200, H = 630


// 滑动窗口找曲率最大的段（方向角变化量之和为得分）
function findBestSlice(boundary, windowSize = 55) {
  const N = boundary.length
  if (N <= windowSize) return [0, N]
  let bestScore = -1, bestStart = 0
  for (let s = 0; s + windowSize <= N; s++) {
    const pts = boundary.slice(s, s + windowSize)
    let score = 0
    for (let i = 1; i < pts.length - 1; i++) {
      const dx1 = pts[i].lng - pts[i-1].lng, dy1 = pts[i].lat - pts[i-1].lat
      const dx2 = pts[i+1].lng - pts[i].lng, dy2 = pts[i+1].lat - pts[i].lat
      let diff = Math.abs(Math.atan2(dy2, dx2) - Math.atan2(dy1, dx1))
      if (diff > Math.PI) diff = 2 * Math.PI - diff
      score += diff
    }
    if (score > bestScore) { bestScore = score; bestStart = s }
  }
  return [bestStart, bestStart + windowSize]
}

// kicker 文字：读 coverMeta.kicker 或从 trip ID 推导（"australia-2026" → "AUSTRALIA · 2026"）
function deriveKicker(tripId, coverMeta) {
  if (coverMeta?.kicker) return coverMeta.kicker
  const parts = tripId.split('-')
  const year = /^\d{4}$/.test(parts[parts.length - 1]) ? parts.pop() : ''
  return [parts.join(' ').toUpperCase(), year].filter(Boolean).join(' · ')
}

// lat/lng → canvas 坐标（cos(lat) 修正经度），等比缩放到目标矩形
function project(pts, x0, y0, w, h, pad = 60) {
  const lats = pts.map(p => p.lat)
  const lngs = pts.map(p => p.lng)
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
  const cosLat = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180)

  const geoW = (maxLng - minLng) * cosLat
  const geoH = maxLat - minLat
  const scale = Math.min((w - pad * 2) / geoW, (h - pad * 2) / geoH)
  const dx = x0 + pad + ((w - pad * 2) - geoW * scale) / 2
  const dy = y0 + pad + ((h - pad * 2) - geoH * scale) / 2

  return pts.map(p => ({
    x: dx + (p.lng - minLng) * cosLat * scale,
    y: dy + (maxLat - p.lat) * scale
  }))
}

// SVG 目的地 pin（tip 在 bx,by，向上展开）
// Material Design location_on 路径：24×24 viewBox，tip 在 (12,22)
function pinSvg(bx, by, size = 32, color = '#d4c8b2') {
  const scale = size / 24
  const tx = (bx - 12 * scale).toFixed(1)
  const ty = (by - 22 * scale).toFixed(1)
  return `<g transform="translate(${tx},${ty}) scale(${scale.toFixed(3)})">
    <path d="M12,2C8.13,2,5,5.13,5,9c0,5.25,7,13,7,13s7-7.75,7-13C19,5.13,15.87,2,12,2z"
      fill="none" stroke="${color}" stroke-width="${(2 / scale).toFixed(2)}"
      stroke-linejoin="round" />
    <circle cx="12" cy="9" r="2.8" fill="${color}" />
  </g>`
}


// 简单的二次贝塞尔平滑：每隔一个点做控制点
function smoothPath(pts) {
  if (pts.length < 2) return ''
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`
  for (let i = 1; i < pts.length - 1; i += 2) {
    const cp = pts[i]
    const ep = pts[i + 1] ?? pts[i]
    d += ` Q ${cp.x.toFixed(1)} ${cp.y.toFixed(1)} ${ep.x.toFixed(1)} ${ep.y.toFixed(1)}`
  }
  // 确保终点连上
  const last = pts[pts.length - 1]
  d += ` L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`
  return d
}

async function renderOne(photoPath, outPath, pts, title, desc, kicker) {
  const start = pts[0]
  const end   = pts[pts.length - 1]

  // 标题按空格分两行
  const titleParts = title.split(' ')
  const titleLine1 = titleParts.slice(0, Math.ceil(titleParts.length / 2)).join(' ')
  const titleLine2 = titleParts.slice(Math.ceil(titleParts.length / 2)).join(' ')

  const cn = "'Noto Serif SC', 'Source Han Serif CN', serif"
  const en = "'Playfair Display', 'Georgia', serif"
  const CREAM_LINE  = '#d4c8b2'
  const CREAM_TITLE = 'rgba(212,200,178,0.90)'
  const CREAM_KICKER= 'rgba(188,176,156,0.48)'
  const CREAM_DESC  = 'rgba(198,187,166,0.68)'

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">

    <!-- 路线弧线（暖奶油色，压在深色照片上） -->
    <path d="${smoothPath(pts)}"
      fill="none" stroke="${CREAM_LINE}" stroke-width="5"
      stroke-linecap="round" stroke-linejoin="round" />

    <!-- 起点小圆 -->
    <circle cx="${start.x.toFixed(1)}" cy="${start.y.toFixed(1)}"
      r="6" fill="${CREAM_LINE}" />

    <!-- 终点目的地 pin -->
    ${pinSvg(end.x, end.y)}

    <!-- kicker -->
    <text x="60" y="80" font-family="${en}" font-size="11"
      letter-spacing="5" fill="${CREAM_KICKER}">${kicker}</text>

    <!-- 主标题（两行）-->
    <text x="60" y="295" font-family="${cn}" font-size="46"
      font-weight="700" fill="${CREAM_TITLE}">${titleLine1}</text>
    <text x="60" y="352" font-family="${cn}" font-size="46"
      font-weight="700" fill="${CREAM_TITLE}">${titleLine2}</text>

    <!-- 副标题 -->
    <text x="60" y="558" font-family="${cn}" font-size="17"
      letter-spacing="1" fill="${CREAM_DESC}">${desc}</text>
  </svg>`

  // 生成胶片噪点层（灰色随机像素 overlay 模式 = 加颗粒感不改整体曝光）
  async function makeGrain(w, h, intensity = 38) {
    const px = Buffer.alloc(w * h * 4)
    for (let i = 0; i < px.length; i += 4) {
      const v = Math.max(0, Math.min(255, 128 + Math.round((Math.random() - 0.5) * intensity * 2)))
      px[i] = v; px[i+1] = v; px[i+2] = v; px[i+3] = 210
    }
    return sharp(px, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer()
  }

  // 背景：轻度模糊（保留质感）+ 深色叠加 + 胶片颗粒
  let bg
  if (photoPath) {
    const softened = await sharp(photoPath)
      .resize(W, H, { fit: 'cover', position: 'attention' })
      .blur(4)   // 轻度模糊，保留照片纹理
      .toBuffer()
    const darkOverlay = await sharp({
      create: { width: W, height: H, channels: 4,
        background: { r: 12, g: 8, b: 4, alpha: 0.55 } }
    }).png().toBuffer()
    const grain = await makeGrain(W, H)
    bg = await sharp(softened)
      .composite([
        { input: darkOverlay, top: 0, left: 0 },
        { input: grain, top: 0, left: 0, blend: 'overlay' }
      ])
      .png().toBuffer()
  } else {
    console.log('未找到照片，使用深灰底色')
    bg = await sharp({
      create: { width: W, height: H, channels: 4,
        background: { r: 30, g: 25, b: 20, alpha: 1 } }
    }).png().toBuffer()
  }

  await sharp(bg)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png().toFile(outPath)
  console.log(`✓ ${outPath}`)
}

// 核心逻辑：供 build.js 导入调用，也供 CLI 直接执行
export async function renderOgCover(tripId, outPath) {
  const t = TRIPS[tripId]
  if (!t) throw new Error(`未找到 trip: "${tripId}"`)
  const coverMeta = t.coverMeta ?? {}

  const cityKey = coverMeta.boundaryCity ?? Object.keys(t.cityPageIds)[0]
  const data = JSON.parse(readFileSync(join(ROOT, 'data', `${tripId}.json`), 'utf8'))
  const b = data.cityBoundaries[cityKey]
  if (!b?.length) throw new Error(`找不到 ${cityKey} boundary`)

  let sliceStart, sliceEnd
  if (Array.isArray(coverMeta.boundarySlice)) {
    ;[sliceStart, sliceEnd] = coverMeta.boundarySlice
    console.log(`城市: ${cityKey}，区间: 手动 [${sliceStart}, ${sliceEnd}]`)
  } else {
    ;[sliceStart, sliceEnd] = findBestSlice(b)
    console.log(`城市: ${cityKey}，区间: 自动 [${sliceStart}, ${sliceEnd}]（曲率最大段）`)
  }

  const routeX = Math.round(W * 0.40)
  const pts = project(b.slice(sliceStart, sliceEnd), routeX, 0, W - routeX, H, 60)

  const title  = data.title ?? coverMeta.title ?? tripId
  const desc   = data.ogDescription ?? coverMeta.description ?? ''
  const kicker = deriveKicker(tripId, coverMeta)

  const dir = join(ROOT, 'data', tripId, 'photos')
  const PHOTO_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp'])
  const photos = existsSync(dir)
    ? readdirSync(dir).filter(f => PHOTO_EXTS.has(extname(f).toLowerCase())).sort().map(f => join(dir, f))
    : []

  const coverMeta_ = t.coverMeta ?? {}
  const photoIdx = coverMeta_.coverPhoto != null ? coverMeta_.coverPhoto - 1 : 0
  const photo = photos[photoIdx] ?? null
  if (!photo) console.warn('未找到照片，使用深灰底色')

  mkdirSync(dirname(outPath), { recursive: true })
  await renderOne(photo, outPath, pts, title, desc, kicker)
}

// CLI 入口（直接执行时）
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const tripId = process.argv[2] || Object.keys(TRIPS)[0]
  const outPath = join(ROOT, 'preview', 'og-cover.png')
  mkdirSync(join(ROOT, 'preview'), { recursive: true })
  renderOgCover(tripId, outPath)
    .then(() => console.log('\nopen preview/og-cover.png'))
    .catch(e => { console.error(e.message); process.exit(1) })
}
