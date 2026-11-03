// Builds a compact ICC v2 sRGB display profile (matrix + gamma 2.2 curves), used as the
// PDF/A output intent.

const SRGB = {
  white: [0.9642, 1.0, 0.8249],
  red: [0.4360747, 0.2225045, 0.0139322],
  green: [0.3850649, 0.7168786, 0.0971045],
  blue: [0.1430804, 0.0606169, 0.7141733],
}

function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

const ascii = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0))

function u32(n) {
  const b = new Uint8Array(4)
  new DataView(b.buffer).setUint32(0, n)
  return b
}

function s15(v) {
  const b = new Uint8Array(4)
  new DataView(b.buffer).setInt32(0, Math.round(v * 65536))
  return b
}

const xyzTag = ([x, y, z]) => concat([ascii('XYZ '), u32(0), s15(x), s15(y), s15(z)])

function descTag(text) {
  return concat([
    ascii('desc'),
    u32(0),
    u32(text.length + 1),
    ascii(text),
    new Uint8Array(1),
    u32(0),
    u32(0),
    new Uint8Array(2),
    new Uint8Array(1),
    new Uint8Array(67),
  ])
}

const textTag = (text) => concat([ascii('text'), u32(0), ascii(text), new Uint8Array(1)])

function curvTag(gamma) {
  const b = new Uint8Array(2)
  new DataView(b.buffer).setUint16(0, Math.round(gamma * 256))
  return concat([ascii('curv'), u32(0), u32(1), b])
}

export function srgbProfile() {
  const curve = curvTag(2.2)
  const tags = [
    ['desc', descTag('sRGB IEC61966-2.1')],
    ['cprt', textTag('No copyright, use freely')],
    ['wtpt', xyzTag(SRGB.white)],
    ['rXYZ', xyzTag(SRGB.red)],
    ['gXYZ', xyzTag(SRGB.green)],
    ['bXYZ', xyzTag(SRGB.blue)],
    ['rTRC', curve],
    ['gTRC', curve],
    ['bTRC', curve],
  ]
  const tableSize = 4 + tags.length * 12
  let offset = 128 + tableSize
  const table = [u32(tags.length)]
  const data = []
  const placed = new Map()
  for (const [sig, bytes] of tags) {
    if (!placed.has(bytes)) {
      const pad = (4 - (offset % 4)) % 4
      if (pad) {
        data.push(new Uint8Array(pad))
        offset += pad
      }
      placed.set(bytes, offset)
      data.push(bytes)
      offset += bytes.length
    }
    table.push(ascii(sig), u32(placed.get(bytes)), u32(bytes.length))
  }
  const body = concat([...table, ...data])
  const total = 128 + body.length

  const header = new Uint8Array(128)
  const v = new DataView(header.buffer)
  v.setUint32(0, total)
  v.setUint32(8, 0x02100000)
  header.set(ascii('mntr'), 12)
  header.set(ascii('RGB '), 16)
  header.set(ascii('XYZ '), 20)
  ;[2026, 1, 1, 0, 0, 0].forEach((n, i) => v.setUint16(24 + i * 2, n))
  header.set(ascii('acsp'), 36)
  SRGB.white.forEach((n, i) => header.set(s15(n), 68 + i * 4))
  return concat([header, body])
}
