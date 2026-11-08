import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), 'tripsharer-build-'))
  try {
    mkdirSync(join(root, 'scripts'))
    mkdirSync(join(root, 'data'))
    writeFileSync(join(root, 'package.json'), '{"type":"module"}')
    writeFileSync(join(root, 'scripts/build.js'), readFileSync(new URL('./build.js', import.meta.url)))
    writeFileSync(join(root, 'scripts/build-og-cover.js'), 'export async function renderOgCover() {}')
    writeFileSync(join(root, 'trips.config.js'), 'export const TRIPS = {"my-trip": {cityPageIds: {sydney:"id"}}}')
    writeFileSync(join(root, 'index.html'), "<title>TripSharer</title><script>const DEFAULT_TRIP_ID = 'my-trip'</script>")
    for (const file of ['my-trip.json', 'my-trip-sydney.json', 'my-trip-private.json', 'other.json', 'other-sydney.json']) {
      writeFileSync(join(root, 'data', file), JSON.stringify({title:file}))
    }
    run(root, () => spawnSync(process.execPath, ['scripts/build.js', 'my-trip'], {cwd:root, encoding:'utf8'}))
  } finally { rmSync(root, {recursive:true, force:true}) }
}

test('build includes only the selected trip and configured cities', () => fixture((root, build) => {
  mkdirSync(join(root, 'dist/data'), {recursive:true})
  writeFileSync(join(root, 'dist/data/old-trip.json'), '{}')
  const result = build()
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(readdirSync(join(root, 'dist/data')).sort(), ['my-trip-sydney.json', 'my-trip.json'])
  for (const file of ['my-trip.json', 'my-trip-sydney.json']) assert.equal(readFileSync(join(root,'data',file),'utf8'),readFileSync(join(root,'dist/data',file),'utf8'))
}))

test('missing required city data stops before replacing the previous build', () => fixture((root, build) => {
  rmSync(join(root, 'data/my-trip-sydney.json'))
  mkdirSync(join(root, 'dist'))
  writeFileSync(join(root, 'dist/previous.txt'), 'keep')
  const result = build()
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /my-trip-sydney.json/)
  assert.ok(existsSync(join(root, 'dist/previous.txt')))
}))
