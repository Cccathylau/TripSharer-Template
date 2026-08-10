import { readFileSync, writeFileSync, copyFileSync, mkdirSync, readdirSync, rmSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { TRIPS } from '../trips.config.js'
import { renderOgCover } from './build-og-cover.js'

const __dir = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dir, '..')
const DIST = join(ROOT, 'dist')

const TRIP_ID = process.argv[2] || Object.keys(TRIPS)[0]
const trip = TRIPS[TRIP_ID]
if (!trip) { console.error(`未找到 trip: "${TRIP_ID}"`); process.exit(1) }

async function main() {
  // 清空 dist/
  rmSync(DIST, { recursive: true, force: true })
  mkdirSync(join(DIST, 'data'), { recursive: true })

  // 读取 Notion 数据 + coverMeta，计算 og 字段
  const coverMeta = trip.coverMeta ?? {}
  const siteUrl = (trip.siteUrl || '').replace(/\/$/, '')
  const dataJson = JSON.parse(readFileSync(join(ROOT, 'data', `${TRIP_ID}.json`), 'utf8'))
  const ogTitle = dataJson.title ?? coverMeta.title ?? TRIP_ID
  const ogDesc  = dataJson.ogDescription ?? coverMeta.description ?? ''
  const ogImage = siteUrl ? `${siteUrl}/og-image.png` : ''

  // 注入 og 标签到 index.html
  let html = readFileSync(join(ROOT, 'index.html'), 'utf8')
  const ogBlock = [
    `  <meta property="og:title" content="${ogTitle}">`,
    `  <meta property="og:description" content="${ogDesc}">`,
    `  <meta property="og:image" content="${ogImage}">`,
    `  <meta property="og:url" content="${siteUrl}/index.html">`,
    `  <meta property="og:type" content="website">`,
    `  <meta name="twitter:card" content="summary_large_image">`,
  ].join('\n')
  html = html.replace(
    /<!-- BUILD:OG_START -->[\s\S]*?<!-- BUILD:OG_END -->/,
    `<!-- BUILD:OG_START -->\n${ogBlock}\n  <!-- BUILD:OG_END -->`
  )
  html = html.replace('<title>TripSharer</title>', `<title>${ogTitle}</title>`)
  writeFileSync(join(DIST, 'index.html'), html, 'utf8')
  console.log('✓ dist/index.html')

  // 复制 data/*.json → dist/data/
  const jsonFiles = readdirSync(join(ROOT, 'data')).filter(f => f.endsWith('.json'))
  for (const f of jsonFiles) {
    copyFileSync(join(ROOT, 'data', f), join(DIST, 'data', f))
  }
  console.log(`✓ dist/data/ (${jsonFiles.length} 个 JSON)`)

  // 生成 og-image.png
  await renderOgCover(TRIP_ID, join(DIST, 'og-image.png'))
  console.log('✓ dist/og-image.png')

  console.log(`\ndist/ 构建完成。siteUrl: ${siteUrl || '（未填，og:image 为空）'}`)
}

main().catch(e => { console.error(e.message); process.exit(1) })
