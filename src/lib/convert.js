import { PDFDocument } from 'pdf-lib'
import { baseName, canvasToBlob } from './files.js'
import { getPdf, renderPage } from './pdfjs.js'

export const PAGE_SIZES = {
  a4: [595.28, 841.89],
  letter: [612, 792],
}

const MARGINS = { none: 0, small: 20, big: 48 }

/** Reads the EXIF orientation tag of a JPEG (1 = normal, 0 = unknown). */
function jpegOrientation(bytes) {
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    if (view.getUint16(0) !== 0xffd8) return 0
    let offset = 2
    while (offset + 4 < view.byteLength) {
      const marker = view.getUint16(offset)
      if (marker === 0xffe1) {
        if (view.getUint32(offset + 4) !== 0x45786966) return 0
        const tiff = offset + 10
        const little = view.getUint16(tiff) === 0x4949
        const ifd = tiff + view.getUint32(tiff + 4, little)
        const entries = view.getUint16(ifd, little)
        for (let i = 0; i < entries; i++) {
          const e = ifd + 2 + i * 12
          if (view.getUint16(e, little) === 0x0112) return view.getUint16(e + 8, little)
        }
        return 0
      }
      if ((marker & 0xff00) !== 0xff00) return 0
      offset += 2 + view.getUint16(offset + 2)
    }
  } catch {
    // Malformed EXIF: treat as unknown.
  }
  return 0
}

async function embedImage(pdf, file) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const isJpeg = file.type === 'image/jpeg' || /\.jpe?g$/i.test(file.name)
  const isPng = file.type === 'image/png' || /\.png$/i.test(file.name)
  try {
    if (isJpeg && jpegOrientation(bytes) <= 1) return await pdf.embedJpg(bytes)
    if (isPng) return await pdf.embedPng(bytes)
  } catch {
    // Fall through to the canvas path, which handles odd encodings.
  }
  // createImageBitmap applies EXIF rotation and decodes WebP/GIF/BMP.
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')
  if (isJpeg) {
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close?.()
  const blob = await canvasToBlob(canvas, isJpeg ? 'image/jpeg' : 'image/png', 0.92)
  const out = new Uint8Array(await blob.arrayBuffer())
  return isJpeg ? pdf.embedJpg(out) : pdf.embedPng(out)
}

function addImagePage(pdf, image, { size, orientation, margin }) {
  const m = MARGINS[margin]
  const iw = image.width * 0.75 // px → pt at 96 dpi
  const ih = image.height * 0.75
  let pw
  let ph
  if (size === 'fit') {
    pw = iw + m * 2
    ph = ih + m * 2
    const cap = 14400 / Math.max(pw, ph)
    if (cap < 1) {
      pw *= cap
      ph *= cap
    }
  } else {
    ;[pw, ph] = PAGE_SIZES[size]
    const landscape = orientation === 'landscape' || (orientation === 'auto' && iw > ih)
    if (landscape) [pw, ph] = [ph, pw]
  }
  const page = pdf.addPage([pw, ph])
  const scale = Math.min((pw - m * 2) / iw, (ph - m * 2) / ih)
  const w = iw * scale
  const h = ih * scale
  page.drawImage(image, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h })
}

export async function imagesToPdf(files, opts, progress) {
  const pdf = await PDFDocument.create()
  for (let i = 0; i < files.length; i++) {
    addImagePage(pdf, await embedImage(pdf, files[i]), opts)
    progress?.(i + 1, files.length)
  }
  return pdf.save()
}

export async function imagesToSeparatePdfs(files, opts, progress) {
  const results = []
  for (let i = 0; i < files.length; i++) {
    const pdf = await PDFDocument.create()
    addImagePage(pdf, await embedImage(pdf, files[i]), opts)
    results.push({ name: `${baseName(files[i].name)}.pdf`, data: await pdf.save() })
    progress?.(i + 1, files.length)
  }
  return results
}

/** Renders every page of every file to JPG or PNG. */
export async function pdfsToImages(files, { dpi, format }, progress) {
  const counts = await Promise.all(files.map(async (f) => (await getPdf(f)).numPages))
  const total = counts.reduce((a, b) => a + b, 0)
  const type = format === 'png' ? 'image/png' : 'image/jpeg'
  const ext = format === 'png' ? 'png' : 'jpg'
  const results = []
  let done = 0
  for (let i = 0; i < files.length; i++) {
    const digits = String(counts[i]).length
    for (let p = 1; p <= counts[i]; p++) {
      const { canvas } = await renderPage(files[i], p, { scale: dpi / 72, intent: 'print' })
      const blob = await canvasToBlob(canvas, type, 0.92)
      canvas.width = canvas.height = 0
      const suffix = counts[i] > 1 ? `-${String(p).padStart(digits, '0')}` : ''
      results.push({ name: `${baseName(files[i].name)}${suffix}.${ext}`, data: blob, type })
      progress?.(++done, total)
    }
  }
  return results
}
