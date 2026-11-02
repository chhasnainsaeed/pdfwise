import { PDFDocument } from 'pdf-lib'
import { canvasToBlob } from './files.js'
import { renderPage } from './pdfjs.js'

/**
 * Replaces page `pageNo` of `doc` with a picture of that page from `file` (rendered by
 * PDF.js). `paint(ctx, pxPerPt)` can draw over the picture first, e.g. redaction boxes.
 */
export async function flattenPage(file, doc, pageNo, { dpi = 200, paint } = {}) {
  const { canvas, width, height } = await renderPage(file, pageNo, { scale: dpi / 72, intent: 'print' })
  paint?.(canvas.getContext('2d'), canvas.width / width)
  const jpg = new Uint8Array(await (await canvasToBlob(canvas, 'image/jpeg', 0.9)).arrayBuffer())
  canvas.width = canvas.height = 0
  const image = await doc.embedJpg(jpg)
  doc.removePage(pageNo - 1)
  const page = doc.insertPage(pageNo - 1, [width, height])
  page.drawImage(image, { x: 0, y: 0, width, height })
}

/**
 * Copies every page into a fresh document. Only objects the pages still reference come
 * along, so removed page content, scripts, attachments and other leftovers are dropped.
 */
export async function rebuild(doc) {
  const out = await PDFDocument.create({ updateMetadata: false })
  const pages = await out.copyPages(doc, doc.getPageIndices())
  pages.forEach((p) => out.addPage(p))
  return out
}
