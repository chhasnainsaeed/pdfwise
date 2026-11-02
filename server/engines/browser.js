// Prints HTML or web pages to PDF with a Chromium browser that's already installed
// (Microsoft Edge ships with Windows). One headless browser is shared and closed when idle.

import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import puppeteer from 'puppeteer-core'
import { startEgressProxy } from '../egress-proxy.js'
import { urlProblem } from '../url-guard.js'
import { HttpError, limiter } from '../util.js'

const IDLE_MS = 5 * 60_000
const TIMEOUT_MS = (Number(process.env.CONVERT_TIMEOUT_S) || 120) * 1000
const queue = limiter(Math.max(1, Number(process.env.BROWSER_CONCURRENCY) || 3))
// Containers usually can't give Chromium the user namespaces its sandbox needs. Opt-in only:
// the sandbox stays on everywhere else.
const SANDBOX_ARGS = process.env.CHROME_NO_SANDBOX === '1' ? ['--no-sandbox'] : []

export function findBrowser() {
  if (process.env.CHROME_PATH) return existsSync(process.env.CHROME_PATH) ? process.env.CHROME_PATH : null
  const local = process.env.LOCALAPPDATA ?? ''
  const candidates =
    process.platform === 'win32'
      ? [
          'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
          'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
          path.join(local, 'Google\\Chrome\\Application\\chrome.exe'),
          path.join(local, 'Chromium\\Application\\chrome.exe'),
        ]
      : process.platform === 'darwin'
        ? [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
          ]
        : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge', '/snap/bin/chromium']
  return candidates.find((p) => existsSync(p)) ?? null
}

let browserPromise = null
let idleTimer = null
let active = 0

async function getBrowser() {
  if (browserPromise) {
    const b = await browserPromise.catch(() => null)
    if (b?.connected) return b
    browserPromise = null
  }
  const executablePath = findBrowser()
  if (!executablePath) throw new HttpError(503, 'No Chrome or Edge browser was found on the server.')
  const proxyPort = await startEgressProxy()
  browserPromise = puppeteer.launch({
    executablePath,
    headless: true,
    userDataDir: path.join(os.tmpdir(), 'pdfwise-browser-profile'),
    args: [
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-sync',
      '--disable-gpu',
      '--mute-audio',
      '--hide-scrollbars',
      ...SANDBOX_ARGS,
      // All page traffic goes through the checking proxy, loopback included.
      `--proxy-server=http://127.0.0.1:${proxyPort}`,
      '--proxy-bypass-list=<-loopback>',
    ],
  })
  try {
    const browser = await browserPromise
    browser.on('disconnected', () => {
      browserPromise = null
    })
    return browser
  } catch (e) {
    browserPromise = null
    throw new HttpError(500, `Couldn’t start the browser: ${e.message}`)
  }
}

function scheduleIdleClose() {
  clearTimeout(idleTimer)
  idleTimer = setTimeout(async () => {
    if (active > 0 || !browserPromise) return
    const b = await browserPromise.catch(() => null)
    browserPromise = null
    await b?.close().catch(() => {})
  }, IDLE_MS)
}

const MARGINS = { none: '0', small: '8mm', normal: '16mm' }

// Scrolls through the page so lazy-loaded images and content load, then waits for images.
async function loadLazyContent(page) {
  await page.evaluate(async () => {
    const delay = (ms) => new Promise((r) => setTimeout(r, ms))
    for (const img of document.querySelectorAll('img[loading="lazy"]')) img.loading = 'eager'
    let y = 0
    for (let i = 0; i < 40 && y < document.documentElement.scrollHeight; i++) {
      y += window.innerHeight * 0.9
      window.scrollTo(0, y)
      await delay(120)
    }
    window.scrollTo(0, 0)
    const pending = [...document.images].filter((img) => !img.complete)
    await Promise.race([Promise.all(pending.map((img) => new Promise((r) => (img.onload = img.onerror = r)))), delay(4000)])
  })
}

/**
 * Renders `html` (self-contained; network is blocked) or loads `url` (every request
 * SSRF-checked, and all traffic forced through the egress proxy) and prints it.
 * `prepare(page)` runs after the HTML loads. Options: format, landscape, margin, background, screen.
 */
export function renderPdf({ html, url, prepare }, opts = {}) {
  return queue(async () => {
    active++
    clearTimeout(idleTimer)
    const browser = await getBrowser()
    const context = await browser.createBrowserContext()
    try {
      const page = await context.newPage()
      page.setDefaultTimeout(TIMEOUT_MS)
      await page.setRequestInterception(true)
      let blocked = null
      page.on('request', async (req) => {
        if (req.isInterceptResolutionHandled()) return
        if (html) {
          const ok = /^(data|blob):/.test(req.url()) || req.url() === 'about:blank'
          return ok ? req.continue() : req.abort('blockedbyclient')
        }
        const problem = await urlProblem(req.url(), { mainFrame: req.isNavigationRequest() && req.frame() === page.mainFrame() })
        if (problem) {
          if (req.isNavigationRequest() && req.frame() === page.mainFrame()) blocked = problem
          return req.abort('blockedbyclient')
        }
        return req.continue()
      })

      if (html) {
        await page.setViewport({ width: 1240, height: 1754 })
        await page.setContent(html, { waitUntil: 'load' })
        if (prepare) await prepare(page)
        // Becomes the PDF's Title metadata.
        if (opts.title) await page.evaluate((t) => (document.title = t), opts.title)
      } else {
        await page.setViewport({ width: 1280, height: 900 })
        if (opts.screen) await page.emulateMediaType('screen')
        try {
          await page.goto(url, { waitUntil: 'networkidle2', timeout: Math.min(TIMEOUT_MS, 45_000) })
        } catch (e) {
          if (blocked) throw new HttpError(403, blocked)
          if (/timeout/i.test(e.message)) {
            // Pages that never go quiet (ads, live updates) still get printed as they are.
          } else {
            throw new HttpError(422, `Couldn’t load that page: ${e.message.replace(/ at .*$/, '')}`)
          }
        }
        if (blocked) throw new HttpError(403, blocked)
        await loadLazyContent(page).catch(() => {})
      }

      const margin = MARGINS[opts.margin] ?? undefined
      const pdf = await page.pdf({
        format: opts.format ?? 'A4',
        landscape: Boolean(opts.landscape),
        printBackground: opts.background !== false,
        preferCSSPageSize: Boolean(html),
        margin: margin === undefined ? undefined : { top: margin, right: margin, bottom: margin, left: margin },
        timeout: TIMEOUT_MS,
      })
      return Buffer.from(pdf)
    } finally {
      await context.close().catch(() => {})
      active--
      scheduleIdleClose()
    }
  })
}
