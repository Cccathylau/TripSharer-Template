import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { resolve, sep, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../dist/', import.meta.url))
try {
  await stat(resolve(root, 'index.html'))
} catch {
  console.error('请先运行 npm run build -- <trip-id>，再启动预览。')
  process.exit(1)
}

const types = { '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png' }
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
    const file = resolve(root, '.' + (path === '/' ? '/index.html' : path))
    if (!file.startsWith(resolve(root) + sep)) {
      res.writeHead(403).end()
      return
    }
    const body = await readFile(file)
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(body)
  } catch {
    res.writeHead(404).end('Not found')
  }
})
server.on('error', error => {
  console.error(error.message)
  process.exit(1)
})
server.listen(0, '127.0.0.1', () => {
  console.log(`本地预览：http://127.0.0.1:${server.address().port}/`)
  console.log('按 Ctrl+C 停止预览。')
})
