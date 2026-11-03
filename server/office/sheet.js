import ExcelJS from 'exceljs'
import * as XLSX from 'xlsx'
import { HttpError } from '../util.js'
import { esc, page } from './common.js'

const MAX_ROWS = 5000
const PORTRAIT_PT = 527 // A4 width minus 12 mm margins

// Excel's legacy indexed palette (64 = system foreground, 65 = system background).
const INDEXED = (
  '000000 FFFFFF FF0000 00FF00 0000FF FFFF00 FF00FF 00FFFF 000000 FFFFFF FF0000 00FF00 0000FF FFFF00 FF00FF 00FFFF ' +
  '800000 008000 000080 808000 800080 008080 C0C0C0 808080 9999FF 993366 FFFFCC CCFFFF 660066 FF8080 0066CC CCCCFF ' +
  '000080 FF00FF FFFF00 00FFFF 800080 800000 008080 0000FF 00CCFF CCFFFF CCFFCC FFFF99 99CCFF FF99CC CC99FF FFCC99 ' +
  '3366FF 33CCCC 99CC00 FFCC00 FF9900 FF6600 666699 969696 003366 339966 003300 333300 993300 993366 333399 333333 000000 FFFFFF'
).split(' ')

// Shrinks tables that are wider than the printable area (runs before printing).
const FIT_SCRIPT = `<script>
for (const s of document.querySelectorAll('.sheet')) {
  const t = s.querySelector('table'); if (!t) continue;
  const scale = s.clientWidth / t.scrollWidth;
  if (scale < 1) t.style.zoom = Math.max(0.3, scale);
}
</script>`

const SHEET_CSS = `@page{size:A4;margin:12mm}
@page wide{size:A4 landscape;margin:12mm}
body{font-family:Calibri,Carlito,"Segoe UI",Arial,sans-serif}
.sheet{width:186mm}
.sheet.wide{page:wide;width:273mm}
.sheet+.sheet{break-before:page}
h2{font-size:13pt;margin:0 0 6pt}
table{border-collapse:collapse;font-size:11pt}
.note{font-size:9pt;color:#666;margin:6pt 0 0}`

// ---------- colors ----------

function themeColors(xml) {
  const pick = (name) => {
    const m = new RegExp(`<a:${name}>([\\s\\S]*?)</a:${name}>`).exec(xml ?? '')
    return m && (/lastClr="([0-9A-Fa-f]{6})"/.exec(m[1])?.[1] ?? /val="([0-9A-Fa-f]{6})"/.exec(m[1])?.[1])
  }
  // Excel theme indexes swap the light/dark pairs relative to the theme file.
  return [
    'lt1',
    'dk1',
    'lt2',
    'dk2',
    'accent1',
    'accent2',
    'accent3',
    'accent4',
    'accent5',
    'accent6',
    'hlink',
    'folHlink',
  ].map(pick)
}

function applyTint(hex, tint) {
  if (!tint) return hex
  let [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  let l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    h /= 6
  }
  l = tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const f = (t) => {
    t = (t + 1) % 1
    return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p
  }
  ;[r, g, b] = s === 0 ? [l, l, l] : [f(h + 1 / 3), f(h), f(h - 1 / 3)]
  return [r, g, b]
    .map((v) =>
      Math.round(v * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
}

function cssColor(c, theme) {
  if (!c) return null
  let hex = null
  if (c.argb) hex = c.argb.slice(-6)
  else if (c.theme !== undefined) hex = theme[c.theme]
  else if (c.indexed !== undefined) hex = INDEXED[c.indexed]
  return hex ? `#${applyTint(hex, c.tint)}` : null
}

const BORDER_WIDTH = {
  hair: 0.25,
  thin: 0.5,
  dotted: 0.5,
  dashed: 0.5,
  dashDot: 0.5,
  dashDotDot: 0.5,
  medium: 1,
  mediumDashed: 1,
  mediumDashDot: 1,
  slantDashDot: 1,
  thick: 1.5,
  double: 2,
}

function cellCss(cell, theme, isNumber) {
  const st = cell.style ?? {}
  const css = []
  const f = st.font
  if (f) {
    if (f.bold) css.push('font-weight:700')
    if (f.italic) css.push('font-style:italic')
    if (f.underline || f.strike)
      css.push(`text-decoration:${[f.underline && 'underline', f.strike && 'line-through'].filter(Boolean).join(' ')}`)
    if (f.size) css.push(`font-size:${f.size}pt`)
    if (f.name) css.push(`font-family:'${String(f.name).replace(/['"\\<>;]/g, '')}',Calibri,Arial,sans-serif`)
    const color = cssColor(f.color, theme)
    if (color) css.push(`color:${color}`)
  }
  const fill = st.fill
  if (fill?.type === 'pattern' && fill.pattern && fill.pattern !== 'none') {
    const color = cssColor(fill.fgColor, theme) ?? cssColor(fill.bgColor, theme)
    if (color) css.push(`background:${color}`)
  } else if (fill?.type === 'gradient' && fill.stops?.length) {
    const color = cssColor(fill.stops[0].color, theme)
    if (color) css.push(`background:${color}`)
  }
  let bordered = false
  for (const side of ['top', 'right', 'bottom', 'left']) {
    const b = st.border?.[side]
    if (!b?.style) continue
    bordered = true
    const style =
      b.style === 'double' ? 'double' : /dot/i.test(b.style) ? 'dotted' : /dash/i.test(b.style) ? 'dashed' : 'solid'
    css.push(`border-${side}:${BORDER_WIDTH[b.style] ?? 0.5}pt ${style} ${cssColor(b.color, theme) ?? '#000'}`)
  }
  const a = st.alignment ?? {}
  const h = {
    center: 'center',
    centerContinuous: 'center',
    right: 'right',
    justify: 'justify',
    distributed: 'justify',
    left: 'left',
  }[a.horizontal]
  if (h || isNumber) css.push(`text-align:${h ?? 'right'}`)
  if (a.vertical)
    css.push(`vertical-align:${{ top: 'top', middle: 'middle', bottom: 'bottom' }[a.vertical] ?? 'bottom'}`)
  if (a.wrapText) css.push('white-space:pre-wrap')
  if (a.indent) css.push(`padding-left:${a.indent * 9}pt`)
  return { css: css.join(';'), bordered }
}

// ---------- XLSX with styles (ExcelJS) + number formatting (SheetJS) ----------

async function styledXlsx(buffer) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  const formatted = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  const theme = themeColors(wb._themes?.theme1)
  const visible = wb.worksheets.filter((ws) => ws.state === 'visible')
  const sections = []

  for (const ws of visible) {
    const sj = formatted.Sheets[ws.name]
    if (!sj?.['!ref']) continue
    const range = XLSX.utils.decode_range(sj['!ref'])
    const lastRow = Math.min(range.e.r, range.s.r + MAX_ROWS - 1)

    const covered = new Set()
    const spans = new Map()
    for (const ref of ws.model.merges ?? []) {
      const m = XLSX.utils.decode_range(ref)
      spans.set(`${m.s.r},${m.s.c}`, { rows: m.e.r - m.s.r + 1, cols: m.e.c - m.s.c + 1 })
      for (let r = m.s.r; r <= m.e.r; r++)
        for (let c = m.s.c; c <= m.e.c; c++) if (r !== m.s.r || c !== m.s.c) covered.add(`${r},${c}`)
    }

    const cols = []
    for (let c = range.s.c; c <= range.e.c; c++) {
      const col = ws.getColumn(c + 1)
      if (col.hidden) continue
      cols.push({ c, pt: ((col.width ?? 8.43) * 7 + 5) * 0.75 })
    }
    const totalPt = cols.reduce((n, col) => n + col.pt, 0)

    let anyBorder = false
    const rows = []
    for (let r = range.s.r; r <= lastRow; r++) {
      const row = ws.getRow(r + 1)
      if (row.hidden) continue
      const cells = []
      for (const { c } of cols) {
        const key = `${r},${c}`
        if (covered.has(key)) continue
        const cell = row.getCell(c + 1)
        const sjCell = sj[XLSX.utils.encode_cell({ r, c })]
        const text = sjCell?.w ?? (sjCell?.v !== undefined ? String(sjCell.v) : '')
        const { css, bordered } = cellCss(cell, theme, sjCell?.t === 'n')
        anyBorder ||= bordered
        const span = spans.get(key)
        const attrs = span
          ? `${span.rows > 1 ? ` rowspan="${span.rows}"` : ''}${span.cols > 1 ? ` colspan="${span.cols}"` : ''}`
          : ''
        cells.push(`<td${attrs}${css ? ` style="${css}"` : ''}>${esc(text)}</td>`)
      }
      const height = row.height ? `height:${row.height}pt` : 'height:15pt'
      rows.push(`<tr style="${height}">${cells.join('')}</tr>`)
    }

    const landscape =
      ws.pageSetup?.orientation === 'landscape' ||
      (ws.pageSetup?.orientation !== 'portrait' && totalPt > PORTRAIT_PT * 1.1)
    const grid = ws.pageSetup?.showGridLines || !anyBorder
    const note =
      range.e.r > lastRow
        ? `<p class="note">${(range.e.r - lastRow).toLocaleString('en')} more rows aren’t shown.</p>`
        : ''
    const title = visible.length > 1 ? `<h2>${esc(ws.name)}</h2>` : ''
    sections.push(
      `<section class="sheet${landscape ? ' wide' : ''}">${title}<table class="${grid ? 'grid' : ''}" style="table-layout:fixed;width:${totalPt.toFixed(1)}pt">` +
        `<colgroup>${cols.map((col) => `<col style="width:${col.pt.toFixed(1)}pt">`).join('')}</colgroup>${rows.join('')}</table>${note}</section>`,
    )
  }
  if (!sections.length) throw new HttpError(422, 'This spreadsheet has no data to convert.')
  return page(
    `${SHEET_CSS}
td{padding:1pt 3pt;vertical-align:bottom;white-space:nowrap;overflow:hidden}
table.grid td{outline:0.4pt solid #d0d0d0;outline-offset:-0.2pt}`,
    sections.join('') + FIT_SCRIPT,
  )
}

// ---------- XLS / ODS / CSV (SheetJS, values only) ----------

function plainSpreadsheet(buffer) {
  let wb
  try {
    wb = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  } catch {
    throw new HttpError(422, 'This spreadsheet couldn’t be read. It may be damaged or password-protected.')
  }
  const sections = []
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name]
    if (!ws?.['!ref']) continue
    const range = XLSX.utils.decode_range(ws['!ref'])
    const rows = range.e.r - range.s.r + 1
    const cols = range.e.c - range.s.c + 1
    let note = ''
    if (rows > MAX_ROWS) {
      ws['!ref'] = XLSX.utils.encode_range({ s: range.s, e: { r: range.s.r + MAX_ROWS - 1, c: range.e.c } })
      note = `<p class="note">${(rows - MAX_ROWS).toLocaleString('en')} more rows aren’t shown.</p>`
    }
    const table = XLSX.utils.sheet_to_html(ws, { header: '', footer: '' })
    const title = wb.SheetNames.length > 1 ? `<h2>${esc(name)}</h2>` : ''
    sections.push(`<section class="sheet${cols > 7 ? ' wide' : ''}">${title}${table}${note}</section>`)
  }
  if (!sections.length) throw new HttpError(422, 'This spreadsheet has no data to convert.')
  return page(
    `${SHEET_CSS}
table{font-size:9pt}
td,th{border:0.5pt solid #bdbdbd;padding:2pt 4pt;vertical-align:bottom;white-space:nowrap}
td[data-t="n"]{text-align:right}`,
    sections.join('') + FIT_SCRIPT,
  )
}

export async function spreadsheetDocument(buffer, ext) {
  if (ext === 'xlsx') {
    try {
      return { html: await styledXlsx(buffer) }
    } catch (e) {
      if (e instanceof HttpError) throw e
      console.warn('[xlsx] styled render failed, using plain table:', e.message)
    }
  }
  return { html: plainSpreadsheet(buffer) }
}
