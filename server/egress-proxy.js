// A local forward proxy the headless browser must use for all traffic. It resolves each host
// itself, rejects private addresses and non-web ports, and connects to the exact IP it checked,
// which closes the DNS-rebinding gap that a check-then-fetch approach leaves open.

import http from 'node:http'
import net from 'node:net'
import { checkHost } from './url-guard.js'

const HOP_BY_HOP = ['proxy-connection', 'proxy-authorization', 'connection', 'keep-alive', 'te', 'trailer', 'upgrade']

let started = null

function deny(res, problem) {
  res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end(problem)
}

async function onRequest(req, res) {
  let url
  try {
    url = new URL(req.url)
  } catch {
    return deny(res, 'Bad request')
  }
  if (url.protocol !== 'http:') return deny(res, 'Only http and https are allowed.')
  const port = Number(url.port) || 80
  const { ip, problem } = await checkHost(url.hostname, port)
  if (problem) return deny(res, problem)
  const headers = { ...req.headers, host: url.host }
  for (const h of HOP_BY_HOP) delete headers[h]
  const upstream = http.request(
    { host: ip, port, method: req.method, path: url.pathname + url.search, headers, setHost: false },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers)
      up.pipe(res)
    },
  )
  upstream.on('error', () => res.destroy())
  req.pipe(upstream)
}

async function onConnect(req, socket, head) {
  const m = /^\[?([^\]]+?)\]?:(\d+)$/.exec(req.url ?? '')
  if (!m) return socket.end('HTTP/1.1 400 Bad Request\r\n\r\n')
  const { ip, problem } = await checkHost(m[1], Number(m[2]))
  if (problem) return socket.end(`HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain\r\n\r\n${problem}`)
  const upstream = net.connect(Number(m[2]), ip, () => {
    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
    if (head?.length) upstream.write(head)
    upstream.pipe(socket)
    socket.pipe(upstream)
  })
  upstream.on('error', () => socket.destroy())
  socket.on('error', () => upstream.destroy())
}

/** Starts the proxy once on a random loopback port; resolves to that port. */
export function startEgressProxy() {
  started ??= new Promise((resolve, reject) => {
    const server = http.createServer(onRequest)
    server.on('connect', onConnect)
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => resolve(server.address().port))
    server.unref()
  })
  return started
}
