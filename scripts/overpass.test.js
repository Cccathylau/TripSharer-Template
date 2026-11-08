import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const source = readFileSync(new URL('./fetch-notion.js', import.meta.url), 'utf8')
const start = source.indexOf('async function fetchOverpass(query) {')
const implementation = source.slice(start, source.indexOf('\nfunction simplifyNodes', start))
function fixture(responses) {
  let calls = 0
  const delays = [], warnings = []
  const context = vm.createContext({
    AbortSignal, SyntaxError,
    console: { warn: message => warnings.push(message) },
    setTimeout: (callback, delay) => { delays.push(delay); callback() },
    fetch: async (url, options) => {
      assert.equal(url, 'https://overpass-api.de/api/interpreter')
      assert.ok(options.signal)
      assert.equal(options.body, 'data=query')
      const response = responses[Math.min(calls++, responses.length - 1)]
      if (response instanceof Error) throw response
      return { ok: response === 200, status: response, json: async () => ({ elements: [] }), body: { cancel: async () => {} } }
    }
  })
  return { run: () => vm.runInContext(implementation + '\nfetchOverpass("query")', context), calls: () => calls, delays, warnings }
}

test('connection failure retries and can recover', async () => {
  const f = fixture([Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNRESET' } }), 200])
  assert.equal((await f.run()).elements.length, 0)
  assert.equal(f.calls(), 2)
  assert.deepEqual(f.delays, [2000])
  assert.match(f.warnings[0], /ECONNRESET/)
})
for (const [code, message] of [['ENOTFOUND', /无法解析/], ['UND_ERR_CONNECT_TIMEOUT', /超时/]]) {
  test(`${code} stops after three attempts with a useful message`, async () => {
    const f = fixture([Object.assign(new Error('fetch failed'), { cause: { code } })])
    await assert.rejects(f.run(), message)
    assert.equal(f.calls(), 3)
    assert.deepEqual(f.delays, [2000, 4000])
  })
}
test('HTTP 400 is not retried', async () => {
  const f = fixture([400])
  await assert.rejects(f.run(), /HTTP 400.*已尝试 1 次/)
  assert.equal(f.calls(), 1)
})
test('rate limit and server failure retry before recovery', async () => {
  const f = fixture([429, 504, 200])
  await f.run()
  assert.equal(f.calls(), 3)
  assert.deepEqual(f.delays, [15000, 4000])
})
