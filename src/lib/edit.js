import { BlendMode, LineCapStyle, StandardFonts, degrees, rgb } from 'pdf-lib'
import { hexToRgb01, visualFrame } from './geometry.js'
import { loadPdf } from './ops.js'

const FONT_FILES = {
  helvetica: [StandardFonts.Helvetica, StandardFonts.HelveticaBold],
  times: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold],
  courier: [StandardFonts.Courier, StandardFonts.CourierBold],
}

/** Where the first baseline sits inside a CSS line box of line-height 1.2, as a fraction of font size. */
export const BASELINE = { helvetica: 0.94, times: 0.94, courier: 0.87 }
export const LINE_HEIGHT = 1.2

const color = (hex) => rgb(...hexToRgb01(hex))

/**
 * Applies editor elements to a PDF. Every element carries its page number and the
 * visual page size (pageW/pageH, points) it was laid out against; positions are
 * visual points measured from the page's top-left corner.
 */
export async function applyEdits(file, elements) {
  const pdf = await loadPdf(file)
  const pages = pdf.getPages()
  const fonts = new Map()
  const font = async (id, bold) => {
    const key = `${id}:${bold ? 1 : 0}`
    if (!fonts.has(key)) fonts.set(key, await pdf.embedFont(FONT_FILES[id][bold ? 1 : 0]))
    return fonts.get(key)
  }
  const images = new Map()
  const image = async (src) => {
    if (!images.has(src))
      images.set(src, src.startsWith('data:image/png') ? await pdf.embedPng(src) : await pdf.embedJpg(src))
    return images.get(src)
  }

  for (const el of elements) {
    const page = pages[el.page - 1]
    if (!page) continue
    const f = visualFrame(page)
    const k = f.width / el.pageW
    const rotate = degrees(f.rotation)
    // Visual top-left box → user-space bottom-left anchor.
    const anchor = (x, y, h) => f.toUser(x * k, f.height - (y + h) * k)

    if (el.type === 'text') {
      const fnt = await font(el.font, el.bold)
      const size = el.size * k
      el.text.split('\n').forEach((line, i) => {
        if (!line) return
        const baseline = el.y * k + size * (i * LINE_HEIGHT + BASELINE[el.font])
        const p = f.toUser(el.x * k, f.height - baseline)
        page.drawText(line, { x: p.x, y: p.y, size, font: fnt, color: color(el.color), rotate })
      })
    } else if (el.type === 'image') {
      const img = await image(el.src)
      const p = anchor(el.x, el.y, el.h)
      page.drawImage(img, { x: p.x, y: p.y, width: el.w * k, height: el.h * k, rotate, opacity: el.opacity ?? 1 })
    } else if (el.type === 'rect') {
      const p = anchor(el.x, el.y, el.h)
      page.drawRectangle({
        x: p.x,
        y: p.y,
        width: el.w * k,
        height: el.h * k,
        rotate,
        color: el.fill ? color(el.fill) : undefined,
        borderColor: el.stroke && el.strokeWidth > 0 ? color(el.stroke) : undefined,
        borderWidth: el.stroke ? el.strokeWidth * k : 0,
        opacity: el.opacity ?? 1,
        borderOpacity: el.opacity ?? 1,
      })
    } else if (el.type === 'highlight') {
      const p = anchor(el.x, el.y, el.h)
      page.drawRectangle({
        x: p.x,
        y: p.y,
        width: el.w * k,
        height: el.h * k,
        rotate,
        color: color(el.color),
        opacity: 0.4,
        blendMode: BlendMode.Multiply,
      })
    } else if (el.type === 'draw' && el.points.length > 1) {
      // SVG paths in pdf-lib are y-down from the anchor, which matches visual coordinates.
      const origin = f.toUser(0, f.height)
      const path = el.points.map(([x, y], i) => `${i ? 'L' : 'M'}${(x * k).toFixed(2)} ${(y * k).toFixed(2)}`).join(' ')
      page.drawSvgPath(path, {
        x: origin.x,
        y: origin.y,
        rotate,
        borderColor: color(el.color),
        borderWidth: el.width * k,
        borderLineCap: LineCapStyle.Round,
      })
    }
  }
  return pdf.save()
}
