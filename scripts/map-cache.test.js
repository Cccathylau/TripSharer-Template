import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { cachedCoordinates, clusterRoadFallback, usableCoordinates } from './map-cache.js'

const oldPlaces = [
  { id: 'a', city: 'sydney', name: 'Chinatown', address: 'Dixon St', lat: -33.87815, lng: 151.204, clusterId: 'sydney--33.882-151.209' },
  { id: 'b', city: 'sydney', name: 'Cafe', address: '490 Crown St', lat: -33.8868, lng: 151.2139, clusterId: 'sydney--33.882-151.209' }
]
const roads = [[[-33.88, 151.20], [-33.89, 151.21]]]
const roadCache = { [oldPlaces[0].clusterId]: roads }
const cluster = places => ({ city: 'sydney', places })

test('reuse automatic coordinates only when search inputs are unchanged', () => {
  const current = { ...oldPlaces[0], lat: null, lng: null }
  assert.deepEqual(cachedCoordinates(current, oldPlaces[0]), { lat: oldPlaces[0].lat, lng: oldPlaces[0].lng })
  for (const field of ['name', 'address', 'city']) assert.equal(cachedCoordinates({ ...current, [field]: 'changed' }, oldPlaces[0]), null)
  assert.equal(cachedCoordinates({ ...current, lng: 150 }, oldPlaces[0]), null)
  assert.equal(cachedCoordinates(current, { ...oldPlaces[0], lat: null }), null)
})

test('retain a nearby old road cache only for identical cluster membership', () => {
  const shifted = oldPlaces.map(p => ({ ...p, lat: p.lat - 0.00005 }))
  assert.equal(clusterRoadFallback(cluster(shifted), oldPlaces, roadCache)?.roads, roads)
  assert.equal(clusterRoadFallback(cluster([shifted[0]]), oldPlaces, roadCache), null)
  assert.equal(clusterRoadFallback(cluster([...shifted, { ...shifted[0], id: 'c' }]), oldPlaces, roadCache), null)
  assert.equal(clusterRoadFallback(cluster(shifted.map(p => ({ ...p, lat: p.lat - 0.01 }))), oldPlaces, roadCache), null)
  assert.equal(clusterRoadFallback(cluster(shifted.map(p => ({ ...p, city: 'melbourne' }))), oldPlaces, roadCache), null)
})

// Execute the real fetch workflow with in-memory files and stubbed services.
// No Notion credentials, map service, or user files are used by these tests.
async function runFetch({ shifted = false, empty = false, full = false } = {}) {
  const boundary = Array.from({ length: 12 }, (_, i) => ({ lat: -34 + i * 0.01, lng: 151 + i * 0.01 }))
  const files = new Map([
    ['data/my-trip.json', JSON.stringify({ region: 'international', places: oldPlaces, cityBoundaries: { sydney: boundary } })],
    ['data/my-trip-sydney.json', JSON.stringify({ cityRoads: { sydney: { motorway: roads, primary: [], secondary: [], tertiary: [] } }, cityWater: { sydney: [{}] }, cityResidential: { sydney: roads }, clusterRoads: roadCache })]
  ])
  const incoming = oldPlaces.map(p => ({ ...p, lat: shifted ? p.lat - 0.00005 : null, lng: shifted ? p.lng : null }))
  let geocodes = 0, mapRequests = 0
  const context = vm.createContext({
    TRIPS: { 'my-trip': { databaseId: 'fixture', overviewPageId: 'overview', cityPageIds: { sydney: 'page' }, region: 'international', cityColors: {} } },
    process: { argv: ['node', 'fetch-notion.js', 'my-trip', ...(full ? ['--full'] : [])], env: {} },
    cachedCoordinates, clusterRoadFallback, usableCoordinates,
    console: { log() {}, warn() {}, error() {} }, setTimeout: callback => callback(),
    readFileSync: file => { if (!files.has(file)) throw new Error('missing'); return files.get(file) },
    writeFileSync: (file, body) => files.set(file, body), mkdirSync() {},
    fetch: () => { throw new Error('Unexpected real network access') },
    getPlaces: async () => incoming.map(p => ({ ...p })),
    geocodeFixture: async address => { geocodes++; return { lat: -33.88, lng: 151.21 } },
    roadsFixture: async () => { mapRequests++; if (empty) return { elements: [] }; throw new Error('service unavailable') },
    boundaryFixture: async () => boundary,
    cityRoadFixture: async () => ({ motorway: roads, primary: [], secondary: [], tertiary: [] }),
    waterFixture: async () => [{}],
    residentialFixture: async () => roads
  })
  let source = readFileSync(new URL('./fetch-notion.js', import.meta.url), 'utf8')
  source = source.replace(/^import .*$/gm, '')
  source = source.slice(0, source.lastIndexOf('main().catch'))
  await vm.runInContext(`${source}
    fetchPlaces = getPlaces;
    fetchTripTitle = async () => 'Fixture'; fetchOgDescription = async () => '';
    fetchPageTitle = async () => 'City'; fetchPageBlocks = async () => [];
    geocode = geocodeFixture; fetchOverpass = roadsFixture;
    fetchCityBoundary = boundaryFixture; fetchCityRoads = cityRoadFixture;
    fetchCityWater = waterFixture; fetchCityResidential = residentialFixture;
    main();`, context)
  return { base: JSON.parse(files.get('data/my-trip.json')), city: JSON.parse(files.get('data/my-trip-sydney.json')), geocodes, mapRequests }
}

test('normal refresh preserves coordinates and avoids unnecessary geocoding and road requests', async () => {
  const result = await runFetch()
  assert.equal(result.geocodes, 0)
  assert.equal(result.mapRequests, 0)
  assert.equal(result.base.places[0].clusterId, oldPlaces[0].clusterId)
  assert.deepEqual(result.city.clusterRoads[oldPlaces[0].clusterId], roads)
})

for (const empty of [false, true]) {
  test(`a centroid crossing a rounded key retains roads after ${empty ? 'empty response' : 'network failure'}`, async () => {
    const result = await runFetch({ shifted: true, empty })
    assert.equal(result.mapRequests, 1)
    const key = result.base.places[0].clusterId
    assert.notEqual(key, oldPlaces[0].clusterId)
    assert.deepEqual(result.city.clusterRoads[key], roads)
    assert.equal(result.city.clusterRoads[oldPlaces[0].clusterId], undefined)
  })
}

test('full refresh still retries geocoding instead of permanently freezing old coordinates', async () => {
  const result = await runFetch({ full: true })
  assert.equal(result.geocodes, 2)
  assert.equal(result.base.places[0].lat, -33.88)
})
