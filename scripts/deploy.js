import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
for (const script of ['build.js', 'upload-cos.js']) {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL(script, import.meta.url)), ...args], { stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
