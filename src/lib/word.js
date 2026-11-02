import {
  Document,
  FrameAnchorType,
  HeightRule,
  HorizontalPositionRelativeFrom,
  ImageRun,
  Packer,
  Paragraph,
  TextRun,
  VerticalPositionRelativeFrom,
} from 'docx'
import { UserError, canvasToBlob } from './files.js'
import { getPdf, renderPage } from './pdfjs.js'

const twips = (pt) => Math.round(pt * 20)

/** Text items of a page in visual coordinates (y = baseline from the top). */
async function pageItems(page) {
  const vp = page.getViewport({ scale: 1 })
  const tc = await page.getTextContent()
  const items = tc.items
    .filter((it) => it.str)
    .map((it) => {
      const [x, y] = vp.convertToViewportPoint(it.transform[4], it.transform[5])
      const family = tc.styles[it.fontName]?.fontFamily ?? ''
      return {
        str: it.str,
        x,
        y,
        w: it.width,
        size: Math.hypot(it.transform[2], it.transform[3]) || it.height || 11,
        family,
      }
    })
  return { items, width: vp.width, height: vp.height }
}

/** Groups text items into lines (same baseline), left to right. */
function toLines(items) {
  items.sort((a, b) => a.y - b.y || a.x - b.x)
  const lines = []
  for (const it of items) {
    const line = lines[lines.length - 1]
    if (line && Math.abs(line.y - it.y) < Math.max(2, Math.min(line.size, it.size) * 0.5)) {
      line.items.push(it)
      line.size = Math.max(line.size, it.size)
    } else {
      lines.push({ y: it.y, size: it.size, items: [it] })
    }
  }
  for (const line of lines) {
    line.items.sort((a, b) => a.x - b.x)
    let text = ''
    let end = null
    for (const it of line.items) {
      if (end !== null && it.x - end > line.size * 0.15 && !text.endsWith(' ') && !it.str.startsWith(' ')) text += ' '
      text += it.str
      end = it.x + it.w
    }
    line.text = text.replace(/\s+/g, ' ').trim()
    line.x = line.items[0].x
    line.right = end
    line.family = line.items[0].family
  }
  return lines.filter((l) => l.text)
}

function toParagraphs(lines) {
  const paragraphs = []
  let prev = null
  for (const line of lines) {
    const para = paragraphs[paragraphs.length - 1]
    const gap = prev ? line.y - prev.y : Infinity
    if (para && Math.abs(line.size - prev.size) < 1.5 && gap < line.size * 1.75) {
      para.text = para.text.endsWith('-') ? para.text.slice(0, -1) + line.text : `${para.text} ${line.text}`
    } else {
      paragraphs.push({ text: line.text, size: line.size })
    }
    prev = line
  }
  return paragraphs
}

const wordFont = (family) =>
  /mono|courier/i.test(family)
    ? 'Courier New'
    : /serif/i.test(family) && !/sans/i.test(family)
      ? 'Times New Roman'
      : 'Arial'

/** Flowing text: paragraphs, headings and page breaks, no positioning. */
async function flowingDocument(pdf, progress) {
  const pages = []
  for (let n = 1; n <= pdf.numPages; n++) {
    const { items } = await pageItems(await pdf.getPage(n))
    pages.push(toParagraphs(toLines(items)))
    progress?.(n, pdf.numPages)
  }
  const all = pages.flat()
  if (!all.length) return null
  const sizes = all.map((p) => p.size).sort((a, b) => a - b)
  const body = sizes[Math.floor(sizes.length / 2)]
  const children = []
  pages.forEach((paras, i) => {
    paras.forEach((p, k) => {
      const ptSize = Math.min(48, Math.max(8, Math.round(p.size)))
      children.push(
        new Paragraph({
          pageBreakBefore: i > 0 && k === 0,
          spacing: { after: 120 },
          children: [new TextRun({ text: p.text, size: ptSize * 2, bold: p.size > body * 1.25 })],
        }),
      )
    })
  })
  return new Document({ sections: [{ children }] })
}

/**
 * Keeps the layout: each PDF page becomes a Word page of the same size, with the page's
 * graphics as a background picture and every text line as an editable, positioned frame.
 */
async function layoutDocument(file, pdf, progress) {
  const sections = []
  let textLines = 0
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n)
    const { items, width, height } = await pageItems(page)
    const lines = toLines(items)
    textLines += lines.length

    const { canvas } = await renderPage(file, n, { scale: 150 / 72, intent: 'print', hideText: true })
    const jpg = new Uint8Array(await (await canvasToBlob(canvas, 'image/jpeg', 0.82)).arrayBuffer())
    canvas.width = canvas.height = 0

    const children = [
      new Paragraph({
        children: [
          new ImageRun({
            type: 'jpg',
            data: jpg,
            transformation: { width: Math.round((width * 96) / 72), height: Math.round((height * 96) / 72) },
            floating: {
              horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: 0 },
              verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: 0 },
              behindDocument: true,
              allowOverlap: true,
            },
          }),
        ],
      }),
    ]
    for (const line of lines) {
      const size = Math.min(72, Math.max(4, line.size))
      const lineWidth = Math.max(line.right - line.x, size)
      children.push(
        new Paragraph({
          frame: {
            type: 'absolute',
            position: { x: twips(line.x), y: twips(line.y - size * 0.9) },
            width: twips(Math.min(width - line.x, lineWidth * 1.12 + size)),
            height: twips(size * 1.25),
            rule: HeightRule.EXACT,
            anchor: { horizontal: FrameAnchorType.PAGE, vertical: FrameAnchorType.PAGE },
          },
          spacing: { before: 0, after: 0 },
          children: [new TextRun({ text: line.text, size: Math.round(size * 2), font: wordFont(line.family) })],
        }),
      )
    }
    sections.push({
      properties: {
        page: {
          size: { width: twips(width), height: twips(height) },
          margin: { top: 0, right: 0, bottom: 0, left: 0, header: 0, footer: 0 },
        },
      },
      children,
    })
    progress?.(n, pdf.numPages)
  }
  return textLines ? new Document({ sections }) : null
}

/** Converts a PDF to .docx, either keeping the page layout or as flowing text. */
export async function pdfToDocx(file, { layout = true } = {}, progress) {
  const pdf = await getPdf(file)
  const doc = layout ? await layoutDocument(file, pdf, progress) : await flowingDocument(pdf, progress)
  if (!doc)
    throw new UserError(
      'This PDF has no selectable text — it’s probably a scan. Run OCR PDF on it first, then convert.',
    )
  return Packer.toBlob(doc)
}

export const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
