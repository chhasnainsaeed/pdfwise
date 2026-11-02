import { PDFArray, PDFBool, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef, decodePDFRawStream } from 'pdf-lib'
import { canvasToBlob, mapLimit, parallelism } from './files.js'

const N = (n) => PDFName.of(n)

export const COMPRESSION_LEVELS = {
  extreme: { maxSide: 1100, quality: 0.45 },
  recommended: { maxSide: 1700, quality: 0.65 },
  low: { maxSide: 2600, quality: 0.82 },
}

/**
 * Shrinks a PDF by re-encoding the raster images inside it as smaller JPEGs.
 * Text and vector graphics are untouched. Returns the original bytes when the
 * result would not be smaller.
 */
export async function compressPdf(file, level, progress) {
  const settings = typeof level === 'string' ? COMPRESSION_LEVELS[level] : level
  const original = new Uint8Array(await file.arrayBuffer())
  const pdf = await PDFDocument.load(original, { updateMetadata: false })
  const ctx = pdf.context

  const objects = ctx.enumerateIndirectObjects()
  const masks = new Set()
  for (const [, obj] of objects) {
    const smask = obj instanceof PDFRawStream ? obj.dict.get(N('SMask')) : null
    if (smask instanceof PDFRef) masks.add(smask.toString())
  }
  const images = objects.filter(
    ([ref, obj]) =>
      obj instanceof PDFRawStream && obj.dict.lookup(N('Subtype')) === N('Image') && !masks.has(ref.toString()),
  )

  // Several images at once: JPEG encoding runs on the browser's background threads, so this is
  // roughly N× faster on N cores, with identical output.
  let replaced = 0
  let done = 0
  await mapLimit(images, parallelism(), async ([ref, stream]) => {
    try {
      const next = await recompressImage(stream, settings)
      if (next) {
        ctx.assign(ref, next)
        replaced++
      }
    } catch (e) {
      console.warn('Skipping image', ref.toString(), e)
    }
    progress?.(++done, images.length)
  })

  const bytes = await pdf.save({ useObjectStreams: true })
  const smaller = bytes.length < original.length
  return {
    bytes: smaller ? bytes : original,
    before: original.length,
    after: smaller ? bytes.length : original.length,
    replaced,
  }
}

// From gentlest to harshest; compressToTarget searches this ladder for the gentlest step that fits.
const TARGET_LADDER = [
  { maxSide: 2600, quality: 0.82 },
  { maxSide: 2000, quality: 0.72 },
  { maxSide: 1700, quality: 0.65 },
  { maxSide: 1400, quality: 0.56 },
  { maxSide: 1100, quality: 0.46 },
  { maxSide: 900, quality: 0.38 },
  { maxSide: 750, quality: 0.3 },
  { maxSide: 600, quality: 0.24 },
  { maxSide: 480, quality: 0.18 },
].map((s) => ({ ...s, minBytes: 4 * 1024 }))

/**
 * Compresses a PDF to fit under `target` bytes, keeping as much image quality as it can.
 * Binary-searches the ladder above (about four passes). When even the harshest step is too
 * big, returns that smallest result with `reached: false`.
 */
export async function compressToTarget(file, target, progress) {
  if (file.size <= target) {
    const bytes = new Uint8Array(await file.arrayBuffer())
    return { bytes, before: file.size, after: file.size, replaced: 0, reached: true, untouched: true }
  }
  const passes = Math.ceil(Math.log2(TARGET_LADDER.length)) + 1
  let pass = 0
  const attempt = async (i) => {
    const r = await compressPdf(file, TARGET_LADDER[i], (d, t) => progress?.(pass + d / Math.max(t, 1), passes))
    pass++
    return r
  }

  // Try the harshest step first: if it can't fit, nothing gentler will.
  let best = await attempt(TARGET_LADDER.length - 1)
  if (best.after > target) return { ...best, reached: false }
  let lo = 0
  let hi = TARGET_LADDER.length - 2
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const r = await attempt(mid)
    if (r.after <= target) {
      best = r
      hi = mid - 1
    } else {
      lo = mid + 1
    }
  }
  progress?.(passes, passes)
  return { ...best, reached: true }
}

function filterNames(filter) {
  if (filter instanceof PDFName) return [filter.decodeText()]
  if (filter instanceof PDFArray) return filter.asArray().map((f) => (f instanceof PDFName ? f.decodeText() : '?'))
  return []
}

function colorComponents(cs) {
  if (cs === N('DeviceRGB') || cs === N('CalRGB')) return 3
  if (cs === N('DeviceGray') || cs === N('CalGray')) return 1
  if (cs instanceof PDFArray) {
    const kind = cs.lookup(0)
    if (kind === N('ICCBased')) {
      const n = cs.lookup(1)?.dict?.lookup(N('N'))
      const count = n instanceof PDFNumber ? n.asNumber() : 0
      return count === 1 || count === 3 ? count : 0
    }
    if (kind === N('CalRGB')) return 3
    if (kind === N('CalGray')) return 1
  }
  return 0
}

function pngUnpredict(data, columns, colors) {
  const rowLen = columns * colors
  const rows = Math.floor(data.length / (rowLen + 1))
  const out = new Uint8Array(rows * rowLen)
  let prev = new Uint8Array(rowLen)
  for (let r = 0; r < rows; r++) {
    const type = data[r * (rowLen + 1)]
    const src = r * (rowLen + 1) + 1
    const row = out.subarray(r * rowLen, (r + 1) * rowLen)
    for (let i = 0; i < rowLen; i++) {
      const x = data[src + i]
      const a = i >= colors ? row[i - colors] : 0
      const b = prev[i]
      const c = i >= colors ? prev[i - colors] : 0
      let v
      switch (type) {
        case 0:
          v = x
          break
        case 1:
          v = x + a
          break
        case 2:
          v = x + b
          break
        case 3:
          v = x + ((a + b) >> 1)
          break
        case 4: {
          const p = a + b - c
          const pa = Math.abs(p - a)
          const pb = Math.abs(p - b)
          const pc = Math.abs(p - c)
          v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)
          break
        }
        default:
          throw new Error(`Unknown PNG filter ${type}`)
      }
      row[i] = v & 0xff
    }
    prev = row
  }
  return out
}

async function decodeSource(stream, width, height, components) {
  const d = stream.dict
  const filters = filterNames(d.lookup(N('Filter')))
  const parms = d.lookup(N('DecodeParms'))

  if (filters.length === 1 && filters[0] === 'DCTDecode' && !parms) {
    return createImageBitmap(new Blob([stream.contents], { type: 'image/jpeg' }))
  }

  const bpc = d.lookup(N('BitsPerComponent'))
  if (filters.length !== 1 || filters[0] !== 'FlateDecode' || !(bpc instanceof PDFNumber) || bpc.asNumber() !== 8) {
    return null
  }
  let pixels = decodePDFRawStream(stream).decode()
  if (parms && !(parms instanceof PDFArray)) {
    const predictor = parms.lookup(N('Predictor'))?.asNumber?.() ?? 1
    if (predictor >= 10) {
      const columns = parms.lookup(N('Columns'))?.asNumber?.() ?? width
      const colors = parms.lookup(N('Colors'))?.asNumber?.() ?? components
      if (columns !== width || colors !== components) return null
      pixels = pngUnpredict(pixels, columns, colors)
    } else if (predictor !== 1) {
      return null
    }
  } else if (parms) {
    return null
  }
  if (pixels.length < width * height * components) return null

  const rgba = new Uint8ClampedArray(width * height * 4)
  for (let i = 0, j = 0; i < width * height; i++, j += components) {
    const o = i * 4
    if (components === 1) {
      rgba[o] = rgba[o + 1] = rgba[o + 2] = pixels[j]
    } else {
      rgba[o] = pixels[j]
      rgba[o + 1] = pixels[j + 1]
      rgba[o + 2] = pixels[j + 2]
    }
    rgba[o + 3] = 255
  }
  return createImageBitmap(new ImageData(rgba, width, height))
}

async function recompressImage(stream, { maxSide, quality, minBytes = 16 * 1024 }) {
  const d = stream.dict
  if (d.lookup(N('ImageMask')) === PDFBool.True) return null
  if (d.has(N('Decode')) || d.lookup(N('Mask')) instanceof PDFArray) return null
  const widthObj = d.lookup(N('Width'))
  const heightObj = d.lookup(N('Height'))
  if (!(widthObj instanceof PDFNumber) || !(heightObj instanceof PDFNumber)) return null
  const width = widthObj.asNumber()
  const height = heightObj.asNumber()
  const components = colorComponents(d.lookup(N('ColorSpace')))
  if (!components || stream.contents.byteLength < minBytes) return null

  const bitmap = await decodeSource(stream, width, height, components)
  if (!bitmap) return null

  const scale = Math.min(1, maxSide / Math.max(width, height))
  const w = Math.max(1, Math.round(width * scale))
  const h = Math.max(1, Math.round(height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const g = canvas.getContext('2d')
  g.fillStyle = '#fff'
  g.fillRect(0, 0, w, h)
  g.imageSmoothingQuality = 'high'
  g.drawImage(bitmap, 0, 0, w, h)
  bitmap.close?.()
  const blob = await canvasToBlob(canvas, 'image/jpeg', quality)
  canvas.width = canvas.height = 0
  const jpg = new Uint8Array(await blob.arrayBuffer())
  if (jpg.length >= stream.contents.byteLength * 0.9) return null

  const dict = d.context.obj({})
  const skip = new Set(['Filter', 'DecodeParms', 'Length', 'Width', 'Height', 'ColorSpace', 'BitsPerComponent'])
  for (const [key, value] of d.entries()) {
    if (!skip.has(key.decodeText())) dict.set(key, value)
  }
  dict.set(N('Width'), PDFNumber.of(w))
  dict.set(N('Height'), PDFNumber.of(h))
  dict.set(N('ColorSpace'), N('DeviceRGB'))
  dict.set(N('BitsPerComponent'), PDFNumber.of(8))
  dict.set(N('Filter'), N('DCTDecode'))
  return PDFRawStream.of(dict, jpg)
}
