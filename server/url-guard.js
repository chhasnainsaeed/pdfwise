// Keeps URL → PDF from being used to reach the server's own network (SSRF).
// Every request the page makes — the page itself, redirects, images, scripts — is checked.
// Set ALLOW_PRIVATE_URLS=1 to allow localhost and private addresses (e.g. for intranet pages).

import dns from 'node:dns/promises'
import net from 'node:net'

const ALLOW_PRIVATE = process.env.ALLOW_PRIVATE_URLS === '1'
const LOCAL_MESSAGE = 'Addresses on a local or private network can’t be converted.'
const cache = new Map()
const CACHE_MS = 60_000

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number)
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19))
    )
  }
  const v = ip.toLowerCase()
  if (v.startsWith('::ffff:')) return isPrivateIp(v.slice(7))
  return v === '::' || v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb') || v.startsWith('ff')
}

async function addressesFor(host) {
  const hit = cache.get(host)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.addrs
  const addrs = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map((a) => a.address)
  cache.set(host, { addrs, at: Date.now() })
  return addrs
}

const WEB_PORTS = new Set([80, 443, 8080, 8443])

/**
 * Resolves a host once and checks every address. Returns { ip } to connect to — the same
 * address that was checked, so a DNS answer that changes later can't redirect the request —
 * or { problem }.
 */
export async function checkHost(hostname, port) {
  if (!ALLOW_PRIVATE && !WEB_PORTS.has(port)) return { problem: `Port ${port} isn’t allowed.` }
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (!ALLOW_PRIVATE && (host === 'localhost' || /\.(localhost|local|internal|lan|home\.arpa)$/.test(host))) return { problem: LOCAL_MESSAGE }
  let addrs
  try {
    addrs = await addressesFor(host)
  } catch {
    return { problem: `Couldn’t find ${host}.` }
  }
  if (!addrs.length) return { problem: `Couldn’t find ${host}.` }
  if (!ALLOW_PRIVATE && addrs.some(isPrivateIp)) return { problem: LOCAL_MESSAGE }
  return { ip: addrs[0] }
}

/** Returns null when the URL may be fetched, otherwise a user-facing reason. */
export async function urlProblem(raw, { mainFrame = false } = {}) {
  let url
  try {
    url = new URL(raw)
  } catch {
    return 'That isn’t a valid web address.'
  }
  if (!mainFrame && (url.protocol === 'data:' || url.protocol === 'blob:' || url.href === 'about:blank')) return null
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'Only http:// and https:// addresses can be converted.'
  if (ALLOW_PRIVATE) return null
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (host === 'localhost' || /\.(localhost|local|internal|lan|home\.arpa)$/.test(host)) return LOCAL_MESSAGE
  let addrs
  try {
    addrs = await addressesFor(host)
  } catch {
    return `Couldn’t find a website at ${host}.`
  }
  return addrs.some(isPrivateIp) ? LOCAL_MESSAGE : null
}
