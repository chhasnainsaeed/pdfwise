// Runs last in `npm run build`: writes dist/sw.js from scripts/sw-template.js with the list of
// every built file to keep for offline use and a version derived from their contents, so each
// deploy installs a fresh cache and drops the old one.

import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const SKIP = new Set([
  'sw.js',
  'sitemap.xml',
  'robots.txt',
  'llms.txt',
  '404.html',
  '_headers',
  'security-headers.json',
])

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

// Core: what every page needs to open offline. Pages, the entry script and styles it loads, icons and
// the manifest. The rest (each tool's code, pdf.js, qpdf, the 3D scene) is precached too, except on
// Data Saver or 2G, where it's cached the first time it's used instead.
const entry = readFileSync(path.join(dist, 'index.html'), 'utf8')
const entryAssets = new Set([...entry.matchAll(/(?:src|href)="\/(assets\/[^"]+)"/g)].map((m) => `/${m[1]}`))
const isCore = (u) => (!u.startsWith('/assets/') && !u.startsWith('/ocr/')) || entryAssets.has(u)
const core = urls.filter(isCore)
// The OCR engine (~8 MB) is cached the first time OCR is used rather than precached.
const rest = urls.filter((u) => !isCore(u) && !u.startsWith('/ocr/'))
const kb = (list) =>
  (
    list.reduce(
      (n, u) =>
        n +
        statSync(
          path.join(
            dist,
            u === '/' ? 'index.html' : u.startsWith('/assets/') || u.includes('.') ? u.slice(1) : `${u.slice(1)}.html`,
          ),
        ).size,
      0,
    ) /
    1024 /
    1024
  ).toFixed(1)

const sw = template
  .replace('__VERSION__', version)
  .replace('__PRECACHE_CORE__', JSON.stringify(core, null, 2))
  .replace('__PRECACHE_REST__', JSON.stringify(rest, null, 2))
writeFileSync(path.join(dist, 'sw.js'), sw)

console.log(
  `[pwa] sw.js ${version}: core ${core.length} files (${kb(core)} MB), rest ${rest.length} (${kb(rest)} MB, skipped on Data Saver); OCR engine cached on first use`,
)
