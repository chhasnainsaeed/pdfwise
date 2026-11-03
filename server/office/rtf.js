// Rich Text Format → HTML: paragraphs, alignment, bold/italic/underline/strike, font sizes,
// colors and faces, Unicode and code-page text, tables, and embedded PNG/JPEG pictures.

import { HttpError } from '../util.js'
import { esc, page } from './common.js'

// Groups whose content isn't printed.
const SKIP = new Set([
  'stylesheet',
  'info',
  'header',
  'headerl',
  'headerr',
  'headerf',
  'footer',
  'footerl',
  'footerr',
  'footerf',
  'footnote',
  'annotation',
  'fldinst',
  'xmlnstbl',
  'listtable',
  'listoverridetable',
  'rsidtbl',
  'generator',
  'themedata',
  'colorschememapping',
  'datastore',
  'latentstyles',
  'pgdsctbl',
  'operator',
  'private',
  'mmathPr',
  'filetbl',
  'revtbl',
  'userprops',
  'docvar',
  'object',
  'objdata',
  'bkmkstart',
  'bkmkend',
  'nonshppict',
  'shpinst',
])

const decoderFor = (cp) => {
  try {
    return new TextDecoder(cp === 65001 ? 'utf-8' : `windows-${cp}`)
  } catch {
    return new TextDecoder('windows-1252')
  }
}

export function rtfDocument(buffer) {
  const src = buffer.toString('latin1')
  if (!src.startsWith('{\\rtf')) throw new HttpError(422, 'This isn’t an RTF document.')

  let decoder = decoderFor(1252)
  const fonts = {}
  const colors = []
  const geometry = { w: 12240, h: 15840, margins: [1440, 1800, 1440, 1800] }

  let state = {
    b: false,
    i: false,
    u: false,
    strike: false,
    fs: 24,
    cf: 0,
    f: null,
    vert: null,
    align: 'left',
    skip: false,
    dest: null,
    uc: 1,
    inTable: false,
  }
  const stack = []
  let ucPending = 0
  let bytes = []
  let text = ''
  let runs = []
  let paragraphs = []
  let cell = []
  let cells = []
  const blocks = []
  let pict = null
  let fontName = ''
  let color = {}
  let fontIndex = null

  const runCss = () => {
    const css = [`font-size:${state.fs / 2}pt`]
    if (state.b) css.push('font-weight:700')
    if (state.i) css.push('font-style:italic')
    if (state.u || state.strike)
      css.push(`text-decoration:${[state.u && 'underline', state.strike && 'line-through'].filter(Boolean).join(' ')}`)
    if (state.cf && colors[state.cf]) css.push(`color:${colors[state.cf]}`)
    if (state.f !== null && fonts[state.f]) css.push(`font-family:'${fonts[state.f]}',Calibri,Arial,sans-serif`)
    if (state.vert) css.push(`vertical-align:${state.vert};font-size:${state.fs / 3}pt`)
    return css.join(';')
  }
  const flushBytes = () => {
    if (!bytes.length) return
    const s = decoder.decode(Uint8Array.from(bytes))
    bytes = []
    if (state.dest === 'fonttbl') fontName += s
    else if (!state.skip && !state.dest) text += s
  }
  const flushText = () => {
    flushBytes()
    if (!text) return
    runs.push(
      `<span style="${runCss()}">${esc(text).replace(/\t/g, '<span class="tab"></span>').replace(/\n/g, '<br>')}</span>`,
    )
    text = ''
  }
  const endParagraph = () => {
    flushText()
    const p = `<p style="text-align:${state.align}">${runs.join('') || '&nbsp;'}</p>`
    runs = []
    if (state.inTable) cell.push(p)
    else paragraphs.push(p)
  }
  const flushParagraphsToBlocks = () => {
    if (paragraphs.length) blocks.push({ kind: 'p', html: paragraphs.join('') })
    paragraphs = []
  }
  // Font entries end with ';' and usually sit in their own group inside the font table.
  const commitFont = () => {
    if (fontIndex !== null && fontName.trim()) fonts[fontIndex] = fontName.replace(/['"\\<>;]/g, '').trim()
    fontName = ''
  }
  const addText = (s) => {
    if (ucPending > 0) {
      ucPending--
      return
    }
    if (state.dest === 'fonttbl') fontName += s
    else if (state.dest === 'pict') pict.hex += s
    else if (!state.skip && !state.dest) text += s
  }

  for (let i = 0; i < src.length;) {
    const ch = src[i]
    if (ch === '{') {
      flushText()
      stack.push({ ...state })
      i++
    } else if (ch === '}') {
      flushText()
      const closing = state
      state = stack.pop() ?? state
      if (closing.dest === 'pict' && state.dest !== 'pict' && pict) {
        if (pict.type) {
          const hex = pict.hex.replace(/[^0-9a-f]/gi, '')
          const b64 = Buffer.from(hex, 'hex').toString('base64')
          const size = [
            pict.w && `width:${(pict.w / 20).toFixed(1)}pt`,
            pict.h && `height:${(pict.h / 20).toFixed(1)}pt`,
          ]
            .filter(Boolean)
            .join(';')
          runs.push(`<img src="data:image/${pict.type};base64,${b64}" style="${size}">`)
        }
        pict = null
      }
      if (closing.dest === 'fonttbl') commitFont()
      i++
    } else if (ch === '\\') {
      const next = src[i + 1]
      if (/[a-zA-Z]/.test(next)) {
        const m = /^([a-zA-Z]+)(-?\d+)? ?/.exec(src.slice(i + 1, i + 40))
        const word = m[1]
        const param = m[2] === undefined ? null : Number(m[2])
        i += 1 + m[0].length
        if (word !== 'u' && word !== "'") flushBytes()
        const ignorable = state.ignorable
        state.ignorable = false
        if (SKIP.has(word) || (ignorable && !['pict', 'fonttbl', 'colortbl', 'shppict'].includes(word))) {
          state.skip = true
          continue
        }
        switch (word) {
          case 'ansicpg':
            decoder = decoderFor(param)
            break
          case 'fonttbl':
            state.dest = 'fonttbl'
            break
          case 'colortbl':
            state.dest = 'colortbl'
            color = {}
            break
          case 'red':
          case 'green':
          case 'blue':
            color[word] = param
            break
          case 'pict':
            state.dest = 'pict'
            pict = { hex: '', type: null, w: 0, h: 0 }
            break
          case 'pngblip':
            if (pict) pict.type = 'png'
            break
          case 'jpegblip':
            if (pict) pict.type = 'jpeg'
            break
          case 'picwgoal':
            if (pict) pict.w = param
            break
          case 'pichgoal':
            if (pict) pict.h = param
            break
          case 'paperw':
            geometry.w = param
            break
          case 'paperh':
            geometry.h = param
            break
          case 'margt':
          case 'margr':
          case 'margb':
          case 'margl':
            geometry.margins[{ margt: 0, margr: 1, margb: 2, margl: 3 }[word]] = param
            break
          case 'f':
            if (state.dest === 'fonttbl') {
              fontIndex = param
              fontName = ''
            } else {
              flushText()
              state.f = param
            }
            break
          case 'b':
          case 'i':
          case 'strike':
            flushText()
            state[word] = param !== 0
            break
          case 'ul':
            flushText()
            state.u = param !== 0
            break
          case 'ulnone':
            flushText()
            state.u = false
            break
          case 'fs':
            flushText()
            state.fs = param || 24
            break
          case 'cf':
            flushText()
            state.cf = param ?? 0
            break
          case 'super':
            flushText()
            state.vert = 'super'
            break
          case 'sub':
            flushText()
            state.vert = 'sub'
            break
          case 'nosupersub':
            flushText()
            state.vert = null
            break
          case 'plain':
            flushText()
            Object.assign(state, { b: false, i: false, u: false, strike: false, fs: 24, cf: 0, f: null, vert: null })
            break
          case 'pard':
            state.align = 'left'
            state.inTable = false
            break
          case 'ql':
            state.align = 'left'
            break
          case 'qc':
            state.align = 'center'
            break
          case 'qr':
            state.align = 'right'
            break
          case 'qj':
            state.align = 'justify'
            break
          case 'intbl':
            state.inTable = true
            break
          case 'par':
          case 'sect':
            if (!state.skip && !state.dest) endParagraph()
            break
          case 'line':
            addText('\n')
            break
          case 'tab':
            addText('\t')
            break
          case 'emdash':
            addText('—')
            break
          case 'endash':
            addText('–')
            break
          case 'bullet':
            addText('•')
            break
          case 'lquote':
            addText('‘')
            break
          case 'rquote':
            addText('’')
            break
          case 'ldblquote':
            addText('“')
            break
          case 'rdblquote':
            addText('”')
            break
          case 'page':
            if (!state.skip && !state.dest) {
              endParagraph()
              flushParagraphsToBlocks()
              blocks.push({ kind: 'break' })
            }
            break
          case 'cell':
            if (!state.skip && !state.dest) {
              flushText()
              if (runs.length) endParagraph()
              cells.push(cell.join('') || '&nbsp;')
              cell = []
            }
            break
          case 'row':
            if (!state.skip && !state.dest) {
              flushParagraphsToBlocks()
              blocks.push({ kind: 'row', cells })
              cells = []
            }
            break
          case 'uc':
            state.uc = param ?? 1
            break
          case 'u': {
            flushBytes()
            const code = param < 0 ? param + 65536 : param
            addText(String.fromCharCode(code))
            ucPending = state.uc
            break
          }
          default:
            break
        }
      } else if (next === "'") {
        const byte = parseInt(src.slice(i + 2, i + 4), 16)
        i += 4
        if (ucPending > 0) ucPending--
        else if (state.dest === 'pict') pict.hex += src.slice(i - 2, i)
        else bytes.push(byte)
      } else if (next === '*') {
        state.ignorable = true
        i += 2
      } else {
        flushBytes()
        if (next === '\\' || next === '{' || next === '}') addText(next)
        else if (next === '~') addText('\u00a0')
        else if (next === '_') addText('‑')
        else if ((next === '\n' || next === '\r') && !state.skip && !state.dest) endParagraph()
        i += 2
      }
    } else {
      if (ch === ';' && state.dest === 'colortbl') {
        colors.push(color.red === undefined ? null : `rgb(${color.red ?? 0},${color.green ?? 0},${color.blue ?? 0})`)
        color = {}
      } else if (ch === ';' && state.dest === 'fonttbl') {
        flushBytes()
        commitFont()
      } else if (ch !== '\r' && ch !== '\n') {
        flushBytes()
        addText(ch)
      }
      i++
    }
  }
  if (runs.length || text) endParagraph()
  flushParagraphsToBlocks()

  // Consecutive rows become one table.
  let html = ''
  let tableRows = []
  const closeTable = () => {
    if (tableRows.length) html += `<table>${tableRows.join('')}</table>`
    tableRows = []
  }
  for (const b of blocks) {
    if (b.kind === 'row') tableRows.push(`<tr>${b.cells.map((c) => `<td>${c}</td>`).join('')}</tr>`)
    else {
      closeTable()
      html += b.kind === 'break' ? '<div class="page-break"></div>' : b.html
    }
  }
  closeTable()

  const tw = (v) => `${(v / 20).toFixed(1)}pt`
  return {
    html: page(
      `@page{size:${tw(geometry.w)} ${tw(geometry.h)};margin:${geometry.margins.map(tw).join(' ')}}
body{font-family:Calibri,'Times New Roman',serif;font-size:12pt;line-height:1.3}
p{margin:0}
table{border-collapse:collapse;margin:4pt 0}td{border:0.5pt solid #888;padding:2pt 4pt;vertical-align:top}
.tab{display:inline-block;width:36pt}.page-break{break-after:page}`,
      html || '<p></p>',
    ),
  }
}
