import { UserError } from './files.js'

const unreachable = () =>
  navigator.onLine
    ? 'Couldn’t reach the conversion server. Start it with “npm run server” and try again.'
    : 'You’re offline. This conversion needs an internet connection — every tool that runs in your browser still works.'

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

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

/**
 * POSTs JSON. On AWS the API sits behind CloudFront origin access control, which needs the body's
 * SHA-256 in x-amz-content-sha256; other servers ignore the header.
 */
async function postJson(path, data) {
  const body = JSON.stringify(data)
  const hash = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body)))
  return fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-amz-content-sha256': hash },
    body,
  })
}

/** The PDF from a conversion response: the body itself, or (serverless hosting) a link to it. */
async function pdfFrom(res) {
  if (!res.headers.get('content-type')?.includes('json')) return new Uint8Array(await res.arrayBuffer())
  const { url } = await res.json()
  const pdf = await fetch(url)
  if (!pdf.ok) throw new UserError('Couldn’t download the converted PDF. Try again.')
  return new Uint8Array(await pdf.arrayBuffer())
}

const errorOf = async (res) => (await res.json().catch(() => null))?.error

/** Serverless hosting: puts the file in temporary storage and returns the key the server reads it by. */
async function upload(file) {
  const res = await postJson('/api/upload', { size: file.size })
  if (!res.ok) throw new UserError((await errorOf(res)) ?? `Couldn’t upload “${file.name}” (error ${res.status}).`)
  const { key, url } = await res.json()
  const put = await fetch(url, { method: 'PUT', body: file })
  if (!put.ok) throw new UserError(`Couldn’t upload “${file.name}” (error ${put.status}). Try again.`)
  return key
}

/** Has the server load a web page in a headless browser and print it to PDF. */
export async function convertUrlOnServer(url, options) {
  let res
  try {
    res = await postJson('/api/convert/url', { url, ...options })
  } catch {
    throw new UserError(unreachable())
  }
  if (!res.ok)
    throw new UserError((await errorOf(res)) ?? `The server couldn’t convert that page (error ${res.status}).`)
  return pdfFrom(res)
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

/** Sends one Office file to the server and returns the PDF bytes. `status` is serverStatus()'s answer. */
export async function convertOnServer(file, status) {
  let res
  try {
    res =
      status?.uploads === 's3'
        ? await postJson('/api/convert/pdf', { key: await upload(file), name: file.name })
        : await fetch('/api/convert/pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) },
            body: file,
          })
  } catch (e) {
    if (e instanceof UserError) throw e
    throw new UserError(unreachable())
  }
  if (!res.ok) {
    const message = await errorOf(res)
    throw new UserError(
      message ? `“${file.name}”: ${message}` : `The server couldn’t convert “${file.name}” (error ${res.status}).`,
    )
  }
  return pdfFrom(res)
}
