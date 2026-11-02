// PDFwise conversion server.
//   POST /api/convert/pdf   Office document → PDF (LibreOffice if installed, else the built-in converter)
//   POST /api/convert/url   Web page → PDF (installed Chrome/Edge)
// Also serves the production build from ../dist when it exists.
//
//   npm run server            # http://127.0.0.1:3001
//
// Environment: PORT, HOST, CONVERTER (auto | libreoffice | builtin), SOFFICE_PATH, CHROME_PATH,
// MAX_UPLOAD_MB, CONVERT_TIMEOUT_S, CONVERT_CONCURRENCY, BROWSER_CONCURRENCY, ALLOW_PRIVATE_URLS,
// BASIC_AUTH (user:password), RATE_LIMIT_PER_MIN, TRUST_PROXY

import express from 'express'
import { createHash, timingSafeEqual } from 'node:crypto'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { findBrowser, renderPdf } from './engines/browser.js'
import { LIBREOFFICE_FORMATS, findSoffice, libreofficeToPdf } from './engines/libreoffice.js'
import { BUILTIN_FORMATS, BUILTIN_NOTES, officeDocument } from './office/index.js'
import { urlProblem } from './url-guard.js'
import { HttpError } from './util.js'

const PORT = Number(process.env.PORT) || 3001
const HOST = process.env.HOST || '127.0.0.1'
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB) || 100
const CONVERTER = (process.env.CONVERTER || 'auto').toLowerCase()
const BASIC_AUTH = process.env.BASIC_AUTH || ''
const RATE_LIMIT = Number(process.env.RATE_LIMIT_PER_MIN ?? 30)

const digest = (s) => createHash('sha256').update(s).digest()

/** Optional HTTP Basic auth for the whole server (app + API), e.g. BASIC_AUTH=team:secret. */
function requireAuth(req, res, next) {
  const [scheme, value] = (req.get('authorization') || '').split(' ')
  const given = scheme === 'Basic' && value ? Buffer.from(value, 'base64').toString() : ''
  if (given && timingSafeEqual(digest(given), digest(BASIC_AUTH))) return next()
  res.set('WWW-Authenticate', 'Basic realm="PDFwise", charset="UTF-8"').status(401).send('Sign in to use PDFwise.')
}

// Fixed one-minute windows per client IP for the conversion endpoints.
const hits = new Map()
setInterval(() => {
  const now = Date.now()
  for (const [ip, h] of hits) if (now > h.reset) hits.delete(ip)
}, 60_000).unref()

function rateLimit(req, res, next) {
  if (!RATE_LIMIT) return next()
  const now = Date.now()
  let h = hits.get(req.ip)
  if (!h || now > h.reset) hits.set(req.ip, (h = { count: 0, reset: now + 60_000 }))
  if (++h.count <= RATE_LIMIT) return next()
  res.set('Retry-After', String(Math.ceil((h.reset - now) / 1000)))
  res.status(429).json({ error: 'Too many conversions in a short time. Wait a minute and try again.' })
}

/** Which engine converts Office files right now, and which extensions it accepts. */
function officeEngine() {
  const lo = CONVERTER !== 'builtin' && findSoffice()
  if (lo) return { name: 'libreoffice', formats: LIBREOFFICE_FORMATS }
  if (CONVERTER !== 'libreoffice' && findBrowser()) return { name: 'builtin', formats: BUILTIN_FORMATS }
  return { name: null, formats: [] }
}

const app = express()
app.disable('x-powered-by')
if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY)
if (BASIC_AUTH) app.use(requireAuth)
app.use('/api/convert', rateLimit)

app.get('/api/health', (req, res) => {
  const engine = officeEngine()
  res.json({
    ok: true,
    engine: engine.name,
    formats: engine.formats,
    notes: engine.name === 'builtin' ? BUILTIN_NOTES : {},
    libreoffice: Boolean(findSoffice()),
    browser: Boolean(findBrowser()),
    maxUploadMb: MAX_UPLOAD_MB,
  })
})

app.post('/api/convert/pdf', express.raw({ type: () => true, limit: `${MAX_UPLOAD_MB}mb` }), async (req, res) => {
  let name = ''
  try {
    name = decodeURIComponent(req.get('x-file-name') || '')
  } catch {
    // Malformed header; rejected by the extension check below.
  }
  const ext = path.extname(name).slice(1).toLowerCase()
  const engine = officeEngine()
  if (!engine.name) {
    return res.status(503).json({ error: 'No converter is available: install LibreOffice, or Chrome/Edge for the built-in converter.' })
  }
  if (!engine.formats.includes(ext)) {
    const extra = engine.name === 'builtin' && LIBREOFFICE_FORMATS.includes(ext) ? ' It needs LibreOffice on the server.' : ''
    return res.status(415).json({ error: `.${ext || '?'} files can’t be converted here.${extra} Supported: ${engine.formats.join(', ')}.` })
  }
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ error: 'The file is empty.' })
  const started = Date.now()
  try {
    const title = path.basename(name, path.extname(name)).slice(0, 200)
    const pdf =
      engine.name === 'libreoffice' ? await libreofficeToPdf(req.body, ext) : await renderPdf(await officeDocument(req.body, ext), { title })
    console.log(`[convert] .${ext} ${(req.body.length / 1024).toFixed(0)} KB → PDF via ${engine.name} in ${Date.now() - started} ms`)
    res.type('application/pdf').send(pdf)
  } catch (e) {
    if (!(e instanceof HttpError)) console.error('[convert]', e)
    res.status(e.status || 500).json({ error: e instanceof HttpError ? e.message : 'Conversion failed on the server.' })
  }
})

app.post('/api/convert/url', express.json({ limit: '16kb' }), async (req, res) => {
  const { url, format, landscape, margin, background, screen } = req.body ?? {}
  if (!findBrowser()) return res.status(503).json({ error: 'No Chrome or Edge browser was found on the server.' })
  const target = typeof url === 'string' ? url.trim() : ''
  const problem = await urlProblem(target, { mainFrame: true })
  if (problem) return res.status(400).json({ error: problem })
  const started = Date.now()
  try {
    const pdf = await renderPdf(
      { url: target },
      {
        format: format === 'Letter' ? 'Letter' : 'A4',
        landscape: Boolean(landscape),
        margin: ['none', 'small', 'normal'].includes(margin) ? margin : 'small',
        background: background !== false,
        screen: Boolean(screen),
      },
    )
    console.log(`[url] ${new URL(target).hostname} → PDF in ${Date.now() - started} ms`)
    res.type('application/pdf').send(pdf)
  } catch (e) {
    if (!(e instanceof HttpError)) console.error('[url]', e)
    res.status(e.status || 500).json({ error: e instanceof HttpError ? e.message : 'Couldn’t convert that page.' })
  }
})

// The installed app's share target. The service worker normally answers this; if it isn't
// running yet, just open the app instead of showing an error.
app.post('/share-target', (req, res) => res.redirect(303, '/'))

app.use((err, req, res, next) => {
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: `Files up to ${MAX_UPLOAD_MB} MB can be converted.` })
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'The request wasn’t valid JSON.' })
  next(err)
})

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist')
if (existsSync(dist)) {
  // Pre-rendered pages are dist/<page>.html, served at /<page>. Anything else is a 404 that
  // still loads the app (which shows its own "not found" page).
  app.use(express.static(dist, { extensions: ['html'] }))
  app.get('*', (req, res, next) => (req.path.startsWith('/api/') ? next() : res.status(404).sendFile(path.join(dist, 'index.html'))))
}

app.listen(PORT, HOST, () => {
  const engine = officeEngine()
  console.log(`PDFwise server listening on http://${HOST}:${PORT}`)
  console.log(`Office converter: ${engine.name ?? 'none'}${engine.name === 'builtin' ? ' (LibreOffice not found — using Chrome/Edge)' : ''}`)
  console.log(`Browser for URL → PDF: ${findBrowser() ?? 'not found'}`)
  if (BASIC_AUTH) console.log('Password protection: on')
  if (HOST !== '127.0.0.1' && HOST !== 'localhost' && !BASIC_AUTH) console.warn('Warning: listening beyond localhost without BASIC_AUTH.')
  if (existsSync(dist)) console.log(`Serving the app from ${dist}`)
})
