// Keeps URL → PDF from being used to reach the server's own network (SSRF).
// Every request the page makes — the page itself, redirects, images, scripts — is checked.
// Set ALLOW_PRIVATE_URLS=1 to allow localhost and private addresses (e.g. for intranet pages).

import dns from 'node:dns/promises'
import net from 'node:net'

const ALLOW_PRIVATE = process.env.ALLOW_PRIVATE_URLS === '1'
const LOCAL_MESSAGE = 'Addresses on a local or private network can’t be converted.'
const cache = new Map()
const CACHE_MS = 60_000

// Special-purpose ranges (IANA registries) that a public website never lives in.
const V4_BLOCKED = new net.BlockList()
for (const [a, bits] of [
  ['0.0.0.0', 8], // "this" network
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, incl. cloud metadata 169.254.169.254
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.88.99.0', 24], // 6to4 relay
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, incl. broadcast
])
  V4_BLOCKED.addSubnet(a, bits, 'ipv4')

const V6_BLOCKED = new net.BlockList()
for (const [a, bits] of [
  ['100::', 64], // discard
  ['2001::', 23], // IETF protocol assignments, incl. Teredo
  ['2001:db8::', 32], // documentation
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['fec0::', 10], // site-local (deprecated)
  ['ff00::', 8], // multicast
])
  V6_BLOCKED.addSubnet(a, bits, 'ipv6')

/** IPv6 text → 16 bytes, or null. Handles "::" and a trailing dotted IPv4 part. */
function ipv6Bytes(ip) {
  let text = ip.split('%')[0]
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(text)
  if (v4) {
    if (!net.isIPv4(v4[1])) return null
    const [a, b, c, d] = v4[1].split('.').map(Number)
    text = text.slice(0, -v4[1].length) + `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`
  }
  const halves = text.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0
  const groups = [...head, ...Array(fill).fill('0'), ...tail]
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/i.test(g))) return null
  return groups.flatMap((g) => [parseInt(g, 16) >> 8, parseInt(g, 16) & 255])
}

const zero = (bytes, from, to) => bytes.slice(from, to).every((b) => b === 0)
const v4At = (bytes, i) => bytes.slice(i, i + 4).join('.')

/**
 * True for any address that isn't a normal public one. IPv6 forms that carry an IPv4 address
 * (mapped ::ffff:a.b.c.d, compatible ::a.b.c.d, NAT64 64:ff9b::/96, 6to4 2002::/16) are judged
 * by that IPv4 address, so e.g. ::ffff:a9fe:a9fe can't stand in for 169.254.169.254.
 */
export function isPrivateIp(ip) {
  if (net.isIPv4(ip)) return V4_BLOCKED.check(ip, 'ipv4')
  const b = net.isIPv6(ip) ? ipv6Bytes(ip) : null
  if (!b) return true // unparseable: refuse
  if (zero(b, 0, 10) && b[10] === 0xff && b[11] === 0xff) return isPrivateIp(v4At(b, 12)) // mapped
  if (zero(b, 0, 12)) return true // ::, ::1 and IPv4-compatible (deprecated)
  if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b && zero(b, 4, 12))
    return isPrivateIp(v4At(b, 12)) // NAT64
  if (b[0] === 0x20 && b[1] === 0x02) return isPrivateIp(v4At(b, 2)) // 6to4
  return V6_BLOCKED.check(ip, 'ipv6')
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
  if (!ALLOW_PRIVATE && (host === 'localhost' || /\.(localhost|local|internal|lan|home\.arpa)$/.test(host)))
    return { problem: LOCAL_MESSAGE }
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
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    return 'Only http:// and https:// addresses can be converted.'
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
