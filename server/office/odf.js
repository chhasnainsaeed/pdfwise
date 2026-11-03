// OpenDocument text (.odt) and presentations (.odp) → HTML.

import { DOMParser } from '@xmldom/xmldom'
import JSZip from 'jszip'
import { HttpError } from '../util.js'
import { esc, page, toPt, zipImage } from './common.js'

const NS = {
  office: 'urn:oasis:names:tc:opendocument:xmlns:office:1.0',
  text: 'urn:oasis:names:tc:opendocument:xmlns:text:1.0',
  table: 'urn:oasis:names:tc:opendocument:xmlns:table:1.0',
  draw: 'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0',
  style: 'urn:oasis:names:tc:opendocument:xmlns:style:1.0',
  svg: 'urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0',
  xlink: 'http://www.w3.org/1999/xlink',
  presentation: 'urn:oasis:names:tc:opendocument:xmlns:presentation:1.0',
}

const children = (el) => (el ? Array.from(el.childNodes).filter((n) => n.nodeType === 1) : [])
const is = (n, ns, name) => n?.nodeType === 1 && n.namespaceURI === NS[ns] && n.localName === name
const attr = (el, ns, name) => el?.getAttributeNS(NS[ns], name) || null
const all = (root, ns, name) => (root ? Array.from(root.getElementsByTagNameNS(NS[ns], name)) : [])
const clean = (s) => String(s).replace(/['"\\<>;]/g, '')

const PROP_KINDS = {
  'text-properties': 'text',
  'paragraph-properties': 'para',
  'graphic-properties': 'graphic',
  'table-cell-properties': 'cell',
  'table-column-properties': 'column',
  'drawing-page-properties': 'page',
}

class OdfDoc {
  constructor(zip, content, styles) {
    this.zip = zip
    this.content = content
    this.styles = styles
    this.byName = new Map()
    this.cache = new Map()
    this.images = new Map()
    for (const root of [styles, content]) {
      for (const s of all(root, 'style', 'style'))
        this.byName.set(`${attr(s, 'style', 'family')}:${attr(s, 'style', 'name')}`, s)
      for (const s of all(root, 'style', 'style'))
        if (!this.byName.has(`*:${attr(s, 'style', 'name')}`)) this.byName.set(`*:${attr(s, 'style', 'name')}`, s)
      for (const s of all(root, 'text', 'list-style')) this.byName.set(`list:${attr(s, 'style', 'name')}`, s)
    }
    this.defaults = {}
    for (const d of all(styles, 'style', 'default-style')) this.defaults[attr(d, 'style', 'family')] = d
  }

  /** Merged properties of a named style, following parent-style-name. */
  props(name, family = '*', seen = new Set()) {
    const key = `${family}:${name}`
    if (this.cache.has(key)) return this.cache.get(key)
    const empty = { text: {}, para: {}, graphic: {}, cell: {}, column: {}, page: {} }
    const s = this.byName.get(key) ?? this.byName.get(`*:${name}`)
    if (!s || seen.has(key)) return empty
    seen.add(key)
    const parent = attr(s, 'style', 'parent-style-name')
    const base = parent ? this.props(parent, family, seen) : empty
    const merged = Object.fromEntries(Object.entries(base).map(([k, v]) => [k, { ...v }]))
    for (const child of children(s)) {
      const kind = PROP_KINDS[child.localName]
      if (!kind) continue
      for (const a of Array.from(child.attributes)) merged[kind][a.localName] = a.value
    }
    this.cache.set(key, merged)
    return merged
  }

  isNumberedList(name) {
    const list = this.byName.get(`list:${name}`)
    return Boolean(list && children(list).find((c) => c.localName === 'list-level-style-number'))
  }

  async loadImages() {
    for (const img of all(this.content, 'draw', 'image').concat(all(this.styles, 'draw', 'image'))) {
      const href = img.getAttributeNS(NS.xlink, 'href')
      if (href && !this.images.has(href)) this.images.set(href, await zipImage(this.zip, href.replace(/^\.\//, '')))
    }
  }
}

async function openOdf(buffer) {
  let zip
  try {
    zip = await JSZip.loadAsync(buffer)
  } catch {
    throw new HttpError(422, 'This file couldn’t be read. It may be damaged or password-protected.')
  }
  const parse = async (p) => {
    const s = await zip.file(p)?.async('string')
    return s ? new DOMParser().parseFromString(s, 'text/xml').documentElement : null
  }
  const content = await parse('content.xml')
  if (!content) throw new HttpError(422, 'This isn’t an OpenDocument file (or it’s encrypted).')
  const doc = new OdfDoc(zip, content, await parse('styles.xml'))
  await doc.loadImages()
  return doc
}

// ---------- CSS from ODF properties ----------

function textCss(t) {
  const css = []
  if (t['font-weight'] && t['font-weight'] !== 'normal')
    css.push(`font-weight:${t['font-weight'] === 'bold' ? 700 : t['font-weight']}`)
  if (t['font-style'] === 'italic' || t['font-style'] === 'oblique') css.push('font-style:italic')
  const deco = [
    t['text-underline-style'] && t['text-underline-style'] !== 'none' && 'underline',
    t['text-line-through-style'] && t['text-line-through-style'] !== 'none' && 'line-through',
  ].filter(Boolean)
  if (deco.length) css.push(`text-decoration:${deco.join(' ')}`)
  if (t['font-size'] && !t['font-size'].endsWith('%')) css.push(`font-size:${toPt(t['font-size'], 12).toFixed(1)}pt`)
  if (t.color) css.push(`color:${t.color}`)
  const face = t['font-name'] ?? t['font-family']
  if (face) css.push(`font-family:'${clean(face)}',Calibri,Carlito,Arial,sans-serif`)
  if (t['background-color'] && t['background-color'] !== 'transparent') css.push(`background:${t['background-color']}`)
  if (t['text-position']?.startsWith('super')) css.push('vertical-align:super;font-size:smaller')
  if (t['text-position']?.startsWith('sub')) css.push('vertical-align:sub;font-size:smaller')
  if (t['text-transform'] && t['text-transform'] !== 'none') css.push(`text-transform:${t['text-transform']}`)
  return css
}

function paraCss(p) {
  const css = []
  const align = { start: 'left', left: 'left', end: 'right', right: 'right', center: 'center', justify: 'justify' }[
    p['text-align']
  ]
  if (align) css.push(`text-align:${align}`)
  for (const side of ['margin-left', 'margin-right', 'margin-top', 'margin-bottom', 'text-indent'])
    if (p[side]) css.push(`${side}:${toPt(p[side]).toFixed(1)}pt`)
  if (p['line-height']?.endsWith('%')) css.push(`line-height:${parseFloat(p['line-height']) / 100}`)
  if (p['background-color'] && p['background-color'] !== 'transparent') css.push(`background:${p['background-color']}`)
  return css
}

function boxCss(g) {
  const css = []
  if (g.fill === 'solid' && g['fill-color']) css.push(`background:${g['fill-color']}`)
  else if (!g.fill && g['fill-color'] && g['fill-color'] !== 'transparent') css.push(`background:${g['fill-color']}`)
  if (g['background-color'] && g['background-color'] !== 'transparent') css.push(`background:${g['background-color']}`)
  if (g.stroke && g.stroke !== 'none')
    css.push(
      `border:${Math.max(0.5, toPt(g['stroke-width'] ?? '0.75pt', 0.75)).toFixed(2)}pt ${g.stroke === 'dash' ? 'dashed' : 'solid'} ${g['stroke-color'] ?? '#000'}`,
    )
  for (const side of ['', '-top', '-right', '-bottom', '-left']) {
    const b = g[`border${side}`]
    if (b && b !== 'none')
      css.push(`border${side}:${b.replace(/(\d*\.?\d+)(cm|mm|in)/g, (m) => `${toPt(m).toFixed(2)}pt`)}`)
  }
  return css
}

const style = (css) => (css.length ? ` style="${css.join(';')}"` : '')

// ---------- text content ----------

function inline(node, doc) {
  let out = ''
  for (const n of Array.from(node.childNodes)) {
    if (n.nodeType === 3) {
      out += esc(n.nodeValue)
      continue
    }
    if (n.nodeType !== 1) continue
    if (n.namespaceURI === NS.text) {
      const name = n.localName
      if (name === 's') out += ' '.repeat(Number(attr(n, 'text', 'c') || 1)).replace(/ /g, '&nbsp;')
      else if (name === 'tab') out += '<span class="tab"></span>'
      else if (name === 'line-break') out += '<br>'
      else if (name === 'span') {
        const st = attr(n, 'text', 'style-name')
        out += `<span${style(st ? textCss(doc.props(st, 'text').text) : [])}>${inline(n, doc)}</span>`
      } else if (
        [
          'note',
          'bookmark',
          'bookmark-start',
          'bookmark-end',
          'soft-page-break',
          'sequence-decls',
          'annotation',
          'reference-mark-start',
          'reference-mark-end',
        ].includes(name)
      ) {
        // Not printed inline.
      } else out += inline(n, doc)
    } else if (is(n, 'draw', 'frame')) out += frameInline(n, doc)
    else out += inline(n, doc)
  }
  return out
}

function frameInline(frame, doc) {
  const w = attr(frame, 'svg', 'width')
  const h = attr(frame, 'svg', 'height')
  const size = [w && `width:${toPt(w).toFixed(1)}pt`, h && `height:${toPt(h).toFixed(1)}pt`].filter(Boolean)
  const img = children(frame).find((c) => is(c, 'draw', 'image'))
  if (img) {
    const uri = doc.images.get(img.getAttributeNS(NS.xlink, 'href'))
    return uri ? `<img src="${uri}"${style(size)}>` : ''
  }
  const box = children(frame).find((c) => is(c, 'draw', 'text-box'))
  return box ? `<span class="textbox"${style(size)}>${blocks(box, doc)}</span>` : ''
}

function blocks(node, doc, baseText = []) {
  let out = ''
  for (const n of children(node)) {
    if (is(n, 'text', 'p') || is(n, 'text', 'h')) {
      const st = attr(n, 'text', 'style-name')
      const props = st ? doc.props(st, 'paragraph') : { para: {}, text: {} }
      const tag = is(n, 'text', 'h') ? `h${Math.min(6, Number(attr(n, 'text', 'outline-level') || 1))}` : 'p'
      out += `<${tag}${style([...baseText, ...paraCss(props.para), ...textCss(props.text)])}>${inline(n, doc) || '&nbsp;'}</${tag}>`
    } else if (is(n, 'text', 'list')) {
      const tag = doc.isNumberedList(attr(n, 'text', 'style-name')) ? 'ol' : 'ul'
      const items = children(n)
        .filter((c) => is(c, 'text', 'list-item') || is(c, 'text', 'list-header'))
        .map((li) => `<li${is(li, 'text', 'list-header') ? ' class="nb"' : ''}>${blocks(li, doc, baseText)}</li>`)
      out += `<${tag}>${items.join('')}</${tag}>`
    } else if (is(n, 'table', 'table')) out += tableHtml(n, doc)
    else if (
      is(n, 'text', 'section') ||
      is(n, 'text', 'index-body') ||
      is(n, 'text', 'table-of-content') ||
      is(n, 'text', 'alphabetical-index')
    )
      out += blocks(n, doc, baseText)
    else if (is(n, 'draw', 'frame')) out += `<p>${frameInline(n, doc)}</p>`
  }
  return out
}

function tableHtml(t, doc) {
  const widths = []
  const rows = []
  const walk = (el) => {
    for (const c of children(el)) {
      if (is(c, 'table', 'table-column')) {
        const w = doc.props(attr(c, 'table', 'style-name') ?? '', 'table-column').column['column-width']
        const repeat = Math.min(64, Number(attr(c, 'table', 'number-columns-repeated') || 1))
        for (let i = 0; i < repeat; i++) widths.push(w ? toPt(w) : null)
      } else if (is(c, 'table', 'table-row')) rows.push(c)
      else if (
        [
          'table-header-rows',
          'table-rows',
          'table-row-group',
          'table-columns',
          'table-header-columns',
          'table-column-group',
        ].includes(c.localName)
      )
        walk(c)
    }
  }
  walk(t)
  const body = rows
    .map((row) => {
      const cells = children(row)
        .filter((c) => is(c, 'table', 'table-cell'))
        .flatMap((cell) => {
          const props = doc.props(attr(cell, 'table', 'style-name') ?? '', 'table-cell')
          const colspan = Number(attr(cell, 'table', 'number-columns-spanned') || 1)
          const rowspan = Number(attr(cell, 'table', 'number-rows-spanned') || 1)
          const html = `<td${colspan > 1 ? ` colspan="${colspan}"` : ''}${rowspan > 1 ? ` rowspan="${rowspan}"` : ''}${style(boxCss(props.cell))}>${blocks(cell, doc)}</td>`
          return Array(Math.min(64, Number(attr(cell, 'table', 'number-columns-repeated') || 1))).fill(html)
        })
      return `<tr>${cells.join('')}</tr>`
    })
    .join('')
  const cols = widths.some(Boolean)
    ? `<colgroup>${widths.map((w) => `<col${w ? ` style="width:${w.toFixed(1)}pt"` : ''}>`).join('')}</colgroup>`
    : ''
  return `<table>${cols}${body}</table>`
}

function pageLayout(doc) {
  const props = all(doc.styles, 'style', 'page-layout-properties')[0]
  const get = (n, d) => toPt(props?.getAttributeNS('urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0', n), d)
  return {
    w: get('page-width', 595.3),
    h: get('page-height', 841.9),
    margins: ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'].map((m) => get(m, 56.7)),
  }
}

function defaultTextCss(doc) {
  const d = doc.defaults.paragraph
  const t = {}
  for (const child of children(d))
    if (child.localName === 'text-properties') for (const a of Array.from(child.attributes)) t[a.localName] = a.value
  return textCss(t).join(';')
}

// ---------- ODT ----------

export async function odtDocument(buffer) {
  const doc = await openOdf(buffer)
  const body = all(doc.content, 'office', 'text')[0]
  if (!body) throw new HttpError(422, 'This OpenDocument file has no text body.')
  const { w, h, margins } = pageLayout(doc)
  return {
    html: page(
      `@page{size:${w.toFixed(1)}pt ${h.toFixed(1)}pt;margin:${margins.map((m) => `${m.toFixed(1)}pt`).join(' ')}}
body{font-family:'Liberation Serif','Times New Roman',serif;font-size:12pt;line-height:1.25;${defaultTextCss(doc)}}
p{margin:0 0 4pt}h1,h2,h3,h4,h5,h6{margin:10pt 0 5pt}
h1{font-size:18pt}h2{font-size:16pt}h3{font-size:14pt}h4,h5,h6{font-size:12pt}
ul,ol{margin:0 0 6pt;padding-left:20pt}li.nb{list-style:none}li>p{margin:0}
table{border-collapse:collapse;margin:0 0 8pt}td{padding:2pt 4pt;vertical-align:top}td p{margin:0}
.tab{display:inline-block;width:36pt}.textbox{display:inline-block;vertical-align:top}`,
      blocks(body, doc) || '<p></p>',
    ),
  }
}

// ---------- ODP ----------

const CLASS_SIZES = {
  title: 'font-size:32pt',
  subtitle: 'font-size:24pt',
  outline: 'font-size:18pt',
  notes: 'font-size:12pt',
}

function shapeHtml(el, doc) {
  if (is(el, 'draw', 'g'))
    return children(el)
      .map((c) => shapeHtml(c, doc))
      .join('')
  if (is(el, 'draw', 'line')) {
    const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map((k) => toPt(attr(el, 'svg', k)))
    const g = doc.props(attr(el, 'draw', 'style-name') ?? '', 'graphic').graphic
    const left = Math.min(x1, x2)
    const top = Math.min(y1, y2)
    const w = Math.max(Math.abs(x2 - x1), 0.1)
    const h = Math.max(Math.abs(y2 - y1), 0.1)
    return `<svg class="shape" style="left:${left}pt;top:${top}pt;width:${w}pt;height:${h}pt;overflow:visible" viewBox="0 0 ${w} ${h}"><line x1="${x1 - left}" y1="${y1 - top}" x2="${x2 - left}" y2="${y2 - top}" stroke="${g['stroke-color'] ?? '#000'}" stroke-width="${toPt(g['stroke-width'] ?? '0.75pt', 0.75)}"/></svg>`
  }
  if (!['frame', 'custom-shape', 'rect', 'ellipse', 'circle'].includes(el.localName) || el.namespaceURI !== NS.draw)
    return ''
  if (el.getAttributeNS(NS.presentation, 'placeholder') === 'true') return ''

  const pos = ['x', 'y', 'width', 'height'].map((k) => toPt(attr(el, 'svg', k)))
  const cls = el.getAttributeNS(NS.presentation, 'class')
  const styleName = el.getAttributeNS(NS.presentation, 'style-name') || attr(el, 'draw', 'style-name')
  const props = styleName ? doc.props(styleName) : { graphic: {}, text: {}, para: {} }
  const css = [
    `left:${pos[0].toFixed(1)}pt`,
    `top:${pos[1].toFixed(1)}pt`,
    `width:${pos[2].toFixed(1)}pt`,
    `height:${pos[3].toFixed(1)}pt`,
  ]
  const geometry = children(el).find((c) => is(c, 'draw', 'enhanced-geometry'))
  const geoType = geometry?.getAttributeNS(NS.draw, 'type')
  if (el.localName !== 'frame') css.push(...boxCss(props.graphic))
  if (el.localName === 'ellipse' || el.localName === 'circle' || geoType === 'ellipse' || geoType === 'circle')
    css.push('border-radius:50%')
  if (geoType === 'round-rectangle') css.push(`border-radius:${(Math.min(pos[2], pos[3]) * 0.15).toFixed(1)}pt`)
  const transform = attr(el, 'draw', 'transform')
  const rot = transform && /rotate\s*\(\s*(-?[\d.]+)/.exec(transform)
  if (rot) css.push(`transform:rotate(${(-Number(rot[1]) * 180) / Math.PI}deg)`)

  const baseText = [CLASS_SIZES[cls], ...textCss(props.text)].filter(Boolean)
  const valign = { middle: 'center', bottom: 'flex-end', top: 'flex-start' }[
    props.graphic['textarea-vertical-align'] ?? (el.localName === 'frame' ? 'top' : 'middle')
  ]
  let inner = ''
  const img = children(el).find((c) => is(c, 'draw', 'image'))
  const box = children(el).find((c) => is(c, 'draw', 'text-box'))
  if (img) {
    const uri = doc.images.get(img.getAttributeNS(NS.xlink, 'href'))
    inner = uri ? `<img src="${uri}" style="width:100%;height:100%;object-fit:fill">` : ''
  } else if (box) inner = `<div class="tx" style="justify-content:${valign}">${blocks(box, doc, baseText)}</div>`
  else if (children(el).some((c) => is(c, 'text', 'p') || is(c, 'text', 'list'))) {
    inner = `<div class="tx" style="justify-content:${valign};text-align:center">${blocks(el, doc, baseText)}</div>`
  }
  return `<div class="shape"${style(css)}>${inner}</div>`
}

export async function odpDocument(buffer) {
  const doc = await openOdf(buffer)
  const pres = all(doc.content, 'office', 'presentation')[0]
  if (!pres) throw new HttpError(422, 'This OpenDocument file isn’t a presentation.')
  const { w, h } = pageLayout(doc)
  const masters = new Map(all(doc.styles, 'style', 'master-page').map((m) => [attr(m, 'style', 'name'), m]))
  const slides = all(pres, 'draw', 'page').map((pg) => {
    const master = masters.get(attr(pg, 'draw', 'master-page-name'))
    const bgProps = (el) => {
      const name = attr(el, 'draw', 'style-name')
      const p = name ? doc.props(name, 'drawing-page').page : {}
      return p.fill === 'solid' && p['fill-color'] ? p['fill-color'] : null
    }
    const bg = bgProps(pg) ?? (master && bgProps(master)) ?? '#fff'
    const decorations = master
      ? children(master)
          .map((c) => shapeHtml(c, doc))
          .join('')
      : ''
    const shapes = children(pg)
      .map((c) => shapeHtml(c, doc))
      .join('')
    return `<div class="slide" style="background:${bg}">${decorations}${shapes}</div>`
  })
  if (!slides.length) throw new HttpError(422, 'This presentation has no slides to convert.')
  return {
    html: page(
      `@page{size:${w.toFixed(1)}pt ${h.toFixed(1)}pt;margin:0}
body{font-family:'Liberation Sans',Arial,sans-serif;font-size:18pt}
.slide{position:relative;width:${w.toFixed(1)}pt;height:${h.toFixed(1)}pt;overflow:hidden;break-after:page}
.slide:last-child{break-after:auto}
.shape{position:absolute}
.tx{position:absolute;inset:0;display:flex;flex-direction:column;padding:4pt 7pt}
.tx p,.tx h1,.tx h2,.tx h3{margin:0}
ul,ol{margin:0;padding-left:1.1em}li.nb{list-style:none}li>p{margin:0}
table{border-collapse:collapse}td{padding:2pt 4pt;border:0.5pt solid #999}
.tab{display:inline-block;width:36pt}`,
      slides.join(''),
    ),
  }
}
