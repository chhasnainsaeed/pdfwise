/* global window, document -- functions passed to page.evaluate() run inside the headless browser page */
import JSZip from 'jszip'
import mammoth from 'mammoth'
import WordExtractor from 'word-extractor'
import { HttpError } from '../util.js'
import { browserScript, esc, page } from './common.js'

async function docxGeometry(buffer) {
  try {
    const zip = await JSZip.loadAsync(buffer)
    const xml = (await zip.file('word/document.xml')?.async('string')) ?? ''
    const sect = xml.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/g)?.pop() ?? ''
    const sz = /<w:pgSz\b([^>]*)>/.exec(sect)?.[1] ?? ''
    const mar = /<w:pgMar\b([^>]*)>/.exec(sect)?.[1] ?? ''
    const twips = (s, n) => Number(new RegExp(`w:${n}="(-?\\d+)"`).exec(s)?.[1])
    const w = twips(sz, 'w') || 11906
    const h = twips(sz, 'h') || 16838
    const m = ['top', 'right', 'bottom', 'left'].map((k) => Math.max(0, twips(mar, k) || 1440) / 1440)
    return {
      size: `${(w / 1440).toFixed(3)}in ${(h / 1440).toFixed(3)}in`,
      margin: m.map((v) => `${v.toFixed(3)}in`).join(' '),
    }
  } catch {
    return { size: 'A4', margin: '1in' }
  }
}

const MAMMOTH_CSS = `
body{font-family:Calibri,Carlito,"Segoe UI",Arial,sans-serif;font-size:11pt;line-height:1.4}
p{margin:0 0 8pt}
h1{font-size:20pt;margin:12pt 0 6pt}h2{font-size:16pt;margin:10pt 0 5pt}h3{font-size:13pt;margin:8pt 0 4pt}
h4,h5,h6{font-size:11pt;margin:8pt 0 4pt}
ul,ol{margin:0 0 8pt;padding-left:22pt}
table{border-collapse:collapse;margin:0 0 10pt;max-width:100%}
td,th{border:0.75pt solid #9a9a9a;padding:3pt 5pt;vertical-align:top}
td p,th p{margin:0}
img{height:auto}`

/**
 * DOCX: rendered by docx-preview inside the print page, which keeps fonts, sizes, colors,
 * alignment, tables, images and explicit page breaks. Chromium paginates the flowing text
 * with the document's own page size and margins. Falls back to mammoth's semantic HTML.
 */
async function docxDocument(buffer) {
  const geo = await docxGeometry(buffer)
  const css = `@page{size:${geo.size};margin:${geo.margin}}
section.docx{padding:0!important;margin:0!important;width:auto!important;min-height:0!important;box-shadow:none!important;background:transparent!important;break-after:page}
section.docx:last-of-type{break-after:auto}
.docx-wrapper{padding:0!important;background:transparent!important}
.docx img{max-width:100%}`
  const fallback = async () =>
    page(
      `@page{size:${geo.size};margin:${geo.margin}}${MAMMOTH_CSS}`,
      (await mammoth.convertToHtml({ buffer })).value || '<p></p>',
    )

  return {
    html: page(css, '<div id="root"></div>'),
    async prepare(p) {
      try {
        await p.addScriptTag({ content: browserScript('jszip', 'dist/jszip.min.js') })
        await p.addScriptTag({ content: browserScript('docx-preview', 'dist/docx-preview.min.js') })
        await p.evaluate(async (b64) => {
          const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
          await window.docx.renderAsync(bytes, document.getElementById('root'), undefined, {
            inWrapper: false,
            breakPages: true,
            ignoreLastRenderedPageBreak: true,
            renderHeaders: false,
            renderFooters: false,
            renderFootnotes: true,
            renderEndnotes: true,
            useBase64URL: true,
            experimental: true,
          })
          await Promise.all(
            [...document.images].map((i) => (i.complete ? null : new Promise((r) => (i.onload = i.onerror = r)))),
          )
          await document.fonts?.ready
          if (!document.querySelector('section.docx')) throw new Error('Nothing rendered')
        }, buffer.toString('base64'))
      } catch (e) {
        console.warn('[docx] docx-preview failed, using mammoth:', e.message)
        await p.setContent(await fallback(), { waitUntil: 'load' })
      }
    },
  }
}

/** Legacy .doc (Word 97–2003): text only, via word-extractor. */
async function docDocument(buffer) {
  let doc
  try {
    doc = await new WordExtractor().extract(buffer)
  } catch {
    throw new HttpError(422, 'This .doc file couldn’t be read. It may be damaged, encrypted, or not a Word document.')
  }
  const paras = doc
    .getBody()
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => (line.trim() ? `<p>${esc(line).replace(/\t/g, '&emsp;')}</p>` : '<p class="gap"></p>'))
    .join('')
  return {
    html: page(
      `@page{size:A4;margin:25mm 22mm}
body{font-family:Calibri,Carlito,"Segoe UI",Arial,sans-serif;font-size:11pt;line-height:1.4}
p{margin:0 0 6pt;white-space:pre-wrap}p.gap{height:6pt;margin:0}`,
      paras || '<p></p>',
    ),
  }
}

function textDocument(buffer) {
  return {
    html: page(
      `@page{size:A4;margin:20mm}
pre{margin:0;white-space:pre-wrap;word-wrap:break-word;font:10pt/1.45 Consolas,"Cascadia Mono","Courier New",monospace}`,
      `<pre>${esc(buffer.toString('utf8').replace(/^\uFEFF/, ''))}</pre>`,
    ),
  }
}

export { docDocument, docxDocument, textDocument }
