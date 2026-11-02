import { PDFDocument } from 'pdf-lib'
import { flattenPage, rebuild } from './flatten.js'
import { getPdf } from './pdfjs.js'

/**
 * Finds `query` in the PDF's text. Returns boxes in visual points from the page's
 * top-left: [{ page, x, y, w, h, pageW, pageH }]. Matches within one text run only.
 */
export async function findText(file, query, { caseSensitive = false, wholeWord = false } = {}) {
  const needle = caseSensitive ? query : query.toLowerCase()
  if (!needle.trim()) return []
  const pdf = await getPdf(file)
  const boxes = []
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n)
    const vp = page.getViewport({ scale: 1 })
    const { items } = await page.getTextContent()
    for (const item of items) {
      if (!item.str) continue
      const hay = caseSensitive ? item.str : item.str.toLowerCase()
      const [a, b, c, d, e, f] = item.transform
      const len = hay.length
      const along = Math.hypot(a, b) || 1
      const size = Math.hypot(c, d) || item.height || 10
      const ux = a / along
      const uy = b / along
      const nx = c / size
      const ny = d / size
      for (let at = hay.indexOf(needle); at !== -1; at = hay.indexOf(needle, at + needle.length)) {
        if (
          wholeWord &&
          (/[\p{L}\p{N}_]/u.test(hay[at - 1] ?? '') || /[\p{L}\p{N}_]/u.test(hay[at + needle.length] ?? ''))
        )
          continue
        const s0 = (at / len) * item.width
        const s1 = ((at + needle.length) / len) * item.width
        const corners = [
          [s0, -0.25 * size],
          [s1, -0.25 * size],
          [s1, size],
          [s0, size],
        ].map(([s, t]) => vp.convertToViewportPoint(e + ux * s + nx * t, f + uy * s + ny * t))
        const xs = corners.map((p) => p[0])
        const ys = corners.map((p) => p[1])
        const pad = 1
        boxes.push({
          page: n,
          x: Math.min(...xs) - pad,
          y: Math.min(...ys) - pad,
          w: Math.max(...xs) - Math.min(...xs) + pad * 2,
          h: Math.max(...ys) - Math.min(...ys) + pad * 2,
          pageW: vp.width,
          pageH: vp.height,
        })
      }
    }
  }
  return boxes
}

/**
 * Permanently redacts: every page with boxes is replaced by an image of the page with the
 * boxes painted in, then the document is rebuilt from its pages so the original page
 * content (and anything else no longer referenced) isn't carried over.
 */
export async function applyRedactions(
  file,
  boxes,
  { dpi = 200, color = '#000000', keepMetadata = false } = {},
  progress,
) {
  const src = await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false })
  const byPage = new Map()
  for (const b of boxes) {
    if (!byPage.has(b.page)) byPage.set(b.page, [])
    byPage.get(b.page).push(b)
  }
  let done = 0
  for (const [pageNo, list] of [...byPage].sort((x, y) => x[0] - y[0])) {
    await flattenPage(file, src, pageNo, {
      dpi,
      paint(g) {
        g.fillStyle = color
        for (const b of list) {
          const kx = g.canvas.width / b.pageW
          const ky = g.canvas.height / b.pageH
          g.fillRect(Math.floor(b.x * kx), Math.floor(b.y * ky), Math.ceil(b.w * kx) + 1, Math.ceil(b.h * ky) + 1)
        }
      },
    })
    progress?.(++done, byPage.size + 1)
  }
  const out = await rebuild(src)
  if (keepMetadata) {
    const title = src.getTitle()
    const author = src.getAuthor()
    if (title) out.setTitle(title)
    if (author) out.setAuthor(author)
  }
  progress?.(byPage.size + 1, byPage.size + 1)
  return out.save()
}
