import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

export { escapeHtml as esc } from '../util.js'

const BASE_CSS = `
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{color:#111;-webkit-print-color-adjust:exact;print-color-adjust:exact}
img{max-width:100%}
`

/** A complete, self-contained HTML document. */
export const page = (css, body) =>
  `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}${css}</style></head><body>${body}</body></html>`

/** ODF/CSS length ("2cm", "0.5in", "12pt", "3mm", "10px") → points. */
export function toPt(len, fallback = 0) {
  const m = /^(-?[\d.]+)\s*(cm|mm|in|pt|pc|px)?$/.exec(String(len ?? '').trim())
  if (!m) return fallback
  const v = Number(m[1])
  return { cm: v * 28.3465, mm: v * 2.83465, in: v * 72, pt: v, pc: v * 12, px: v * 0.75 }[m[2] ?? 'pt']
}

const MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  webp: 'image/webp',
}

/** Data URI for an image inside a zip (null for formats browsers can't show, like EMF/WMF). */
export async function zipImage(zip, path) {
  const mime = MIME[path.split('.').pop().toLowerCase()]
  const file = zip.file(path)
  return mime && file ? `data:${mime};base64,${await file.async('base64')}` : null
}

const require = createRequire(import.meta.url)
const scripts = new Map()

/** Folder of an installed package (works even when its "exports" hide subpaths). */
function packageRoot(pkg) {
  let dir = path.dirname(require.resolve(pkg))
  while (dir !== path.dirname(dir)) {
    const manifest = path.join(dir, 'package.json')
    if (existsSync(manifest) && JSON.parse(readFileSync(manifest, 'utf8')).name === pkg) return dir
    dir = path.dirname(dir)
  }
  throw new Error(`Can't find the ${pkg} package`)
}

/** Source of a browser bundle shipped in a package, for injecting into the print page. */
export function browserScript(pkg, file) {
  const key = `${pkg}/${file}`
  if (!scripts.has(key)) scripts.set(key, readFileSync(path.join(packageRoot(pkg), file), 'utf8'))
  return scripts.get(key)
}
