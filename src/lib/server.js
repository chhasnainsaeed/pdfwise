import { UserError } from './files.js'

/** Asks the conversion server whether it's up and whether LibreOffice is available. */
export async function serverStatus() {
  try {
    const res = await fetch('/api/health', { cache: 'no-store' })
    if (!res.ok) return { ok: false }
    return await res.json()
  } catch {
    return { ok: false }
  }
}

/** Has the server load a web page in a headless browser and print it to PDF. */
export async function convertUrlOnServer(url, options) {
  let res
  try {
    res = await fetch('/api/convert/url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, ...options }),
    })
  } catch {
    throw new UserError('Couldn’t reach the conversion server. Start it with “npm run server” and try again.')
  }
  if (!res.ok) {
    const message = (await res.json().catch(() => null))?.error
    throw new UserError(message ?? `The server couldn’t convert that page (error ${res.status}).`)
  }
  return new Uint8Array(await res.arrayBuffer())
}

/** Adds https:// when the scheme is missing; returns null for anything that isn't a web address. */
export function normalizeUrl(input) {
  const text = input.trim()
  if (!text) return null
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`)
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.includes('.') ? url.href : null
  } catch {
    return null
  }
}

/** Sends one Office file to the server and returns the PDF bytes. */
export async function convertOnServer(file) {
  let res
  try {
    res = await fetch('/api/convert/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) },
      body: file,
    })
  } catch {
    throw new UserError('Couldn’t reach the conversion server. Start it with “npm run server” and try again.')
  }
  if (!res.ok) {
    const message = (await res.json().catch(() => null))?.error
    throw new UserError(message ? `“${file.name}”: ${message}` : `The server couldn’t convert “${file.name}” (error ${res.status}).`)
  }
  return new Uint8Array(await res.arrayBuffer())
}
