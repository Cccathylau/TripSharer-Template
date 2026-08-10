import COS from 'cos-nodejs-sdk-v5'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, dirname, relative } from 'path'
import { fileURLToPath } from 'url'
import { gzipSync } from 'zlib'
import { createRequire } from 'module'
import { TRIPS } from '../trips.config.js'

// 本地开发时加载 .env（CI 走环境变量）
const require = createRequire(import.meta.url)
try { (await import('dotenv')).config() } catch {}

const __dir = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dir, '..')
const DIST = join(ROOT, 'dist')

const TRIP_ID = process.argv[2] || Object.keys(TRIPS)[0]
const trip = TRIPS[TRIP_ID]
if (!trip) { console.error(`未找到 trip: "${TRIP_ID}"`); process.exit(1) }

const SecretId = process.env.TENCENT_SECRET_ID
const SecretKey = process.env.TENCENT_SECRET_KEY
if (!SecretId || !SecretKey) {
  console.error('缺少 TENCENT_SECRET_ID / TENCENT_SECRET_KEY 环境变量')
  process.exit(1)
}

// 从 cosUrl（优先）或 siteUrl（兜底）解析 bucket + region
const cosUrlRaw = trip.cosUrl || trip.siteUrl || ''
const urlMatch = cosUrlRaw.match(/^https?:\/\/([^.]+)\.cos\.([^.]+)\.myqcloud\.com/)
if (!urlMatch) {
  console.error(`cosUrl 格式不对，期望 https://bucket.cos.region.myqcloud.com，当前: "${cosUrlRaw}"`)
  process.exit(1)
}
const Bucket = urlMatch[1]
const Region = urlMatch[2]

const cos = new COS({ SecretId, SecretKey })

function putObject(key, body, headers) {
  return new Promise((resolve, reject) => {
    cos.putObject({ Bucket, Region, Key: key, Body: body, ...headers }, (err, data) => {
      if (err) reject(err)
      else resolve(data)
    })
  })
}

// 递归遍历目录返回所有文件路径
function listFiles(dir) {
  const result = []
  for (const f of readdirSync(dir)) {
    const full = join(dir, f)
    if (statSync(full).isDirectory()) result.push(...listFiles(full))
    else result.push(full)
  }
  return result
}

async function main() {
  const files = listFiles(DIST)
  console.log(`准备上传 ${files.length} 个文件到 cos://${Bucket}/${Region}`)

  for (const file of files) {
    const key = relative(DIST, file).replace(/\\/g, '/') // Windows 兼容
    const raw = readFileSync(file)

    let body = raw
    const extraHeaders = {}

    if (key.endsWith('.json')) {
      body = gzipSync(raw, { level: 9 })
      extraHeaders['ContentEncoding'] = 'gzip'
      extraHeaders['ContentType'] = 'application/json'
      extraHeaders['CacheControl'] = 'no-cache'
      extraHeaders['ContentDisposition'] = 'inline'
    } else if (key === 'index.html') {
      extraHeaders['ContentType'] = 'text/html; charset=utf-8'
      extraHeaders['CacheControl'] = 'no-cache'
      extraHeaders['ContentDisposition'] = 'inline'
    } else if (key.endsWith('.png')) {
      extraHeaders['ContentType'] = 'image/png'
      extraHeaders['CacheControl'] = 'max-age=3600'
      extraHeaders['ContentDisposition'] = 'inline'
    }

    await putObject(key, body, extraHeaders)
    const size = body.length > 1024 ? `${(body.length / 1024).toFixed(0)}KB` : `${body.length}B`
    console.log(`  ✓ ${key} (${size})`)
  }

  console.log(`\n上传完成。访问地址：${trip.siteUrl || cosUrlRaw}`)
}

main().catch(e => { console.error(e.message); process.exit(1) })
