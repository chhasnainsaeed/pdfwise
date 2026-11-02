// Runs last in `npm run build`: writes dist/sw.js from scripts/sw-template.js with the list of
// every built file to keep for offline use and a version derived from their contents, so each
// deploy installs a fresh cache and drops the old one.

import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const SKIP = new Set(['sw.js', 'sitemap.xml', 'robots.txt', 'llms.txt'])

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

const files = walk(dist)
  .map((f) => path.relative(dist, f).split(path.sep).join('/'))
  .filter((f) => !SKIP.has(f) && !f.endsWith('.map'))
  .sort()

const template = readFileSync(path.join(root, 'scripts', 'sw-template.js'), 'utf8')
const hash = createHash('sha256').update(template)
for (const f of files) hash.update(f).update(readFileSync(path.join(dist, f)))
const version = hash.digest('hex').slice(0, 12)

// Pre-rendered pages are cached under their clean URLs (/merge-pdf), the way they're requested.
const urls = files.map((f) => (f === 'index.html' ? '/' : f.endsWith('.html') ? `/${f.slice(0, -5)}` : `/${f}`))

const sw = template
  .replace('__VERSION__', version)
  .replace('__PRECACHE__', JSON.stringify(urls, null, 2))
writeFileSync(path.join(dist, 'sw.js'), sw)

const bytes = files.reduce((n, f) => n + statSync(path.join(dist, f)).size, 0)
console.log(`[pwa] sw.js ${version}: ${urls.length} files (${(bytes / 1024 / 1024).toFixed(1)} MB) available offline`)
