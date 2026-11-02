// Privacy-friendly usage analytics, off unless configured at build time:
//
//   Plausible: VITE_PLAUSIBLE_DOMAIN=your-domain.com   (optional VITE_PLAUSIBLE_SRC for self-hosting)
//   Umami:     VITE_UMAMI_WEBSITE_ID=<website id>       (optional VITE_UMAMI_SRC for self-hosting)
//
// Both are cookie-free and record page views plus the events below. Events carry tool names,
// counts and settings only — never file names, file contents, page text or passwords.

const env = import.meta.env
let provider = null
const queue = []

export function initAnalytics() {
  if (!env.PROD || typeof document === 'undefined') return
  if (env.VITE_PLAUSIBLE_DOMAIN) {
    provider = 'plausible'
    window.plausible ??= function (...args) {
      ;(window.plausible.q = window.plausible.q || []).push(args)
    }
    addScript(env.VITE_PLAUSIBLE_SRC || 'https://plausible.io/js/script.js', { 'data-domain': env.VITE_PLAUSIBLE_DOMAIN })
  } else if (env.VITE_UMAMI_WEBSITE_ID) {
    provider = 'umami'
    addScript(env.VITE_UMAMI_SRC || 'https://cloud.umami.is/script.js', { 'data-website-id': env.VITE_UMAMI_WEBSITE_ID }, () => {
      while (queue.length) send(...queue.shift())
    })
  }
}

function addScript(src, attrs, onload) {
  const s = document.createElement('script')
  s.defer = true
  s.src = src
  for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v)
  if (onload) s.onload = onload
  document.head.appendChild(s)
}

function send(name, props) {
  if (provider === 'plausible') window.plausible(name, { props })
  else if (provider === 'umami') {
    if (window.umami?.track) window.umami.track(name, props)
    else queue.push([name, props])
  }
}

/** Records an event. Values are coerced to short strings; anything else is dropped. */
export function track(name, props = {}) {
  const clean = {}
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === '') continue
    clean[k] = String(v).slice(0, 80)
  }
  if (!provider) {
    if (env.DEV) console.debug('[analytics]', name, clean)
    return
  }
  try {
    send(name, clean)
  } catch {
    // Analytics must never break the app.
  }
}

/** Buckets a count so reports group nicely: 1, 2-5, 6-20, 21+. */
export const bucket = (n) => (n <= 1 ? '1' : n <= 5 ? '2-5' : n <= 20 ? '6-20' : '21+')

/** Buckets a duration in ms: <2s, 2-10s, 10-60s, 1m+. */
export const timeBucket = (ms) => (ms < 2000 ? '<2s' : ms < 10000 ? '2-10s' : ms < 60000 ? '10-60s' : '1m+')
