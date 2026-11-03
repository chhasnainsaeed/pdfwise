// Zip-bomb guard. DOCX, XLSX, PPTX and OpenDocument files are ZIP archives; a few megabytes can
// unpack to gigabytes and exhaust the server's memory. This reads the archive's central directory
// (which lists every entry's unpacked size) without unpacking anything, and refuses archives that
// would unpack to too much or hold too many entries.

import { HttpError } from './util.js'

export const ZIP_FORMATS = new Set(['docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp'])
const MAX_UNPACKED = (Number(process.env.MAX_UNZIPPED_MB) || 300) * 1024 * 1024
const MAX_ENTRIES = 20_000
const MAX_RATIO = 200 // unpacked ÷ packed for one large entry; real documents stay far below

/** Returns { entries, unpacked } or throws HttpError 413/422. */
export function checkArchive(buf) {
  // End of central directory record: signature 0x06054b50 within the last 64 KB + 22 bytes.
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new HttpError(422, 'This file isn’t a valid Office document (it isn’t a ZIP archive).')
  const entries = buf.readUInt16LE(eocd + 10)
  const dirSize = buf.readUInt32LE(eocd + 12)
  const dirStart = buf.readUInt32LE(eocd + 16)
  if (entries === 0xffff || dirStart === 0xffffffff || dirStart + dirSize > buf.length)
    throw new HttpError(422, 'This document’s archive is malformed or too large to convert.')
  if (entries > MAX_ENTRIES) throw new HttpError(413, 'This document contains too many parts to convert.')

  let unpacked = 0
  let p = dirStart
  for (let n = 0; n < entries; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50)
      throw new HttpError(422, 'This document’s archive is malformed.')
    const packed = buf.readUInt32LE(p + 20)
    const size = buf.readUInt32LE(p + 24)
    if (size === 0xffffffff || packed === 0xffffffff) throw new HttpError(413, 'This document is too large to convert.') // ZIP64: never a normal Office file
    unpacked += size
    if (unpacked > MAX_UNPACKED) throw new HttpError(413, 'This document unpacks to too much data to convert safely.')
    if (size > 10 * 1024 * 1024 && size > packed * MAX_RATIO)
      throw new HttpError(413, 'This document looks like a compression bomb and was refused.')
    p += 46 + buf.readUInt16LE(p + 28) + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32)
  }
  return { entries, unpacked }
}
