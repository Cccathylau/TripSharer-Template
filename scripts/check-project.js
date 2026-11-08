import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const require = createRequire(import.meta.url)
const findings = []
const add = (status, code, message) => findings.push({ status, code, message })
const args = process.argv.slice(2)
let stage = 'config', requestedTrip, network = false, json = args.includes('--json')
for (let i = 0; i < args.length; i++) {
  const arg = args[i]
  if (arg === '--stage') stage = args[++i]
  else if (arg === '--trip') requestedTrip = args[++i]
  else if (arg === '--network') network = true
  else if (arg === '--json') json = true
  else { add('fail', 'ARGUMENT', '未知参数；使用 --trip <id> --stage config|data|build [--network] [--json]'); break }
  if ((arg === '--stage' || arg === '--trip') && (!args[i] || args[i].startsWith('--'))) {
    add('fail', 'ARGUMENT', '参数缺少值'); break
  }
}
if (!['config', 'data', 'build'].includes(stage)) add('fail', 'STAGE', '检查阶段应为 config、data 或 build')
if (network && stage !== 'config') add('fail', 'NETWORK_STAGE', '--network 仅用于 config 阶段')
if (requestedTrip && !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(requestedTrip)) add('fail', 'TRIP_ID', '行程标识仅支持英文字母、数字、连字符和下划线')

const failed = () => findings.some(f => f.status === 'fail')
const readJson = (relative) => {
  try { return JSON.parse(readFileSync(join(ROOT, relative), 'utf8')) }
  catch { add('fail', 'JSON_FILE', `${relative} 缺失或不是有效 JSON`); return null }
}
const idValid = value => typeof value === 'string' && /^[a-f0-9]{32}$/i.test(value.replaceAll('-', ''))

async function main() {
  if (failed()) return
  const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number)
  if (nodeMajor < 20 || (nodeMajor === 20 && nodeMinor < 9)) {
    add('fail', 'NODE_VERSION', '需要 Node.js 20.9.0 或更新版本'); return
  }
  add('pass', 'NODE_VERSION', `Node.js ${process.versions.node}`)

  for (const name of ['dotenv', 'sharp', '@turf/turf']) {
    try { require.resolve(name); add('pass', 'DEPENDENCY', `${name} 已安装`) }
    catch { add('fail', 'DEPENDENCY', `${name} 未安装；先运行 npm ci`) }
  }

  let TRIPS
  try { ({ TRIPS } = await import('../trips.config.js')) }
  catch { add('fail', 'CONFIG_LOAD', 'trips.config.js 无法加载；检查语法'); return }
  const tripId = requestedTrip || Object.keys(TRIPS || {})[0]
  const trip = TRIPS?.[tripId]
  if (!trip || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(tripId)) {
    add('fail', 'TRIP_CONFIG', '未找到有效的行程配置'); return
  }
  const cities = Object.keys(trip.cityPageIds || {})
  if (!cities.length) add('fail', 'CITIES', '配置中没有城市')
  else add('pass', 'CITIES', `已配置 ${cities.length} 个城市`)

  if (stage === 'config') {
    for (const [label, value] of [['Places databaseId', trip.databaseId], ['overviewPageId', trip.overviewPageId], ...cities.map(c => [`cityPageIds.${c}`, trip.cityPageIds[c]])]) {
      add(idValid(value) ? 'pass' : 'fail', 'NOTION_ID', `${label}：${idValid(value) ? '格式有效' : '需要填写复制后的页面或数据库 ID'}`)
    }
    for (const c of cities) {
      if (!trip.citySearchTerms?.[c]) add('warn', 'CITY_SEARCH', `城市 ${c} 未设置边界搜索词`)
    }
    if (!['international', 'domestic'].includes(trip.region)) add('fail', 'REGION', 'region 应为 international 或 domestic')
    if (!trip.siteUrl || /your-username/.test(trip.siteUrl)) add('warn', 'SITE_URL', '发布地址尚未配置，不影响本地预览')

    let env = { ...process.env }
    try {
      const dotenv = await import('dotenv')
      if (existsSync(join(ROOT, '.env'))) env = { ...dotenv.parse(readFileSync(join(ROOT, '.env'))), ...process.env }
    } catch { /* Dependency finding above explains the missing parser. */ }
    const token = env.NOTION_TOKEN?.trim()
    const tokenPresent = Boolean(token && !/^your_|^YOUR_/.test(token))
    add(tokenPresent ? 'pass' : 'fail', 'TOKEN', tokenPresent ? 'Notion Token 已配置（不显示内容）' : '请在本地 .env 中填写 NOTION_TOKEN')
    if (trip.region === 'domestic' && !env.GAODE_KEY?.trim()) add('warn', 'GEOCODING_KEY', '国内地点若缺少坐标，需要配置 GAODE_KEY')
    if (!network) add('warn', 'NETWORK_NOT_TESTED', '本次未联网；格式有效不代表 Notion 已授权，可加 --network 检查')
    else if (!failed()) {
      const resources = [
        ['Places 数据库', `databases/${trip.databaseId}`],
        ['总览页', `blocks/${trip.overviewPageId}/children?page_size=1`],
        ...cities.map(c => [`城市 ${c}`, `blocks/${trip.cityPageIds[c]}/children?page_size=1`])
      ]
      for (const [label, endpoint] of resources) {
        try {
          const res = await fetch(`https://api.notion.com/v1/${endpoint}`, {
            headers: { Authorization: `Bearer ${token}`, 'Notion-Version': '2022-06-28' },
            signal: AbortSignal.timeout(12000)
          })
          if (!res.ok) { add('fail', 'NOTION_ACCESS', `${label} 读取失败：HTTP ${res.status}；检查 ID、Token 和页面连接`); continue }
          const body = await res.json()
          if (endpoint.startsWith('databases/')) {
            const fields = ['Name', 'City', 'Category', 'Address', 'Lat', 'Lng', 'Rating', 'Label', 'Short Note', 'Day', 'Stop Order', 'Day Note']
            const missing = fields.filter(field => !body.properties?.[field])
            if (missing.length) add('fail', 'NOTION_SCHEMA', `Places 缺少字段：${missing.join(', ')}`)
          }
          add('pass', 'NOTION_ACCESS', `${label} 可以读取`)
        } catch (error) {
          const code = error.cause?.code || error.name
          add('fail', 'NOTION_NETWORK', `${label} 连接失败：${code}；尚未验证读取授权`)
        }
      }
    }
    return
  }

  const relative = `data/${tripId}.json`
  const data = readJson(relative)
  if (!data) return
  if (!Array.isArray(data.places)) { add('fail', 'PLACES', '地点数据缺少 places 数组'); return }
  if (!data.places.length) add('warn', 'PLACES_EMPTY', '没有地点；确认 Notion 内容是否为空')
  else add('pass', 'PLACES', `读取到 ${data.places.length} 个地点`)
  const knownCities = new Set(cities)
  const invalidCoords = data.places.filter(p => !Number.isFinite(p.lat) || !Number.isFinite(p.lng) || Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180 || p.lat === 0 || p.lng === 0)
  if (invalidCoords.length) add('fail', 'COORDINATES', `${invalidCoords.length} 个地点无法由当前地图正确定位；检查地址或坐标`)
  else add('pass', 'COORDINATES', '所有地点坐标可用于当前地图')
  if (data.places.some(p => !knownCities.has(p.city))) add('fail', 'PLACE_CITY', '存在未匹配配置城市 key 的地点')
  if (!data.title?.trim()) add('fail', 'TITLE', '旅行标题为空')
  else add('pass', 'TITLE', '旅行标题已生成')
  if (!data.overview?.trim()) add('warn', 'OVERVIEW_EMPTY', '总览为空；确认是有意留空还是读取失败')
  const orders = new Set()
  let duplicateOrder = false
  for (const p of data.places) {
    if (p.day == null || p.routeOrder == null) continue
    const key = JSON.stringify([p.city, p.day, p.routeOrder])
    if (orders.has(key)) duplicateOrder = true
    orders.add(key)
  }
  if (duplicateOrder) add('warn', 'ROUTE_ORDER', '同一城市同一天存在重复 Stop Order，请确认路线顺序')
  for (const c of cities) {
    if ((data.cityBoundaries?.[c]?.length || 0) < 3) add('fail', 'BOUNDARY', `城市 ${c} 缺少有效边界`)
    if (!data.cityNotes?.[c]?.trim()) add('warn', 'NOTES_EMPTY', `城市 ${c} 攻略为空，请确认是否有意留空`)
    const city = readJson(`data/${tripId}-${c}.json`)
    if (!city) continue
    const localPlaces = data.places.filter(p => p.city === c && Number.isFinite(p.lat) && Number.isFinite(p.lng))
    const missingDetail = localPlaces.filter(p => !p.clusterId || !Array.isArray(city.clusterRoads?.[p.clusterId]) || city.clusterRoads[p.clusterId].length === 0)
    if (missingDetail.length) add('fail', 'CLUSTER_ROADS_MISSING', `城市 ${c} 有 ${missingDetail.length} 个地点缺少对应的局部详细路网；重新 fetch 补齐后再验收`)
    else if (localPlaces.length) add('pass', 'CLUSTER_ROADS', `城市 ${c} 的地点均有对应局部详细路网`)
    for (const layer of ['cityRoads', 'cityWater', 'cityResidential']) {
      const value = city[layer]?.[c]
      const count = Array.isArray(value) ? value.length : Object.values(value || {}).flat().length
      if (!count) add('warn', 'MAP_LAYER_EMPTY', `城市 ${c} 的 ${layer} 为空，地图细节可能不完整`)
    }
  }
  if (stage !== 'build') return

  try {
    const html = readFileSync(join(ROOT, 'dist/index.html'), 'utf8')
    if (!html.includes(`const DEFAULT_TRIP_ID = ${JSON.stringify(tripId)}`)) add('fail', 'BUILD_TRIP', '构建网页的默认行程与当前配置不一致')
    else add('pass', 'BUILD_TRIP', '网页默认行程正确')
    for (const path of [relative, ...cities.map(c => `data/${tripId}-${c}.json`)]) {
      try {
        if (!readFileSync(join(ROOT, path)).equals(readFileSync(join(ROOT, 'dist', path)))) add('fail', 'BUILD_STALE', `${path} 与构建副本不一致，请重新 build`)
      } catch { add('fail', 'BUILD_DATA', `构建中缺少 ${path}`) }
    }
    const expectedFiles = new Set([`${tripId}.json`, ...cities.map(c => `${tripId}-${c}.json`)])
    const extraFiles = readdirSync(join(ROOT, 'dist/data')).filter(file => !expectedFiles.has(file))
    if (extraFiles.length) add('fail', 'BUILD_EXTRA_DATA', '构建包含所选行程之外的数据，请重新 build')
    else add('pass', 'BUILD_DATA_SCOPE', '构建只包含所选行程的数据')
    const png = readFileSync(join(ROOT, 'dist/og-image.png'))
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    if (png.length < 24 || !png.subarray(0, 8).equals(signature) || png.readUInt32BE(16) !== 1200 || png.readUInt32BE(20) !== 630) add('fail', 'COVER', '分享封面不是有效的 1200×630 PNG')
    else add('pass', 'COVER', '分享封面已生成（1200×630 PNG）')
  } catch { add('fail', 'BUILD_FILES', 'dist 网页或封面缺失，请先完成 build') }
  add('warn', 'BROWSER_NOT_TESTED', '文件检查不代表浏览器验收；仍需检查实际页面和操作')
}

try { await main() }
catch { add('fail', 'CHECK_ERROR', '检查未完成；核对配置与数据结构，不要将本次结果视为通过') }
const summary = { stage, network, ok: !failed(), findings }
if (json) console.log(JSON.stringify(summary, null, 2))
else {
  const labels = { pass: '通过', warn: '待确认', fail: '未通过' }
  for (const f of findings) console.log(`[${labels[f.status]}] ${f.message}`)
  console.log(failed() ? '\n检查未通过，请先处理上述问题。' : '\n本阶段未发现阻断项；待确认项仍需继续核实。')
}
process.exitCode = failed() ? 1 : 0
