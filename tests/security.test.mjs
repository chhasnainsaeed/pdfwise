// Security regression tests: private-network (SSRF) checks, the zip-bomb guard and the headers.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import JSZip from 'jszip'
import { checkArchive } from '../server/archive.js'
import { HSTS, contentSecurityPolicy, securityHeaders } from '../server/security-headers.js'
import { checkHost, isPrivateIp, urlProblem } from '../server/url-guard.js'

test('private, loopback, metadata and special addresses are blocked in every notation', () => {
  const blocked = [
    '127.0.0.1',
    '10.1.2.3',
    '172.20.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '255.255.255.255',
    '224.0.0.1',
    '::1',
    '::',
    'fd00::1',
    'fe80::1',
    'fe80::1%eth0',
    'fec0::1',
    'ff02::1',
    '2001:db8::1',
    // IPv6 forms that carry a private IPv4 address
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '0:0:0:0:0:ffff:7f00:1',
    '::ffff:a9fe:a9fe',
    '::127.0.0.1',
    '::7f00:1',
    '64:ff9b::a9fe:a9fe',
    '2002:a9fe:a9fe::1',
    'not-an-ip',
  ]
  for (const ip of blocked) assert.equal(isPrivateIp(ip), true, `${ip} must be blocked`)
})

test('public addresses are allowed, including IPv6 forms that carry a public IPv4', () => {
  for (const ip of [
    '8.8.8.8',
    '1.1.1.1',
    '93.184.216.34',
    '2606:4700::1111',
    '::ffff:8.8.8.8',
    '64:ff9b::808:808',
    '2002:808:808::1',
  ])
    assert.equal(isPrivateIp(ip), false, `${ip} must be allowed`)
})

test('URL checks refuse other schemes, local names and private IPs', async () => {
  for (const url of [
    'file:///etc/passwd',
    'javascript:alert(1)',
    'ftp://example.com/',
    'http://localhost/',
    'http://printer.local/',
    'http://127.0.0.1:3001/api/health',
    'http://169.254.169.254/latest/meta-data/',
    'http://[::ffff:a9fe:a9fe]/',
    'http://[::1]/',
    'not a url',
  ])
    assert.ok(await urlProblem(url, { mainFrame: true }), `${url} must be refused`)
  assert.equal(await urlProblem('https://8.8.8.8/', { mainFrame: true }), null)
})

test('the egress proxy only connects to web ports', async () => {
  assert.match((await checkHost('8.8.8.8', 22)).problem, /Port 22/)
  assert.match((await checkHost('8.8.8.8', 6379)).problem, /Port 6379/)
  assert.equal((await checkHost('8.8.8.8', 443)).ip, '8.8.8.8')
  assert.ok((await checkHost('::ffff:7f00:1', 443)).problem)
})

const zip = async (files) => {
  const z = new JSZip()
  for (const [name, data] of Object.entries(files)) z.file(name, data)
  return z.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

test('normal Office archives pass the zip-bomb guard', async () => {
  const docx = await zip({
    '[Content_Types].xml': '<Types/>',
    'word/document.xml': '<w:document>' + 'text '.repeat(5000) + '</w:document>',
  })
  assert.equal(checkArchive(docx).entries, 3) // two files + the word/ folder entry
})

test('compression bombs and non-archives are refused', async () => {
  const bomb = await zip({ 'word/document.xml': '\0'.repeat(60 * 1024 * 1024) })
  assert.ok(bomb.length < 1024 * 1024, 'test bomb should be small')
  assert.throws(
    () => checkArchive(bomb),
    (e) => e.status === 413,
  )
  assert.throws(
    () => checkArchive(Buffer.from('this is not a zip file at all, just text')),
    (e) => e.status === 422,
  )
  const many = await zip(Object.fromEntries(Array.from({ length: 20_001 }, (_, i) => [`f${i}.xml`, 'x'])))
  assert.throws(
    () => checkArchive(many),
    (e) => e.status === 413,
  )
})

test('the Content-Security-Policy is strict', () => {
  const csp = contentSecurityPolicy()
  assert.match(csp, /default-src 'self'/)
  assert.match(csp, /object-src 'none'/)
  assert.match(csp, /frame-ancestors 'self'/)
  assert.doesNotMatch(csp, /'unsafe-eval'/, 'no eval() of JavaScript')
  assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/, 'no inline scripts')
  assert.doesNotMatch(csp, /(^|\s)\*(\s|;|$)/, 'no wildcard sources')
  assert.doesNotMatch(csp, /fonts\.googleapis|jsdelivr/, 'fonts and the OCR engine are self-hosted')
})

test('vercel.json sends exactly the same security headers', () => {
  const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url)))
  const all = vercel.headers.find((h) => h.source === '/(.*)')
  const sent = Object.fromEntries(all.headers.map((h) => [h.key, h.value]))
  assert.deepEqual(sent, { ...securityHeaders(), 'Strict-Transport-Security': HSTS })
})
