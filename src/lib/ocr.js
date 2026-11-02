import {
  PDFDocument,
  PDFHexString,
  PDFString,
  TextRenderingMode,
  beginText,
  endText,
  popGraphicsState,
  pushGraphicsState,
  setFontAndSize,
  setTextMatrix,
  setTextRenderingMode,
  showText,
} from 'pdf-lib'
import { createWorker } from 'tesseract.js'
import { UserError } from './files.js'
import { visualFrame } from './geometry.js'
import { getPdf, renderPage } from './pdfjs.js'

export const OCR_LANGUAGES = [
  { value: 'eng', label: 'English' },
  { value: 'spa', label: 'Spanish' },
  { value: 'fra', label: 'French' },
  { value: 'deu', label: 'German' },
  { value: 'ita', label: 'Italian' },
  { value: 'por', label: 'Portuguese' },
  { value: 'nld', label: 'Dutch' },
  { value: 'pol', label: 'Polish' },
  { value: 'tur', label: 'Turkish' },
  { value: 'vie', label: 'Vietnamese' },
  { value: 'rus', label: 'Russian' },
  { value: 'ukr', label: 'Ukrainian' },
  { value: 'ell', label: 'Greek' },
  { value: 'ara', label: 'Arabic' },
  { value: 'heb', label: 'Hebrew' },
  { value: 'hin', label: 'Hindi' },
  { value: 'urd', label: 'Urdu' },
  { value: 'tha', label: 'Thai' },
  { value: 'chi_sim', label: 'Chinese (Simplified)' },
  { value: 'chi_tra', label: 'Chinese (Traditional)' },
  { value: 'jpn', label: 'Japanese' },
  { value: 'kor', label: 'Korean' },
]

const DPI = 200
const GLYPH_WIDTH = 0.5 // em, the width every glyph of the invisible font has

async function pageHasText(pdf, n) {
  const page = await pdf.getPage(n)
  const tc = await page.getTextContent()
  return tc.items.reduce((sum, it) => sum + (it.str?.trim().length ?? 0), 0) > 20
}

const utf16Hex = (ch) => Array.from({ length: ch.length }, (_, i) => ch.charCodeAt(i).toString(16).padStart(4, '0')).join('')

/**
 * An invisible-text font: no glyph program is needed because the text is never painted,
 * and a ToUnicode map lets viewers search and copy it in any script.
 */
function glyphlessFont(doc, chars) {
  const ctx = doc.context
  const codes = new Map(chars.map((ch, i) => [ch, i + 1]))
  const pairs = chars.map((ch, i) => `<${(i + 1).toString(16).padStart(4, '0')}> <${utf16Hex(ch)}>`)
  const blocks = []
  for (let i = 0; i < pairs.length; i += 100) {
    const chunk = pairs.slice(i, i + 100)
    blocks.push(`${chunk.length} beginbfchar\n${chunk.join('\n')}\nendbfchar`)
  }
  const cmap = [
    '/CIDInit /ProcSet findresource begin',
    '12 dict begin',
    'begincmap',
    '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
    '/CMapName /Adobe-Identity-UCS def',
    '/CMapType 2 def',
    '1 begincodespacerange',
    '<0000> <FFFF>',
    'endcodespacerange',
    ...blocks,
    'endcmap',
    'CMapName currentdict /CMap defineresource pop',
    'end',
    'end',
  ].join('\n')
  const toUnicode = ctx.register(ctx.flateStream(cmap))
  const descriptor = ctx.register(
    ctx.obj({ Type: 'FontDescriptor', FontName: 'GlyphLessFont', Flags: 5, FontBBox: [0, 0, 500, 1000], ItalicAngle: 0, Ascent: 1000, Descent: 0, CapHeight: 1000, StemV: 80 }),
  )
  const cidFont = ctx.register(
    ctx.obj({
      Type: 'Font',
      Subtype: 'CIDFontType2',
      BaseFont: 'GlyphLessFont',
      CIDSystemInfo: { Registry: PDFString.of('Adobe'), Ordering: PDFString.of('Identity'), Supplement: 0 },
      FontDescriptor: descriptor,
      DW: GLYPH_WIDTH * 1000,
      CIDToGIDMap: 'Identity',
    }),
  )
  const ref = ctx.register(ctx.obj({ Type: 'Font', Subtype: 'Type0', BaseFont: 'GlyphLessFont', Encoding: 'Identity-H', DescendantFonts: [cidFont], ToUnicode: toUnicode }))
  return {
    ref,
    encode: (text) => PDFHexString.of([...text].map((ch) => codes.get(ch).toString(16).padStart(4, '0')).join('')),
  }
}

/**
 * Recognizes text on each page. Returns a searchable PDF (original pages plus an
 * invisible text layer) or, with output 'txt', the plain text.
 */
export async function ocrPdf(file, { lang, skipText, output }, progress) {
  const pdf = await getPdf(file)
  const count = pdf.numPages
  const scale = DPI / 72
  const pages = []
  const worker = await createWorker(lang, 1)
  try {
    for (let n = 1; n <= count; n++) {
      if (skipText && (await pageHasText(pdf, n))) {
        pages.push({ skipped: true })
      } else {
        const { canvas, width, height } = await renderPage(file, n, { scale, intent: 'print' })
        const { data } = await worker.recognize(canvas)
        canvas.width = canvas.height = 0
        pages.push({
          width,
          height,
          text: data.text,
          words: data.words.filter((w) => w.text.trim() && w.confidence > 25),
        })
      }
      progress?.(n, count)
    }
  } finally {
    await worker.terminate()
  }

  const recognized = pages.filter((p) => !p.skipped)
  if (!recognized.length) throw new UserError('Every page already has selectable text, so there was nothing to recognize.')
  const words = recognized.reduce((n, p) => n + p.words.length, 0)

  if (output === 'txt') {
    const text = pages
      .map((p, i) => `--- Page ${i + 1} ---\n${p.skipped ? '(already had text — skipped)' : p.text.trim()}`)
      .join('\n\n')
    return { text, words }
  }

  const doc = await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false })
  const chars = [...new Set(recognized.flatMap((p) => p.words.flatMap((w) => [...w.text.trim()])).concat(' '))]
  const font = glyphlessFont(doc, chars)
  doc.getPages().forEach((page, i) => {
    const r = pages[i]
    if (!r || r.skipped || !r.words.length) return
    const f = visualFrame(page)
    // Pixels → visual points; also absorbs any small size difference between PDF.js and pdf-lib.
    const kx = f.width / r.width / scale
    const ky = f.height / r.height / scale
    const rad = (f.rotation * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    const key = page.node.newFontDictionary('GlyphLess', font.ref)
    const ops = [pushGraphicsState(), beginText(), setTextRenderingMode(TextRenderingMode.Invisible)]
    for (const w of r.words) {
      const text = w.text.trim()
      const { x0, y0, x1, y1 } = w.bbox
      const h = (y1 - y0) * ky
      const width = (x1 - x0) * kx
      if (h <= 0 || width <= 0) continue
      const size = Math.max(1, h)
      const stretch = width / ([...text].length * GLYPH_WIDTH * size)
      const p = f.toUser(x0 * kx, f.height - y1 * ky + h * 0.2)
      ops.push(setFontAndSize(key, size), setTextMatrix(stretch * cos, stretch * sin, -sin, cos, p.x, p.y), showText(font.encode(`${text} `)))
    }
    ops.push(endText(), popGraphicsState())
    page.pushOperators(...ops)
  })
  return { bytes: await doc.save(), words }
}
