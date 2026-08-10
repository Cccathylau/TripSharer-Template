import { writeFileSync, mkdirSync, readFileSync } from 'fs'
import 'dotenv/config'
import { TRIPS } from '../trips.config.js'

const TOKEN = process.env.NOTION_TOKEN
const TRIP_ID = process.argv[2] || Object.keys(TRIPS)[0]
const FULL = process.argv.includes('--full')
const trip = TRIPS[TRIP_ID]

if (!trip) {
  console.error(`未找到 trip: "${TRIP_ID}"`)
  process.exit(1)
}

const NOTION_HEADERS = {
  'Authorization': `Bearer ${TOKEN}`,
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json'
}

// 查询 Places Database，自动处理分页
async function fetchPlaces() {
  const places = []
  let cursor = undefined

  do {
    const body = { page_size: 100 }
    if (cursor) body.start_cursor = cursor

    const res = await fetch(`https://api.notion.com/v1/databases/${trip.databaseId}/query`, {
      method: 'POST',
      headers: NOTION_HEADERS,
      body: JSON.stringify(body)
    })
    const data = await res.json()

    for (const page of data.results) {
      const p = page.properties
      places.push({
        id: page.id,
        name: p.Name?.title?.[0]?.plain_text || '',
        city: p.City?.select?.name || '',
        category: p.Category?.select?.name || '',
        address: p.Address?.rich_text?.[0]?.plain_text || '',
        lat: p.Lat?.number ?? null,
        lng: p.Lng?.number ?? null,
        rating: p.Rating?.number ?? null,
        description: p.Description?.rich_text?.[0]?.plain_text || '',
        shortNote: p['Short Note']?.rich_text?.[0]?.plain_text || '',
        routeOrder: p.Route?.number ?? null,
        day:        p['Day']?.number ?? null,
        dayNote:    p['Day Note']?.rich_text?.[0]?.plain_text || ''
      })
    }

    cursor = data.has_more ? data.next_cursor : undefined
  } while (cursor)

  return places
}

// 高德行政区划边界（国内城市，GCJ-02 → WGS-84）
async function fetchCityBoundaryGaode(cityZhName, maxPoints = 150) {
  const key = process.env.GAODE_KEY
  if (!key) return null
  try {
    const url = `https://restapi.amap.com/v3/config/district?keywords=${encodeURIComponent(cityZhName)}&subdistrict=0&extensions=all&key=${key}`
    const res = await fetch(url)
    const data = await res.json()
    if (data.status !== '1' || !data.districts?.length) return null

    const polyline = data.districts[0].polyline
    if (!polyline) return null

    // 多边形以 | 分隔坐标，多个多边形以 ; 分隔，取最长的
    const rings = polyline.split(';').map(r =>
      r.split('|').map(pt => { const [lng, lat] = pt.split(',').map(Number); return { lat, lng } }).filter(p => p.lat && p.lng)
    ).filter(r => r.length > 3)

    if (!rings.length) return null
    const ring = rings.sort((a, b) => b.length - a.length)[0]

    // 转 WGS-84 并简化
    const wgs = ring.map(p => gcj02ToWgs84(p.lat, p.lng))
    const step = Math.max(1, Math.floor(wgs.length / maxPoints))
    const simplified = wgs.filter((_, i) => i % step === 0)
    if (simplified[simplified.length - 1] !== simplified[0]) simplified.push(simplified[0])
    return simplified
  } catch (e) {
    console.warn(`  高德边界异常: ${e.message}`)
    return null
  }
}

// 获取城市边界多边形，简化到 maxPoints 个点
async function fetchCityBoundary(searchTerm, maxPoints = 150) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchTerm)}&polygon_geojson=1&format=json&limit=5`
  let data
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'TripSharer/1.0 (cathylau0004@gmail.com)' } })
    const text = await res.text()
    if (!text.startsWith('[') && !text.startsWith('{')) {
      console.warn(`  边界请求被拒（HTTP ${res.status}）`)
      return null
    }
    data = JSON.parse(text)
  } catch (e) {
    console.warn(`  边界请求异常: ${e.message}`)
    return null
  }

  const hit = data.find(r => r.geojson?.type === 'Polygon' || r.geojson?.type === 'MultiPolygon')
  if (!hit) return null

  let ring
  if (hit.geojson.type === 'Polygon') {
    ring = hit.geojson.coordinates[0]
  } else {
    ring = hit.geojson.coordinates
      .flatMap(p => p)
      .sort((a, b) => b.length - a.length)[0]
  }

  const step = Math.max(1, Math.floor(ring.length / maxPoints))
  const simplified = ring.filter((_, i) => i % step === 0)
  if (simplified[simplified.length - 1] !== simplified[0]) simplified.push(simplified[0])

  return simplified.map(([lng, lat]) => ({ lat, lng }))
}

// 基于 POI 坐标计算紧凑 bbox（城市页初始 viewBox 用）
function buildPoiBounds(placesInCity, buffer = 0.025) {
  const lats = placesInCity.map(p => p.lat).filter(Number.isFinite)
  const lngs = placesInCity.map(p => p.lng).filter(Number.isFinite)
  if (!lats.length) return null
  return {
    minLat: Math.min(...lats) - buffer,
    maxLat: Math.max(...lats) + buffer,
    minLng: Math.min(...lngs) - buffer,
    maxLng: Math.max(...lngs) + buffer
  }
}

// GCJ-02 → WGS-84（一次迭代近似，精度 < 1m）
function gcj02ToWgs84(lat, lng) {
  const PI = Math.PI, a = 6378245.0, ee = 0.00669342162296594323
  function delta(lat, lng) {
    let dLat = -100 + 2*lng + 3*lat + 0.2*lat*lat + 0.1*lng*lat + 0.2*Math.sqrt(Math.abs(lng))
    dLat += (20*Math.sin(6*lng*PI) + 20*Math.sin(2*lng*PI)) * 2/3
    dLat += (20*Math.sin(lat*PI) + 40*Math.sin(lat/3*PI)) * 2/3
    dLat += (160*Math.sin(lat/12*PI) + 320*Math.sin(lat*PI/30)) * 2/3
    let dLng = 300 + lng + 2*lat + 0.1*lng*lng + 0.1*lng*lat + 0.1*Math.sqrt(Math.abs(lng))
    dLng += (20*Math.sin(6*lng*PI) + 20*Math.sin(2*lng*PI)) * 2/3
    dLng += (20*Math.sin(lng*PI) + 40*Math.sin(lng/3*PI)) * 2/3
    dLng += (150*Math.sin(lng/12*PI) + 300*Math.sin(lng/30*PI)) * 2/3
    return { dLat, dLng }
  }
  const { dLat, dLng } = delta(lat - 35, lng - 105)
  const radLat = lat / 180 * PI
  const magic = 1 - ee * Math.sin(radLat) ** 2
  const sqrtMagic = Math.sqrt(magic)
  const mgLat = lat + (dLat * 180) / (PI * a * (1 - ee) / (magic * sqrtMagic))
  const mgLng = lng + (dLng * 180) / (PI * a / sqrtMagic * Math.cos(radLat))
  return { lat: lat * 2 - mgLat, lng: lng * 2 - mgLng }
}

// 高德单次地理编码请求
async function gaodeGeocodeRaw(address, cityHint = '') {
  const key = process.env.GAODE_KEY
  if (!key) return null
  try {
    const cityParam = cityHint ? `&city=${encodeURIComponent(cityHint)}` : ''
    const url = `https://restapi.amap.com/v3/geocode/geo?address=${encodeURIComponent(address)}&key=${key}&output=json${cityParam}`
    const res = await fetch(url)
    const data = await res.json()
    if (data.status === '1' && data.geocodes?.length > 0) {
      const [lngStr, latStr] = data.geocodes[0].location.split(',')
      return gcj02ToWgs84(parseFloat(latStr), parseFloat(lngStr))
    }
  } catch (e) {
    console.warn(`  高德 geocode 异常: ${e.message}`)
  }
  return null
}

// 高德 POI 文本搜索（按商家名查，能区分分店；geocoding API 不行）
async function gaodePOISearch(keywords, cityHint = '') {
  const key = process.env.GAODE_KEY
  if (!key) return null
  try {
    const params = new URLSearchParams({ keywords, key, output: 'json', offset: 1, ...(cityHint ? { city: cityHint } : {}) })
    const res = await fetch('https://restapi.amap.com/v3/place/text?' + params)
    const data = await res.json()
    const poi = data.pois?.[0]
    if (!poi) return null
    const [lngStr, latStr] = poi.location.split(',')
    return gcj02ToWgs84(parseFloat(latStr), parseFloat(lngStr))
  } catch (e) {
    console.warn(`  高德 POI 搜索异常: ${e.message}`)
  }
  return null
}

// 高德地理编码
// skipNoHint=true（餐厅/购物）：先用 POI 搜索区分分店，失败再用 geocoding with city hint
// skipNoHint=false（景点）：先全国搜，结果在 300km 内即接受（日游邻市场景）；偏远才加城市限定
async function geocodeGaode(address, cityHint = '', cityCenter = null, skipNoHint = false, placeName = '') {
  if (skipNoHint && placeName && cityHint) {
    // 餐厅/购物：POI 搜索能找到正确分店（如"会展城店"而非"万象城店"）
    const poi = await gaodePOISearch(placeName, cityHint)
    if (poi) return poi
    return gaodeGeocodeRaw(address, cityHint)
  }
  const noHint = skipNoHint ? null : await gaodeGeocodeRaw(address)
  if (noHint) {
    if (!cityCenter) return noHint
    if (distMeters(noHint, cityCenter) < 300000) return noHint
  }
  // 结果偏远（或无结果），加城市限定重试
  if (cityHint) return gaodeGeocodeRaw(address, cityHint)
  return noHint || null
}

// 地理编码：domestic → 高德优先；international → Google 优先；均以 Nominatim 兜底
async function geocode(address, cityBbox = null, domestic = false, cityHint = '', skipNoHint = false, placeName = '') {
  if (domestic) {
    const cityCenter = cityBbox ? {
      lat: (cityBbox[0] + cityBbox[2]) / 2,
      lng: (cityBbox[1] + cityBbox[3]) / 2
    } : null
    const result = await geocodeGaode(address, cityHint, cityCenter, skipNoHint, placeName)
    if (result) return result
  }

  const GOOGLE_KEY = process.env.GOOGLE_MAPS_KEY
  if (GOOGLE_KEY) {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_KEY}`
      const res = await fetch(url)
      const data = await res.json()
      if (data.status === 'OK' && data.results?.length > 0) {
        const loc = data.results[0].geometry.location
        return { lat: loc.lat, lng: loc.lng }
      }
      if (data.status !== 'ZERO_RESULTS') {
        console.warn(`  Google geocode 返回 ${data.status}: ${address}`)
        if (data.error_message) console.warn(`    → ${data.error_message}`)
      }
    } catch (e) {
      console.warn(`  Google geocode 异常: ${e.message}`)
    }
  }

  if (domestic) return null  // 国内地址不走 Nominatim（OSM 国内数据不完整）

  let nomUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`
  if (cityBbox) {
    const [s, w, n, e] = cityBbox
    nomUrl += `&viewbox=${w},${n},${e},${s}&bounded=1`
  }
  try {
    const res = await fetch(nomUrl, { headers: { 'User-Agent': 'TripSharer/1.0 (cathylau0004@gmail.com)' } })
    const text = await res.text()
    if (!text.startsWith('[') && !text.startsWith('{')) {
      console.warn(`  Nominatim geocode 返回非 JSON（HTTP ${res.status}）: ${text.slice(0, 80)}`)
      return null
    }
    const data = JSON.parse(text)
    if (data.length > 0) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
  } catch (e) {
    console.warn(`  Nominatim geocode 异常: ${e.message}`)
  }
  return null
}

async function notionFetch(url) {
  const res = await fetch(url, { headers: NOTION_HEADERS })
  if (!res.ok) throw new Error(`Notion HTTP ${res.status}: ${url}`)
  return res.json()
}

async function fetchPageTitle(pageId) {
  if (!pageId) return ''
  try {
    const data = await notionFetch(`https://api.notion.com/v1/pages/${pageId}`)
    return data.properties?.title?.title?.[0]?.plain_text || ''
  } catch (e) {
    console.warn(`  fetchPageTitle 失败: ${e.message}`)
    return ''
  }
}

async function fetchTripTitle(overviewPageId) {
  if (!overviewPageId) return ''
  try {
    const data = await notionFetch(`https://api.notion.com/v1/pages/${overviewPageId}`)
    if (data.parent?.type === 'page_id') return fetchPageTitle(data.parent.page_id)
    return data.properties?.title?.title?.[0]?.plain_text || ''
  } catch (e) {
    console.warn(`  fetchTripTitle 失败: ${e.message}`)
    return ''
  }
}

// 从总页（overview 的上级页）读第一个 callout 作为 og description
async function fetchOgDescription(overviewPageId) {
  if (!overviewPageId) return ''
  try {
    const page = await notionFetch(`https://api.notion.com/v1/pages/${overviewPageId}`)
    const parentId = page.parent?.type === 'page_id' ? page.parent.page_id : null
    if (!parentId) return ''
    const blocks = await fetchPageBlocks(parentId)
    if (!blocks) return ''
    const callout = blocks.find(b => b.type === 'callout')
    if (!callout) return ''
    return (callout.callout?.rich_text || []).map(r => r.plain_text).join('').trim()
  } catch (e) {
    console.warn(`  fetchOgDescription 失败: ${e.message}`)
    return ''
  }
}

async function fetchPageBlocks(pageId) {
  if (!pageId) return null
  try {
    const data = await notionFetch(`https://api.notion.com/v1/blocks/${pageId}/children?page_size=100`)
    return data.results
  } catch (e) {
    console.warn(`  fetchPageBlocks 失败: ${e.message}`)
    return null
  }
}

function richTextToHtml(richText) {
  return (richText || []).map(t => {
    let text = t.plain_text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    if (t.annotations?.bold) text = `<strong>${text}</strong>`
    if (t.annotations?.italic) text = `<em>${text}</em>`
    return text
  }).join('')
}

function hexToHsl(hex) {
  let r = parseInt(hex.slice(1,3),16)/255, g = parseInt(hex.slice(3,5),16)/255, b = parseInt(hex.slice(5,7),16)/255
  const max = Math.max(r,g,b), min = Math.min(r,g,b)
  let h, s, l = (max+min)/2
  if (max === min) { h = s = 0 } else {
    const d = max - min
    s = l > 0.5 ? d/(2-max-min) : d/(max+min)
    switch(max) {
      case r: h = ((g-b)/d + (g<b?6:0))/6; break
      case g: h = ((b-r)/d + 2)/6; break
      case b: h = ((r-g)/d + 4)/6; break
    }
  }
  return [h, s, l]
}

function hslToHex(h, s, l) {
  const f = (p,q,t) => { if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p }
  let r,g,b
  if(s===0){r=g=b=l}else{const q=l<0.5?l*(1+s):l+s-l*s,p=2*l-q;r=f(p,q,h+1/3);g=f(p,q,h);b=f(p,q,h-1/3)}
  return '#'+[r,g,b].map(x=>Math.round(x*255).toString(16).padStart(2,'0')).join('')
}

const COLOR_PALETTE = [
  { hex: '#C0524A', keys: ['红', 'red', '朱', '火', '枣', 'crimson', 'scarlet', 'maroon'] },
  { hex: '#B84C3C', keys: ['砖红', 'brick', '陶', 'terracotta', 'rust'] },
  { hex: '#E87060', keys: ['珊瑚', 'coral', '橘红', 'salmon'] },
  { hex: '#C2546A', keys: ['玫', 'rose', '粉红', 'blush'] },
  { hex: '#D17B8B', keys: ['粉', 'pink'] },
  { hex: '#E4906B', keys: ['橙', '橘', 'orange', 'tangerine', '暖橙'] },
  { hex: '#D4A24A', keys: ['黄', 'yellow', 'amber', '金', 'golden', '卡其', 'khaki'] },
  { hex: '#6B9E6B', keys: ['绿', 'green', '草', '苔', '植物', '森'] },
  { hex: '#7A8C5A', keys: ['橄榄', 'olive', '军绿', '莫兰迪', '灰绿'] },
  { hex: '#2A9D8F', keys: ['青', 'teal', '松石', '孔雀', '青绿'] },
  { hex: '#3D9E7A', keys: ['薄荷', 'mint', '翠绿', '翡翠'] },
  { hex: '#4A7B96', keys: ['蓝', 'blue', '天', '海', 'sky', 'ocean', 'steel', '水鸭'] },
  { hex: '#3E7A96', keys: ['青蓝', 'cyan', '冰', '水蓝'] },
  { hex: '#2C4E6E', keys: ['深蓝', 'navy', 'indigo', '藏', '宝蓝', '深海', '午夜'] },
  { hex: '#9B7AA6', keys: ['紫', 'purple', 'violet', '葡萄', 'grape', '丁香'] },
  { hex: '#8E7AB5', keys: ['薰衣草', 'lavender', '淡紫', '浅紫'] },
  { hex: '#A37056', keys: ['棕', 'brown', '咖', '咖啡', 'coffee', '巧克力', '木', '焦'] },
  { hex: '#B8A06A', keys: ['驼', 'camel', 'tan', '米', 'beige', '沙'] },
  { hex: '#6B6B6B', keys: ['灰', 'gray', 'grey', '银', '石'] },
  { hex: '#F5F1EC', keys: ['白', 'white', '象牙', 'ivory', '奶'] },
  { hex: '#2C2C2C', keys: ['黑', 'black', '炭', '墨'] },
]

function resolveColorName(input) {
  if (!input) return null
  const norm = input.trim().toLowerCase().replace(/[色调系]+$/, '')
  // 精确匹配
  for (const { hex, keys } of COLOR_PALETTE) {
    if (keys.some(k => k.toLowerCase() === norm)) return hex
  }
  // 修饰词检测：提亮(亮/浅/淡) 或 压暗(深/暗)，精确匹配基础色后调整亮度
  const LIGHTEN = ['亮', '浅', '淡'], DARKEN = ['深', '暗']
  let modifier = null, base = norm
  for (const m of LIGHTEN) { if (norm.startsWith(m) && norm.length > m.length) { modifier = 'lighten'; base = norm.slice(m.length); break } }
  if (!modifier) { for (const m of DARKEN) { if (norm.startsWith(m) && norm.length > m.length) { modifier = 'darken'; base = norm.slice(m.length); break } } }
  if (modifier) {
    for (const { hex, keys } of COLOR_PALETTE) {
      if (keys.some(k => k.toLowerCase() === base)) {
        const [h, s, l] = hexToHsl(hex)
        const newL = modifier === 'lighten' ? Math.min(0.88, l + 0.20) : Math.max(0.12, l - 0.20)
        const newS = modifier === 'lighten' ? Math.min(0.70, s + 0.15) : s
        return hslToHex(h, newS, newL).toUpperCase()
      }
    }
  }
  // substring 兜底
  for (const { hex, keys } of COLOR_PALETTE) {
    if (keys.some(k => norm.includes(k.toLowerCase()))) return hex
  }
  return null
}

function extractCityColor(blocks) {
  if (!blocks) return { color: null, blocks: [] }
  let color = null
  const remaining = blocks.filter(b => {
    let text = null
    if (b.type === 'callout' && b.callout?.icon?.emoji === '🎨') {
      text = (b.callout?.rich_text || []).map(r => r.plain_text).join('').trim()
    } else if (b.type === 'paragraph') {
      const raw = (b.paragraph?.rich_text || []).map(r => r.plain_text).join('').trim()
      if (/^#[0-9a-fA-F]{6}$/i.test(raw)) text = raw
    }
    if (!text) return true
    if (/^#[0-9a-fA-F]{6}$/i.test(text)) {
      if (!color) color = text.toUpperCase()
      return false
    }
    const resolved = resolveColorName(text)
    if (resolved) {
      if (!color) color = resolved
      return false
    }
    return true
  })
  return { color, blocks: remaining }
}

function blocksToHtml(blocks) {
  if (!blocks) return ''
  const html = []
  let i = 0
  while (i < blocks.length) {
    const b = blocks[i]
    const type = b.type

    if (type === 'bulleted_list_item') {
      const items = []
      while (i < blocks.length && blocks[i].type === 'bulleted_list_item') {
        items.push(`<li>${richTextToHtml(blocks[i].bulleted_list_item.rich_text)}</li>`)
        i++
      }
      html.push(`<ul>${items.join('')}</ul>`)
      continue
    }

    if (type === 'numbered_list_item') {
      const items = []
      while (i < blocks.length && blocks[i].type === 'numbered_list_item') {
        items.push(`<li>${richTextToHtml(blocks[i].numbered_list_item.rich_text)}</li>`)
        i++
      }
      html.push(`<ol>${items.join('')}</ol>`)
      continue
    }

    if (type === 'heading_1') html.push(`<h1>${richTextToHtml(b.heading_1.rich_text)}</h1>`)
    else if (type === 'heading_2') html.push(`<h2>${richTextToHtml(b.heading_2.rich_text)}</h2>`)
    else if (type === 'heading_3') html.push(`<h3>${richTextToHtml(b.heading_3.rich_text)}</h3>`)
    else if (type === 'paragraph') {
      const text = richTextToHtml(b.paragraph.rich_text)
      if (text) html.push(`<p>${text}</p>`)
    }
    else if (type === 'divider') html.push('<hr>')

    i++
  }
  return html.join('\n')
}

async function fetchOverpass(query) {
  for (let attempt = 0; attempt <= 1; attempt++) {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'TripSharer/1.0' },
      body: 'data=' + encodeURIComponent(query)
    })
    if (res.ok) return res.json()
    const body = await res.text().catch(() => '')
    const status = res.status
    // 504/429 且还有重试机会：等待后重试一次
    if (attempt === 0 && (status === 504 || status === 429)) {
      const wait = status === 429 ? 15000 : 8000
      console.warn(`  ⏳ Overpass ${status}，${wait / 1000}s 后重试...`)
      await new Promise(r => setTimeout(r, wait))
      continue
    }
    throw new Error(`Overpass HTTP ${status}: ${body.slice(0, 120)}`)
  }
}

function simplifyNodes(nodes, maxPts = 30) {
  const step = Math.max(1, Math.floor(nodes.length / maxPts))
  return nodes
    .filter((_, i) => i % step === 0 || i === nodes.length - 1)
    .slice(0, maxPts)
    .map(n => [+n.lat.toFixed(4), +n.lon.toFixed(4)])
}

async function fetchCityRoads(bbox) {
  const [s, w, n, e] = bbox
  const q1 = `[out:json][timeout:120];
(
  way["highway"~"motorway|trunk|primary"](${s},${w},${n},${e});
);
out geom;`
  const q2 = `[out:json][timeout:120];
(
  way["highway"~"secondary|tertiary"]["name"](${s},${w},${n},${e});
);
out geom;`
  const roads = { motorway: [], primary: [], secondary: [], tertiary: [] }
  const parse = (elements) => {
    for (const el of (elements || [])) {
      if (el.type !== 'way' || !el.geometry || el.geometry.length < 2) continue
      const pts = simplifyNodes(el.geometry)
      const hw = el.tags?.highway
      const named = !!(el.tags?.name || el.tags?.ref)
      if (pts.length < 4 && !named) continue
      if (hw === 'motorway' || hw === 'trunk') roads.motorway.push(pts)
      else if (hw === 'primary')   roads.primary.push(pts)
      else if (hw === 'secondary') roads.secondary.push(pts)
      else                         roads.tertiary.push(pts)
    }
  }
  const d1 = await fetchOverpass(q1)
  parse(d1.elements)
  await new Promise(r => setTimeout(r, 1000))
  const d2 = await fetchOverpass(q2)
  parse(d2.elements)
  roads.motorway  = roads.motorway.sort((a, b) => b.length - a.length).slice(0, 600)
  roads.primary   = roads.primary.sort((a, b) => b.length - a.length).slice(0, 1200)
  roads.secondary = roads.secondary.sort((a, b) => b.length - a.length).slice(0, 800)
  roads.tertiary  = roads.tertiary.sort((a, b) => b.length - a.length).slice(0, 1200)
  return roads
}

async function fetchCityResidential(bbox) {
  const [s, w, n, e] = bbox
  const midLat = (s + n) / 2
  const midLng = (w + e) / 2
  const tiles = [
    [s, w, midLat, midLng],
    [s, midLng, midLat, e],
    [midLat, w, n, midLng],
    [midLat, midLng, n, e],
  ]
  const ways = []
  for (const [ts, tw, tn, te] of tiles) {
    const q = `[out:json][timeout:60];
(
  way["highway"="residential"]["name"](${ts},${tw},${tn},${te});
  way["highway"="unclassified"]["name"](${ts},${tw},${tn},${te});
);
out geom;`
    try {
      const data = await fetchOverpass(q)
      for (const el of (data.elements || [])) {
        if (el.type !== 'way' || !el.geometry || el.geometry.length < 2) continue
        ways.push(simplifyNodes(el.geometry, 8))
      }
    } catch (e) {
      console.warn(`  住宅街道分块失败: ${e.message}`)
    }
    await new Promise(r => setTimeout(r, 1000))
  }
  return ways.sort((a, b) => b.length - a.length).slice(0, 2000)
}

function polygonAreaSqM(pts) {
  if (!pts || pts.length < 3) return 0
  const avgLat = pts.reduce((s, p) => s + p.lat, 0) / pts.length
  const cos = Math.cos(avgLat * Math.PI / 180)
  let area = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length]
    area += (b.lng - a.lng) * cos * (a.lat + b.lat)
  }
  return Math.abs(area) * 111000 * 111000 / 2
}

function isOceanic(tags, areaSqM = 0) {
  if (tags) {
    if (tags.natural === 'bay' || tags.natural === 'strait' || tags.natural === 'harbour') return true
    if (tags.natural === 'water' && ['bay', 'strait', 'lagoon', 'estuary', 'harbour'].includes(tags.water)) return true
  }
  return areaSqM > 5e6
}

// 将 multipolygon relation 的 outer member ways 首尾链接成单个完整闭合多边形
function chainOuterRings(members) {
  const segs = members
    .filter(m => m.role === 'outer' && m.geometry?.length >= 2)
    .map(m => [...m.geometry])
  if (!segs.length) return null
  const result = [...segs[0]]
  segs.splice(0, 1)
  while (segs.length > 0) {
    const last = result[result.length - 1]
    let bestIdx = -1, bestRev = false, bestDist = Infinity
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i]
      const dFwd = Math.hypot(s[0].lat - last.lat, s[0].lon - last.lon)
      const dRev = Math.hypot(s[s.length - 1].lat - last.lat, s[s.length - 1].lon - last.lon)
      if (dFwd < bestDist) { bestDist = dFwd; bestIdx = i; bestRev = false }
      if (dRev < bestDist) { bestDist = dRev; bestIdx = i; bestRev = true }
    }
    if (bestIdx === -1 || bestDist > 0.0002) break  // 容差约 22m
    const seg = segs.splice(bestIdx, 1)[0]
    if (bestRev) seg.reverse()
    result.push(...seg.slice(1))
  }
  if (result.length < 3) return null
  // 首尾 gap 过大说明环没闭合，强行闭合会产生穿越陆地的假水体
  const gapDeg = Math.hypot(
    result[result.length - 1].lat - result[0].lat,
    result[result.length - 1].lon - result[0].lon
  )
  if (gapDeg > 0.0045) return null  // ~500m
  return result
}

async function fetchCityWater(fullBbox, urbanBbox) {
  const [s, w, n, e] = fullBbox
  const q = `[out:json][timeout:120];
(
  way["natural"="water"](${s},${w},${n},${e});
  relation["type"="multipolygon"]["natural"~"water|bay|sea|strait|harbour"](${s},${w},${n},${e});
  way["landuse"="reservoir"](${s},${w},${n},${e});
  way["waterway"~"river|canal"](${s},${w},${n},${e});
);
out geom;`
  const data = await fetchOverpass(q)
  const water = []
  for (const el of (data.elements || [])) {
    const tags = el.tags
    if (el.type === 'way' && el.geometry?.length >= 2) {
      const isArea = tags?.natural === 'bay' || tags?.natural === 'strait' ||
                     tags?.natural === 'water' || tags?.landuse === 'reservoir'
      const areaSqM = isArea ? polygonAreaSqM(el.geometry) : 0
      const oceanic = isOceanic(tags, areaSqM)
      const pts = simplifyNodes(el.geometry, isArea ? 50 : 30)
      water.push({ area: isArea, oceanic, pts })
    } else if (el.type === 'relation' && Array.isArray(el.members)) {
      const ring = chainOuterRings(el.members)
      if (!ring) continue
      const oceanic = isOceanic(tags, 0)
      const pts = simplifyNodes(ring, 100)
      // 简化后再检一次首尾 gap：simplifyNodes 的步长采样会丢弃原始最后一个节点
      const ptsGap = Math.hypot(pts[pts.length-1][0] - pts[0][0], pts[pts.length-1][1] - pts[0][1])
      if (ptsGap > 0.0045) continue  // ~500m，跳过未闭合的残缺多边形
      water.push({ area: true, oceanic, pts })
    }
  }
  return water.sort((a, b) => b.pts.length - a.pts.length).slice(0, 800)
}

// 将 Notion City 字段解析为 config key，支持中英文（反查 cityZhNames）
function normalizeCityKey(c, trip = null) {
  const direct = (c || '').toLowerCase().replace(/\s+/g, '')
  if (!trip) return direct
  if (trip.cityPageIds?.[direct]) return direct
  const entry = Object.entries(trip.cityZhNames || {}).find(([, zh]) => zh === c)
  return entry ? entry[0] : direct
}

function distMeters(a, b) {
  const R = 6371000
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLng = (b.lng - a.lng) * Math.PI / 180
  const sinLat = Math.sin(dLat / 2)
  const sinLng = Math.sin(dLng / 2)
  const c = sinLat * sinLat + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * sinLng * sinLng
  return R * 2 * Math.atan2(Math.sqrt(c), Math.sqrt(1 - c))
}

function clusterPlaces(places, thresholdM = 1500) {
  const clusters = []
  for (const place of places) {
    if (!place.lat || !place.lng) continue
    const same = clusters.filter(c => c.city === normalizeCityKey(place.city))
    const near = same.find(c => distMeters(c.centroid, place) <= thresholdM)
    if (near) {
      near.places.push(place)
      near.placeIds.push(place.id)
      near.centroid.lat = near.places.reduce((s, p) => s + p.lat, 0) / near.places.length
      near.centroid.lng = near.places.reduce((s, p) => s + p.lng, 0) / near.places.length
    } else {
      clusters.push({ city: normalizeCityKey(place.city), centroid: { lat: place.lat, lng: place.lng }, placeIds: [place.id], places: [place] })
    }
  }
  return clusters
}

// 稳定 cluster key：用质心坐标而非 index，避免地点顺序变化导致 key 漂移
function makeClusterKey(city, centroid) {
  return `${city}-${centroid.lat.toFixed(3)}-${centroid.lng.toFixed(3)}`
}

async function main() {
  if (FULL) console.log('[Full] 强制模式：忽略地理缓存，重新抓取所有 Overpass/Nominatim 数据')
  console.log(`\n获取 ${TRIP_ID} 数据...`)

  // 预加载所有现有 JSON（base + per-city），供后续缓存判断统一使用
  let existingBase = {}
  try { existingBase = JSON.parse(readFileSync(`data/${TRIP_ID}.json`, 'utf8')) } catch (_) {}

  const existingCity = {}
  for (const city of Object.keys(trip.cityPageIds || {})) {
    try { existingCity[city] = JSON.parse(readFileSync(`data/${TRIP_ID}-${city}.json`, 'utf8')) } catch (_) {}
    existingCity[city] = existingCity[city] || {}
  }

  // ── 1. Notion 数据（每次必抓）────────────────────────────────────────────
  console.log('\n[Fetch] Notion places...')
  const places = await fetchPlaces()
  console.log(`  ${places.length} 个地点`)

  // 将 Notion city 字段统一解析为 config key（支持中英文）
  for (const place of places) place.city = normalizeCityKey(place.city, trip)

  // geocoding：仅对 Notion 中缺坐标的地点跑，已有坐标直接用
  const existingCoords = {}
  for (const p of (existingBase.places || [])) if (p.lat) existingCoords[p.id] = { lat: p.lat, lng: p.lng }

  let geocoded = 0
  for (const place of places) {
    if (place.lat !== null) continue
    const cityBbox = trip.cityUrbanBBox?.[normalizeCityKey(place.city)] || null
    const cleanAddress = trip.region === 'domestic'
      // 国内保留中文，去掉括号备注（括号内容通常是景区说明，非地址）
      ? (place.address || '').replace(/[（(][^）)]*[）)]/g, '').trim()
      // 国际过滤 CJK 防止从中文 app 复制的乱码混入
      : (place.address || '').replace(/[　-鿿豈-﫿]/g, '').trim()
    // 国内：含乡/镇/街/路/号/村的精确地址加入搜索有帮助；纯区级行政地址会带偏高德结果
    const addressForSearch = (trip.region === 'domestic' && !/[乡镇街路号村巷弄]/.test(cleanAddress))
      ? ''
      : cleanAddress
    let searchTerm = ''
    if (place.name && addressForSearch) searchTerm = `${place.name}, ${addressForSearch}`
    else if (place.name && place.city) searchTerm = `${place.name}, ${trip.region === 'domestic' ? (trip.cityZhNames?.[place.city] || place.city) : `${place.city}, ${trip.countryName || 'Australia'}`}`
    else if (addressForSearch) searchTerm = addressForSearch
    if (!searchTerm) continue

    const cityHint = trip.region === 'domestic' ? (trip.cityZhNames?.[place.city] || '') : ''
    // 餐厅/购物/酒店必须在本市，跳过全局搜索直接用城市限定；景点可能是日游邻市，先全局搜
    const skipNoHint = trip.region === 'domestic' && /餐厅|购物|酒店|住宿/.test(place.category || '')
    const coords = await geocode(searchTerm, cityBbox, trip.region === 'domestic', cityHint, skipNoHint, place.name)
    if (coords) {
      place.lat = coords.lat
      place.lng = coords.lng
      geocoded++
      console.log(`  已编码: ${place.name} (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`)
    } else if (existingCoords[place.id]) {
      place.lat = existingCoords[place.id].lat
      place.lng = existingCoords[place.id].lng
      console.warn(`  ↩ geocode 失败，用旧坐标: ${place.name}`)
    } else {
      console.warn(`  ✗ 无坐标: ${place.name}`)
    }
    await new Promise(r => setTimeout(r, 1000))
  }
  if (geocoded > 0) console.log(`  共编码 ${geocoded} 个地址`)

  console.log('\n[Fetch] Notion pages (title / overview / city notes)...')
  const title = await fetchTripTitle(trip.overviewPageId)
  const ogDescription = await fetchOgDescription(trip.overviewPageId)
  if (ogDescription) console.log(`  og description: "${ogDescription}"`)
  const overviewLabel = await fetchPageTitle(trip.overviewPageId)
  const overviewBlocks = await fetchPageBlocks(trip.overviewPageId)
  const overview = blocksToHtml(overviewBlocks)

  const cityColors = { ...trip.cityColors }
  const cityNotes = {}
  const cityLabels = {}
  for (const [city, pageId] of Object.entries(trip.cityPageIds || {})) {
    cityLabels[city] = trip.cityZhNames?.[city] || await fetchPageTitle(pageId)
    const rawBlocks = await fetchPageBlocks(pageId)
    const { color, blocks } = extractCityColor(rawBlocks)
    if (color) {
      cityColors[city] = color
      console.log(`  ${city} 主题色: ${color} (Notion)`)
    }
    cityNotes[city] = blocksToHtml(blocks)
  }

  // 未指定颜色的城市从调色板自动分配，跳过已使用色值确保不重复
  const CITY_PALETTE = [
    '#E85D4A', '#F4A261', '#2A9D8F', '#457B9D', '#9B5DE5',
    '#D4A24A', '#C2546A', '#6B9E6B', '#3D9E7A', '#2C4E6E',
    '#A37056', '#8E7AB5', '#E4906B'
  ]
  // config 原始色 + Notion 覆盖色都纳入排除集，避免自动分配色与任一来源撞色
  const usedColors = new Set([
    ...Object.values(trip.cityColors || {}),
    ...Object.values(cityColors)
  ].map(c => c?.toUpperCase()).filter(Boolean))
  let paletteIdx = 0
  for (const city of Object.keys(trip.cityPageIds || {})) {
    if (cityColors[city]) continue
    while (paletteIdx < CITY_PALETTE.length && usedColors.has(CITY_PALETTE[paletteIdx].toUpperCase())) paletteIdx++
    const assigned = CITY_PALETTE[paletteIdx % CITY_PALETTE.length]
    cityColors[city] = assigned
    usedColors.add(assigned.toUpperCase())
    paletteIdx++
    console.log(`  ${city} 主题色: ${assigned} (自动分配)`)
  }

  // ── 2. 城市边界（持久缓存；--full 强制重抓）──────────────────────────────
  console.log('\n城市边界...')
  const cityBoundaries = {}
  const cityPoiBounds = {}

  for (const [city] of Object.entries(trip.cityPageIds || {})) {
    const cached = existingBase.cityBoundaries?.[city]
    const cityPlaces = places.filter(p => p.city && normalizeCityKey(p.city) === city && Number.isFinite(p.lat))
    cityPoiBounds[city] = buildPoiBounds(cityPlaces) || null

    if (!FULL && cached?.length > 10) {
      cityBoundaries[city] = cached
      console.log(`  [Skip] ${city}: 边界已缓存 (${cached.length} 个点)`)
      continue
    }

    const searchTerm = trip.citySearchTerms?.[city] || `${city}, Australia`
    const cityZhName = trip.cityZhNames?.[city]
    const isDomestic = trip.region === 'domestic'
    console.log(`  [Fetch] ${city}: ${isDomestic && cityZhName ? `高德(${cityZhName})` : searchTerm}`)
    const boundary = isDomestic && cityZhName
      ? (await fetchCityBoundaryGaode(cityZhName) || await fetchCityBoundary(searchTerm))
      : await fetchCityBoundary(searchTerm)
    if (boundary) {
      cityBoundaries[city] = boundary
      console.log(`  ✓ ${city}: ${boundary.length} 个点`)
    } else if (cached?.length > 10) {
      cityBoundaries[city] = cached
      console.log(`  ↩ ${city}: 抓取失败，使用旧边界 (${cached.length} 个点)`)
    } else {
      console.warn(`  ✗ ${city}: 未找到边界`)
    }
    await new Promise(r => setTimeout(r, 1100))
  }

  // ── 3. 路网 / 水域 / 住宅街道（持久缓存；--full 强制重抓）────────────────
  console.log('\n城市路网 / 水域 / 住宅街道...')
  const cityRoads = {}
  const cityWater = {}
  const cityResidential = {}

  for (const [city] of Object.entries(trip.cityPageIds || {})) {
    const adminBoundary = cityBoundaries[city]
    if (!adminBoundary?.length) continue

    const ex = existingCity[city]
    const lats = adminBoundary.map(p => p.lat)
    const lngs = adminBoundary.map(p => p.lng)
    const fullBbox = [
      (Math.min(...lats) - 0.01).toFixed(4),
      (Math.min(...lngs) - 0.01).toFixed(4),
      (Math.max(...lats) + 0.01).toFixed(4),
      (Math.max(...lngs) + 0.01).toFixed(4)
    ]
    const urbanBbox = trip.cityUrbanBBox?.[city] || fullBbox

    // 路网
    const cachedRoads = ex?.cityRoads?.[city]
    if (!FULL && cachedRoads?.motorway?.length > 0) {
      cityRoads[city] = cachedRoads
      const r = cachedRoads
      console.log(`  [Skip] ${city}: 路网已缓存 (motorway=${r.motorway.length} primary=${r.primary.length})`)
    } else {
      console.log(`  [Fetch] ${city}: 路网 bbox=${urbanBbox}`)
      try {
        cityRoads[city] = await fetchCityRoads(urbanBbox)
        const r = cityRoads[city]
        console.log(`  ✓ ${city}: motorway=${r.motorway.length} primary=${r.primary.length} secondary=${r.secondary.length} tertiary=${r.tertiary.length}`)
      } catch (e) {
        console.warn(`  ✗ ${city} 路网失败: ${e.message}`)
        cityRoads[city] = cachedRoads || { motorway: [], primary: [], secondary: [], tertiary: [] }
        console.log(`  ↩ ${city}: 使用旧路网`)
      }
      await new Promise(r => setTimeout(r, 2000))
    }

    // 水域
    const cachedWater = ex?.cityWater?.[city]
    if (!FULL && cachedWater?.length > 0) {
      cityWater[city] = cachedWater
      console.log(`  [Skip] ${city}: 水域已缓存 (${cachedWater.length} 个要素)`)
    } else {
      console.log(`  [Fetch] ${city}: 水域`)
      try {
        cityWater[city] = await fetchCityWater(fullBbox, urbanBbox)
        console.log(`  ✓ ${city}: ${cityWater[city].length} 个水域要素`)
      } catch (e) {
        console.warn(`  ✗ ${city} 水域失败: ${e.message}`)
        cityWater[city] = cachedWater || []
        console.log(`  ↩ ${city}: 使用旧水域`)
      }
      await new Promise(r => setTimeout(r, 2000))
    }

    // 住宅街道
    const cachedRes = ex?.cityResidential?.[city]
    if (!FULL && cachedRes?.length > 0) {
      cityResidential[city] = cachedRes
      console.log(`  [Skip] ${city}: 住宅街道已缓存 (${cachedRes.length} 条)`)
    } else {
      console.log(`  [Fetch] ${city}: 住宅街道`)
      try {
        const newRes = await fetchCityResidential(urbanBbox)
        if (newRes.length > 0) {
          cityResidential[city] = newRes
          console.log(`  ✓ ${city}: ${newRes.length} 条`)
        } else if (cachedRes?.length > 0) {
          cityResidential[city] = cachedRes
          console.log(`  ↩ ${city}: 新数据为空，保留旧住宅街道 (${cachedRes.length} 条)`)
        } else {
          cityResidential[city] = []
        }
      } catch (e) {
        console.warn(`  ✗ ${city} 住宅街道失败: ${e.message}`)
        cityResidential[city] = cachedRes || []
        console.log(`  ↩ ${city}: 使用旧住宅街道`)
      }
      await new Promise(r => setTimeout(r, 2000))
    }
  }

  // ── 4. 聚类路网（按 key 增量；--full 全量重抓）───────────────────────────
  console.log('\n地点聚类路网...')
  const clusters = clusterPlaces(places)
  console.log(`  ${clusters.length} 个簇`)
  const clusterRoads = {}

  for (const cl of clusters) {
    const key = makeClusterKey(cl.city, cl.centroid)
    const maxDist = cl.places.reduce((m, p) => Math.max(m, distMeters(cl.centroid, p)), 0)
    const radius = Math.round(maxDist + 2000)
    const cached = existingCity[cl.city]?.clusterRoads?.[key]
    const names = cl.places.map(p => p.name).join(', ')

    if (!FULL && cached?.length > 0) {
      clusterRoads[key] = cached
      console.log(`  [Skip] ${key} (${names}): ${cached.length} 条`)
    } else {
      const tag = cached?.length > 0 ? '[Update]' : '[New]'
      console.log(`  ${tag} ${key} (${names}) radius=${radius}m`)
      const q = `[out:json][timeout:60];
(
  way["highway"~"motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street|service"](around:${radius},${cl.centroid.lat},${cl.centroid.lng});
);
out geom;`
      try {
        const data = await fetchOverpass(q)
        const ways = []
        for (const el of (data.elements || [])) {
          if (el.type !== 'way' || !el.geometry || el.geometry.length < 2) continue
          ways.push(simplifyNodes(el.geometry, 20))
        }
        clusterRoads[key] = ways
        console.log(`  ✓ ${key}: ${ways.length} 条`)
      } catch (e) {
        console.warn(`  ✗ ${key} 失败: ${e.message}`)
        if (cached?.length > 0) {
          clusterRoads[key] = cached
          console.log(`  ↩ ${key}: 使用旧路网 (${cached.length} 条)`)
        }
      }
      await new Promise(r => setTimeout(r, 2000))
    }

    for (const place of cl.places) place.clusterId = key
  }

  // ── 5. 写出文件 ────────────────────────────────────────────────────────
  mkdirSync('data', { recursive: true })

  const base = { title, ogDescription, overviewLabel, theme: trip.theme, region: trip.region || 'international', cityColors, cityLabels, cityBoundaries, cityPoiBounds, overview, cityNotes, places }
  writeFileSync(`data/${TRIP_ID}.json`, JSON.stringify(base), 'utf8')
  console.log(`\n已生成 data/${TRIP_ID}.json (base)`)

  for (const city of Object.keys(trip.cityPageIds || {})) {
    const oldClusterKeys = Object.keys(existingCity[city]?.clusterRoads || {})
    const newClusterRoads = Object.fromEntries(
      Object.entries(clusterRoads).filter(([k]) => k.startsWith(city + '-'))
    )

    // 自动清理不再关联任何 POI 的旧簇路网
    const staleKeys = oldClusterKeys.filter(k => !newClusterRoads[k])
    if (staleKeys.length > 0) {
      console.log(`  [Remove] ${city}: 清理 ${staleKeys.length} 个旧簇 key (${staleKeys.join(', ')})`)
    }

    const cityOutput = {
      cityRoads:       { [city]: cityRoads[city] || existingCity[city]?.cityRoads?.[city] || { motorway: [], primary: [], secondary: [], tertiary: [] } },
      cityWater:       { [city]: cityWater[city] || existingCity[city]?.cityWater?.[city] || [] },
      cityResidential: { [city]: cityResidential[city] || existingCity[city]?.cityResidential?.[city] || [] },
      clusterRoads:    newClusterRoads
    }
    writeFileSync(`data/${TRIP_ID}-${city}.json`, JSON.stringify(cityOutput), 'utf8')
    console.log(`已生成 data/${TRIP_ID}-${city}.json`)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
