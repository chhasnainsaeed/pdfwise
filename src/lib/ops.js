import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib'
import { UserError } from './files.js'
import { hexToRgb01, tileCenters, visualFrame } from './geometry.js'

const norm = (deg) => ((deg % 360) + 360) % 360

export async function loadPdf(file) {
  return PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false })
}

/** Concatenates every page of each file, in order. */
export async function mergePdfs(files, progress) {
  const out = await PDFDocument.create()
  for (let i = 0; i < files.length; i++) {
    const src = await loadPdf(files[i])
    const pages = await out.copyPages(src, src.getPageIndices())
    pages.forEach((p) => out.addPage(p))
    progress?.(i + 1, files.length)
  }
  return out.save()
}

/**
 * Builds a new PDF from a list of page references: [{ file, index, rotation }].
 * Pages from the same source are copied in one pass so shared resources (fonts,
 * images) are not duplicated.
 */
export async function buildFromPages(entries) {
  const out = await PDFDocument.create()
  const sources = new Map()
  const wanted = new Map()
  for (const e of entries) {
    if (!wanted.has(e.file)) wanted.set(e.file, new Set())
    wanted.get(e.file).add(e.index)
  }
  const copied = new Map()
  for (const [file, set] of wanted) {
    const src = await loadPdf(file)
    sources.set(file, src)
    const indices = [...set]
    const pages = await out.copyPages(src, indices)
    copied.set(file, new Map(indices.map((idx, k) => [idx, pages[k]])))
  }
  const used = new Set()
  for (const e of entries) {
    let page = copied.get(e.file).get(e.index)
    if (used.has(page)) [page] = await out.copyPages(sources.get(e.file), [e.index])
    used.add(page)
    if (e.rotation) page.setRotation(degrees(norm(page.getRotation().angle + e.rotation)))
    out.addPage(page)
  }
  return out.save()
}

/** Splits one file into several PDFs, one per group of 0-based page indices. */
export async function splitIntoGroups(file, groups, progress) {
  const src = await loadPdf(file)
  const results = []
  for (let g = 0; g < groups.length; g++) {
    const out = await PDFDocument.create()
    const pages = await out.copyPages(src, groups[g])
    pages.forEach((p) => out.addPage(p))
    results.push(await out.save())
    progress?.(g + 1, groups.length)
  }
  return results
}

/** Adds `deg` to every page's rotation. */
export async function rotateAll(file, deg) {
  const pdf = await loadPdf(file)
  for (const page of pdf.getPages()) page.setRotation(degrees(norm(page.getRotation().angle + deg)))
  return pdf.save()
}

const FONTS = {
  helvetica: [StandardFonts.Helvetica, StandardFonts.HelveticaBold],
  times: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold],
  courier: [StandardFonts.Courier, StandardFonts.CourierBold],
}

export async function addPageNumbers(file, opts) {
  const { position, margin, start, from, to, format, fontSize, color, font: fontId } = opts
  const pdf = await loadPdf(file)
  const font = await pdf.embedFont(FONTS[fontId][0])
  const pages = pdf.getPages()
  const last = Math.min(to, pages.length)
  const total = start + (last - from)
  const [vert, horiz] = position.split('-')
  const capHeight = font.heightAtSize(fontSize, { descender: false })
  for (let i = from - 1; i < last; i++) {
    const n = start + (i - (from - 1))
    const text = format.replace(/\{n\}/g, String(n)).replace(/\{total\}/g, String(total))
    const page = pages[i]
    const f = visualFrame(page)
    const tw = font.widthOfTextAtSize(text, fontSize)
    const vx = horiz === 'left' ? margin : horiz === 'right' ? f.width - margin - tw : (f.width - tw) / 2
    const vy = vert === 'top' ? f.height - margin - capHeight : margin
    const p = f.toUser(vx, vy)
    page.drawText(text, {
      x: p.x,
      y: p.y,
      size: fontSize,
      font,
      color: rgb(...hexToRgb01(color)),
      rotate: degrees(f.rotation),
    })
  }
  return pdf.save()
}

export async function addWatermark(file, opts) {
  if (opts.mode === 'image') return addImageWatermark(file, opts)
  const { text, font: fontId, fontSize, color, opacity, angle, layout } = opts
  if (!text.trim()) throw new UserError('Type the watermark text first.')
  const pdf = await loadPdf(file)
  const font = await pdf.embedFont(FONTS[fontId][1])
  const tw = font.widthOfTextAtSize(text, fontSize)
  const th = font.heightAtSize(fontSize, { descender: false })
  const a = (angle * Math.PI) / 180
  const ux = Math.cos(a)
  const uy = Math.sin(a)
  for (const page of pdf.getPages()) {
    const f = visualFrame(page)
    const centers = layout === 'tile' ? tileCenters(f.width, f.height, tw, th, angle) : [[f.width / 2, f.height / 2]]
    for (const [cx, cy] of centers) {
      // Start of the baseline so the text's middle lands on (cx, cy).
      const sx = cx - (tw / 2) * ux + (th / 2) * uy
      const sy = cy - (tw / 2) * uy - (th / 2) * ux
      const p = f.toUser(sx, sy)
      page.drawText(text, {
        x: p.x,
        y: p.y,
        size: fontSize,
        font,
        color: rgb(...hexToRgb01(color)),
        opacity,
        rotate: degrees(f.rotation + angle),
      })
    }
  }
  return pdf.save()
}

/** Image watermark: `image` is a PNG or JPEG data URL; `scale` is a percentage of page width. */
async function addImageWatermark(file, { image, scale, opacity, angle, layout }) {
  if (!image) throw new UserError('Choose an image for the watermark first.')
  const pdf = await loadPdf(file)
  const img = image.startsWith('data:image/png') ? await pdf.embedPng(image) : await pdf.embedJpg(image)
  const a = (angle * Math.PI) / 180
  const ux = Math.cos(a)
  const uy = Math.sin(a)
  for (const page of pdf.getPages()) {
    const f = visualFrame(page)
    const w = (f.width * scale) / 100
    const h = (w * img.height) / img.width
    const centers = layout === 'tile' ? tileCenters(f.width, f.height, w, h, angle) : [[f.width / 2, f.height / 2]]
    for (const [cx, cy] of centers) {
      const p = f.toUser(cx - (w / 2) * ux + (h / 2) * uy, cy - (w / 2) * uy - (h / 2) * ux)
      page.drawImage(img, { x: p.x, y: p.y, width: w, height: h, opacity, rotate: degrees(f.rotation + angle) })
    }
  }
  return pdf.save()
}

/** Crops pages by visual margins in points. `pages` limits which pages (0-based). */
export async function cropPdf(file, margins, pages) {
  const pdf = await loadPdf(file)
  const all = pdf.getPages()
  const targets = pages ?? all.map((_, i) => i)
  for (const i of targets) {
    const page = all[i]
    const f = visualFrame(page)
    const m = f.toUserMargins(margins)
    const box = page.getCropBox()
    const w = box.width - m.left - m.right
    const h = box.height - m.top - m.bottom
    if (w < 10 || h < 10) continue
    page.setMediaBox(box.x + m.left, box.y + m.bottom, w, h)
    page.setCropBox(box.x + m.left, box.y + m.bottom, w, h)
  }
  return pdf.save()
}

/**
 * Stamps a PNG signature onto pages. Placements are in visual points measured from
 * the top-left of the page, along with the page size they were measured against.
 */
export async function signPdf(file, signatureDataUrl, placements) {
  const pdf = await loadPdf(file)
  const png = await pdf.embedPng(signatureDataUrl)
  const pages = pdf.getPages()
  for (const p of placements) {
    const page = pages[p.page - 1]
    if (!page) continue
    const f = visualFrame(page)
    const sx = f.width / p.pageW
    const sy = f.height / p.pageH
    const w = p.w * sx
    const h = p.h * sy
    const pt = f.toUser(p.x * sx, f.height - p.y * sy - h)
    page.drawImage(png, { x: pt.x, y: pt.y, width: w, height: h, rotate: degrees(f.rotation) })
  }
  return pdf.save()
}
