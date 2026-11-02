// Installable app support: service worker registration and updates, the install prompt,
// and files that arrive from outside (Android share sheet, desktop "Open with PDFwise").

export const PWA_EVENT = 'pdfwise:pwa' // detail: { type: 'update' | 'offline-ready' | 'installable' | 'installed' | 'incoming' }

import { bucket, track } from './analytics.js'

const emit = (type) => window.dispatchEvent(new CustomEvent(PWA_EVENT, { detail: { type } }))

let waiting = null
let installEvent = null
let incoming = null

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  window.addEventListener('load', async () => {
    try {
      const firstInstall = !navigator.serviceWorker.controller
      const reg = await navigator.serviceWorker.register('/sw.js')
      const track = (sw) => {
        sw?.addEventListener('statechange', () => {
          // A new version finished installing while an older one controls the page.
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            waiting = sw
            emit('update')
          }
        })
      }
      if (reg.waiting && navigator.serviceWorker.controller) {
        waiting = reg.waiting
        emit('update')
      }
      track(reg.installing)
      reg.addEventListener('updatefound', () => track(reg.installing))
      navigator.serviceWorker.addEventListener('message', (e) => {
        if (e.data?.type === 'OFFLINE_READY' && firstInstall) emit('offline-ready')
      })
      // Look for a new version when the app comes back to the foreground.
      document.addEventListener(
        'visibilitychange',
        () => document.visibilityState === 'visible' && reg.update().catch(() => {}),
      )
    } catch (e) {
      console.warn('Service worker registration failed', e)
    }
  })
}

export function applyUpdate() {
  if (!waiting) return location.reload()
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true })
  waiting.postMessage({ type: 'SKIP_WAITING' })
}

// --- Install prompt ---

export function listenForInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    installEvent = e
    emit('installable')
  })
  window.addEventListener('appinstalled', () => {
    track('App installed')
    installEvent = null
    emit('installed')
  })
}

export const canPromptInstall = () => Boolean(installEvent)

export async function promptInstall() {
  if (!installEvent) return false
  installEvent.prompt()
  const { outcome } = await installEvent.userChoice
  track('Install prompt', { outcome })
  installEvent = null
  emit(outcome === 'accepted' ? 'installed' : 'installable')
  return outcome === 'accepted'
}

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.matchMedia('(display-mode: window-controls-overlay)').matches ||
  navigator.standalone === true

export const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

// --- Files arriving from outside the page ---

/** Files (and/or shared text) waiting for the home page to pick up. */
export function takeIncoming() {
  const value = incoming
  incoming = null
  return value
}

function deliver(files, text = '') {
  if (!files.length && !text) return
  incoming = { files, text }
  emit('incoming')
}

/** Desktop: PDFwise opened from the OS ("Open with", double-click) via file_handlers. */
export function listenForLaunchedFiles() {
  if (!('launchQueue' in window)) return
  window.launchQueue.setConsumer(async (params) => {
    if (!params.files?.length) return
    const files = await Promise.all(params.files.map((h) => h.getFile()))
    track('Opened with app', { files: bucket(files.length) })
    deliver(files)
  })
}

/** Android: files the service worker parked after a share (see sw-template.js). */
export async function collectSharedFiles() {
  if (!('caches' in window)) return
  try {
    const cache = await caches.open('pdfwise-share')
    const files = []
    let text = ''
    for (const req of await cache.keys()) {
      const res = await cache.match(req)
      if (req.url.endsWith('/__shared/text')) text = await res.text()
      else {
        const name = decodeURIComponent(res.headers.get('X-File-Name') || 'shared-file')
        files.push(new File([await res.blob()], name, { type: res.headers.get('Content-Type') || '' }))
      }
      await cache.delete(req)
    }
    track('Shared into app', { files: bucket(files.length), text: text ? 'yes' : 'no' })
    deliver(files, text)
  } catch (e) {
    console.warn('Could not read shared files', e)
  }
}
