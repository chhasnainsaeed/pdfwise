import { DOMParser } from '@xmldom/xmldom'
import JSZip from 'jszip'
import path from 'node:path'
import { HttpError } from '../util.js'
import { esc, page, zipImage } from './common.js'

const NS = {
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  c: 'http://schemas.openxmlformats.org/drawingml/2006/chart',
  dgm: 'http://schemas.openxmlformats.org/drawingml/2006/diagram',
  dsp: 'http://schemas.microsoft.com/office/drawing/2008/diagram',
}
const EMU_PT = 12700
const pt = (emu) => `${(Number(emu) / EMU_PT).toFixed(2)}pt`

const children = (el) => (el ? Array.from(el.childNodes).filter((n) => n.nodeType === 1) : [])
const kids = (el, q) => {
  const [ns, name] = q.split(':')
  return children(el).filter((n) => n.namespaceURI === NS[ns] && n.localName === name)
}
const kid = (el, q) => kids(el, q)[0] ?? null
const dig = (el, ...qs) => qs.reduce((cur, q) => (cur ? kid(cur, q) : null), el)
/** Child in the PresentationML namespace or its SmartArt-drawing twin. */
const pchild = (el, local) => children(el).find((n) => n.localName === local && (n.namespaceURI === NS.p || n.namespaceURI === NS.dsp)) ?? null
const num = (el, name, fallback = null) => {
  const v = el?.getAttribute(name)
  return v === null || v === undefined || v === '' ? fallback : Number(v)
}

class Pptx {
  constructor(zip) {
    this.zip = zip
    this.parts = new Map()
    this.media = new Map()
  }

  async xml(p) {
    if (!this.parts.has(p)) {
      const s = await this.zip.file(p)?.async('string')
      this.parts.set(p, s ? new DOMParser().parseFromString(s, 'text/xml').documentElement : null)
    }
    return this.parts.get(p)
  }

  async rels(p) {
    const dir = path.posix.dirname(p)
    const root = await this.xml(`${dir}/_rels/${path.posix.basename(p)}.rels`)
    const map = new Map()
    for (const r of Array.from(root?.getElementsByTagName('Relationship') ?? [])) {
      const target = r.getAttribute('Target')
      const external = r.getAttribute('TargetMode') === 'External'
      const resolved = external ? target : target.startsWith('/') ? target.slice(1) : path.posix.normalize(path.posix.join(dir, target))
      map.set(r.getAttribute('Id'), { target: resolved, type: r.getAttribute('Type') ?? '', external })
    }
    return map
  }

  async dataUri(p) {
    if (!this.media.has(p)) this.media.set(p, await zipImage(this.zip, p))
    return this.media.get(p)
  }
}

// ---------- colors ----------

function hexToRgb(hex) {
  const n = parseInt(hex, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbToHsl([r, g, b]) {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h / 6, s, l]
}

function hslToRgb([h, s, l]) {
  if (s === 0) return [l, l, l].map((v) => Math.round(v * 255))
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const f = (t) => {
    t = (t + 1) % 1
    return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p
  }
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map((v) => Math.round(v * 255))
}

const SCHEME_ALIAS = { tx1: 'dk1', tx2: 'dk2', bg1: 'lt1', bg2: 'lt2' }

/** Resolves the first color child of `el` (srgbClr, schemeClr, sysClr, prstClr) to CSS. */
function colorOf(el, theme) {
  for (const c of children(el)) {
    let hex = null
    if (c.localName === 'srgbClr') hex = c.getAttribute('val')
    else if (c.localName === 'sysClr') hex = c.getAttribute('lastClr') || (c.getAttribute('val') === 'window' ? 'FFFFFF' : '000000')
    else if (c.localName === 'schemeClr') {
      const v = c.getAttribute('val')
      hex = theme.colors[SCHEME_ALIAS[v] ?? v] ?? null
    } else if (c.localName === 'prstClr') return c.getAttribute('val')
    else continue
    if (!hex) return null
    let rgb = hexToRgb(hex)
    let alpha = 1
    for (const m of children(c)) {
      const v = num(m, 'val', 0) / 100000
      if (m.localName === 'lumMod' || m.localName === 'lumOff') {
        const hsl = rgbToHsl(rgb)
        hsl[2] = Math.min(1, Math.max(0, m.localName === 'lumMod' ? hsl[2] * v : hsl[2] + v))
        rgb = hslToRgb(hsl)
      } else if (m.localName === 'shade') rgb = rgb.map((x) => Math.round(x * v))
      else if (m.localName === 'tint') rgb = rgb.map((x) => Math.round(x + (255 - x) * (1 - v)))
      else if (m.localName === 'alpha') alpha = v
    }
    return alpha < 1 ? `rgba(${rgb.join(',')},${alpha.toFixed(2)})` : `rgb(${rgb.join(',')})`
  }
  return null
}

const accent = (theme, i) => `#${theme.colors[`accent${(i % 6) + 1}`] ?? ['4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47'][i % 6]}`

async function fillCss(fillParent, theme, pres, rels) {
  if (!fillParent) return undefined
  if (kid(fillParent, 'a:noFill')) return 'transparent'
  const solid = kid(fillParent, 'a:solidFill')
  if (solid) return colorOf(solid, theme) ?? undefined
  const grad = kid(fillParent, 'a:gradFill')
  if (grad) {
    const stops = kids(dig(grad, 'a:gsLst'), 'a:gs').map((gs) => `${colorOf(gs, theme) ?? '#fff'} ${num(gs, 'pos', 0) / 1000}%`)
    const ang = num(dig(grad, 'a:lin'), 'ang', 5400000) / 60000
    return stops.length ? `linear-gradient(${ang + 90}deg, ${stops.join(', ')})` : undefined
  }
  const blip = dig(fillParent, 'a:blipFill', 'a:blip')
  if (blip && rels) {
    const rel = rels.get(blip.getAttributeNS(NS.r, 'embed'))
    const uri = rel && !rel.external ? await pres.dataUri(rel.target) : null
    return uri ? `center / cover no-repeat url('${uri}')` : undefined
  }
  return undefined
}

// ---------- placeholders & text ----------

const phOf = (sp) => dig(sp, 'p:nvSpPr', 'p:nvPr', 'p:ph') ?? dig(sp, 'p:nvPicPr', 'p:nvPr', 'p:ph') ?? dig(sp, 'p:nvGraphicFramePr', 'p:nvPr', 'p:ph')

function findPlaceholder(tree, ph) {
  if (!tree || !ph) return null
  const type = ph.getAttribute('type') || 'body'
  const idx = ph.getAttribute('idx')
  const shapes = kids(tree, 'p:sp')
  const norm = (t) => (t === 'ctrTitle' ? 'title' : t === 'subTitle' || t === 'obj' ? 'body' : t)
  return (
    (idx !== null && shapes.find((s) => phOf(s)?.getAttribute('idx') === idx)) ||
    shapes.find((s) => (phOf(s)?.getAttribute('type') || 'body') === type) ||
    shapes.find((s) => norm(phOf(s)?.getAttribute('type') || 'body') === norm(type)) ||
    null
  )
}

function lookup(chain, lvl, pick) {
  for (const lst of chain) {
    if (!lst) continue
    const lvlPr = kid(lst, `a:lvl${lvl + 1}pPr`)
    if (!lvlPr) continue
    const v = pick(lvlPr)
    if (v !== null && v !== undefined) return v
  }
  return null
}

function bulletFor(pPr, chain, lvl) {
  const pick = (el) => {
    if (!el) return null
    if (kid(el, 'a:buNone')) return { kind: 'none' }
    const ch = kid(el, 'a:buChar')
    if (ch) return { kind: 'char', char: ch.getAttribute('char') || '•' }
    const auto = kid(el, 'a:buAutoNum')
    if (auto) return { kind: 'num', type: auto.getAttribute('type') || 'arabicPeriod', start: num(auto, 'startAt', 1) }
    return null
  }
  return pick(pPr) ?? lookup(chain, lvl, pick) ?? { kind: 'none' }
}

function roman(n) {
  const map = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']]
  let out = ''
  for (const [v, s] of map) while (n >= v) (out += s), (n -= v)
  return out
}

function numberLabel(type, n) {
  const alpha = String.fromCharCode(96 + (((n - 1) % 26) + 1))
  const base = type.startsWith('alphaLc') ? alpha : type.startsWith('alphaUc') ? alpha.toUpperCase() : type.startsWith('romanLc') ? roman(n) : type.startsWith('romanUc') ? roman(n).toUpperCase() : String(n)
  return type.endsWith('ParenR') ? `${base})` : type.endsWith('ParenBoth') ? `(${base})` : type.endsWith('Plain') ? base : `${base}.`
}

// Single quotes only: these values end up inside style="…" attributes.
function fontFamily(face, theme) {
  const f = (face === '+mj-lt' ? theme.majorFont : face === '+mn-lt' ? theme.minorFont : face)?.replace(/['"\\<>;]/g, '')
  return [f && `'${f}'`, 'Calibri', 'Carlito', `'Segoe UI'`, 'Arial', 'sans-serif'].filter(Boolean).join(',')
}

function renderTextBody(txBody, ctx) {
  const { theme, chain, fontScale, fontColor } = ctx
  const counters = []
  const paras = []
  for (const p of kids(txBody, 'a:p')) {
    const pPr = kid(p, 'a:pPr')
    const lvl = num(pPr, 'lvl', 0)
    const algn = pPr?.getAttribute('algn') ?? lookup(chain, lvl, (l) => l.getAttribute('algn')) ?? 'l'
    const marL = num(pPr, 'marL') ?? lookup(chain, lvl, (l) => num(l, 'marL')) ?? 0
    const indent = num(pPr, 'indent') ?? lookup(chain, lvl, (l) => num(l, 'indent')) ?? 0
    const spcPct = num(dig(pPr, 'a:lnSpc', 'a:spcPct'), 'val') ?? lookup(chain, lvl, (l) => num(dig(l, 'a:lnSpc', 'a:spcPct'), 'val'))
    const spcBef = num(dig(pPr, 'a:spcBef', 'a:spcPts'), 'val') ?? lookup(chain, lvl, (l) => num(dig(l, 'a:spcBef', 'a:spcPts'), 'val')) ?? 0
    const defRPr = (key) => lookup(chain, lvl, (l) => kid(l, 'a:defRPr')?.getAttribute(key) || null)
    const defColor = lookup(chain, lvl, (l) => colorOf(dig(l, 'a:defRPr', 'a:solidFill'), theme))
    const defFace = lookup(chain, lvl, (l) => dig(l, 'a:defRPr', 'a:latin')?.getAttribute('typeface') || null)

    const runs = []
    let firstSize = null
    for (const r of children(p)) {
      if (r.localName === 'br') {
        runs.push('<br>')
        continue
      }
      if (r.localName !== 'r' && r.localName !== 'fld') continue
      const rPr = kid(r, 'a:rPr')
      const text = dig(r, 'a:t')?.textContent ?? ''
      const size = ((num(rPr, 'sz') ?? Number(defRPr('sz') ?? 1800)) / 100) * fontScale
      firstSize ??= size
      const bold = (rPr?.getAttribute('b') ?? defRPr('b')) === '1'
      const italic = (rPr?.getAttribute('i') ?? defRPr('i')) === '1'
      const u = rPr?.getAttribute('u') ?? defRPr('u')
      const color = colorOf(kid(rPr, 'a:solidFill'), theme) ?? fontColor ?? defColor ?? '#000'
      const face = kid(rPr, 'a:latin')?.getAttribute('typeface') ?? defFace
      const style = [
        `font-size:${size.toFixed(1)}pt`,
        `color:${color}`,
        `font-family:${fontFamily(face, theme)}`,
        bold && 'font-weight:700',
        italic && 'font-style:italic',
        u && u !== 'none' && 'text-decoration:underline',
      ].filter(Boolean)
      runs.push(`<span style="${style.join(';')}">${esc(text)}</span>`)
    }

    const endSize = ((num(kid(p, 'a:endParaRPr'), 'sz') ?? Number(defRPr('sz') ?? 1800)) / 100) * fontScale
    const hasText = runs.some((r) => r !== '<br>')
    let bullet = ''
    if (hasText) {
      const bu = bulletFor(pPr, chain, lvl)
      if (bu.kind === 'num') {
        counters[lvl] = (counters[lvl] ?? bu.start - 1) + 1
        counters.length = lvl + 1
        bullet = numberLabel(bu.type, counters[lvl])
      } else {
        counters.length = lvl
        if (bu.kind === 'char') bullet = bu.char
      }
    } else counters.length = 0

    const size = firstSize ?? endSize
    const lineHeight = spcPct ? (spcPct / 100000) * 1.2 : 1.2
    const style = [
      `text-align:${{ ctr: 'center', r: 'right', just: 'justify', dist: 'justify' }[algn] ?? 'left'}`,
      `padding-left:${pt(marL)}`,
      `line-height:${lineHeight.toFixed(2)}`,
      `font-size:${size.toFixed(1)}pt`,
      spcBef && `margin-top:${(spcBef / 100).toFixed(1)}pt`,
    ].filter(Boolean)
    const hang = indent < 0 ? `width:${pt(-indent)};margin-left:${pt(indent)}` : 'margin-right:0.4em'
    const bulletHtml = bullet ? `<span class="bu" style="${hang}">${esc(bullet)}</span>` : ''
    paras.push(`<p style="${style.join(';')}">${bulletHtml}${hasText ? runs.join('') : '&nbsp;'}</p>`)
  }
  return paras.join('')
}

// ---------- geometry ----------

function xfrmOf(el) {
  const x = dig(pchild(el, 'spPr'), 'a:xfrm') ?? dig(pchild(el, 'grpSpPr'), 'a:xfrm') ?? pchild(el, 'xfrm')
  if (!x) return null
  const off = kid(x, 'a:off')
  const ext = kid(x, 'a:ext')
  if (!off || !ext) return null
  return {
    x: num(off, 'x', 0),
    y: num(off, 'y', 0),
    w: num(ext, 'cx', 0),
    h: num(ext, 'cy', 0),
    rot: num(x, 'rot', 0) / 60000,
    flipH: x.getAttribute('flipH') === '1',
    flipV: x.getAttribute('flipV') === '1',
    chOff: kid(x, 'a:chOff'),
    chExt: kid(x, 'a:chExt'),
  }
}

function boxStyle(b, map) {
  const [x, y] = map(b.x, b.y)
  const [x2, y2] = map(b.x + b.w, b.y + b.h)
  const t = []
  if (b.rot) t.push(`rotate(${b.rot}deg)`)
  if (b.flipH) t.push('scaleX(-1)')
  if (b.flipV) t.push('scaleY(-1)')
  return `left:${pt(x)};top:${pt(y)};width:${pt(x2 - x)};height:${pt(y2 - y)}${t.length ? `;transform:${t.join(' ')}` : ''}`
}

// ---------- shapes ----------

async function renderShape(sp, ctx, map) {
  const { theme, pres, rels, layoutTree, masterTree, txStyles, defaultTextStyle } = ctx
  const ph = phOf(sp)
  const layoutPh = ph ? findPlaceholder(layoutTree, ph) : null
  const masterPh = ph ? findPlaceholder(masterTree, ph) : null
  const box = xfrmOf(sp) ?? (layoutPh && xfrmOf(layoutPh)) ?? (masterPh && xfrmOf(masterPh))
  if (!box) return ''

  const spPr = pchild(sp, 'spPr')
  const styleEl = pchild(sp, 'style')
  let background = await fillCss(spPr, theme, pres, rels)
  if (background === undefined && styleEl && num(kid(styleEl, 'a:fillRef'), 'idx', 0) > 0) background = colorOf(kid(styleEl, 'a:fillRef'), theme) ?? undefined
  const ln = kid(spPr, 'a:ln')
  let border = ''
  if (ln && !kid(ln, 'a:noFill')) {
    const c = colorOf(kid(ln, 'a:solidFill'), theme) ?? (styleEl && colorOf(kid(styleEl, 'a:lnRef'), theme))
    if (c) border = `border:${Math.max(0.5, num(ln, 'w', 12700) / EMU_PT).toFixed(2)}pt solid ${c}`
  } else if (!ln && styleEl && num(kid(styleEl, 'a:lnRef'), 'idx', 0) > 0) {
    const c = colorOf(kid(styleEl, 'a:lnRef'), theme)
    if (c) border = `border:0.75pt solid ${c}`
  }
  const prst = dig(spPr, 'a:prstGeom')?.getAttribute('prst') ?? 'rect'
  const radius =
    prst === 'ellipse' || prst === 'flowChartConnector'
      ? 'border-radius:50%'
      : prst === 'roundRect' || prst === 'flowChartAlternateProcess'
        ? `border-radius:${pt(Math.min(box.w, box.h) * 0.1667)}`
        : ''

  let inner = ''
  const txBody = pchild(sp, 'txBody')
  if (txBody && kids(txBody, 'a:p').some((p) => dig(p, 'a:r') || dig(p, 'a:fld'))) {
    const type = ph?.getAttribute('type') || (ph ? 'body' : null)
    const master = type === 'title' || type === 'ctrTitle' ? kid(txStyles, 'p:titleStyle') : type ? kid(txStyles, 'p:bodyStyle') : kid(txStyles, 'p:otherStyle')
    const chain = [kid(txBody, 'a:lstStyle'), dig(pchild(layoutPh, 'txBody'), 'a:lstStyle'), dig(pchild(masterPh, 'txBody'), 'a:lstStyle'), master, defaultTextStyle]
    const bodyPr = kid(txBody, 'a:bodyPr')
    const bodyPrs = [bodyPr, dig(pchild(layoutPh, 'txBody'), 'a:bodyPr'), dig(pchild(masterPh, 'txBody'), 'a:bodyPr')]
    const bp = (name, fallback) => {
      for (const b of bodyPrs) if (b?.getAttribute(name)) return b.getAttribute(name)
      return fallback
    }
    const autofit = dig(bodyPr, 'a:normAutofit')
    const fontScale = num(autofit, 'fontScale', 100000) / 100000
    const anchor = { t: 'flex-start', ctr: 'center', b: 'flex-end' }[bp('anchor', 't')] ?? 'flex-start'
    const pad = ['tIns', 'rIns', 'bIns', 'lIns'].map((k, i) => pt(bp(k, i % 2 ? 91440 : 45720))).join(' ')
    const fontColor = styleEl ? colorOf(kid(styleEl, 'a:fontRef'), theme) : null
    const wrap = bp('wrap', 'square') === 'none' ? ';white-space:nowrap' : ''
    inner = `<div class="tx" style="justify-content:${anchor};padding:${pad}${wrap}">${renderTextBody(txBody, { theme, chain, fontScale, fontColor })}</div>`
  }
  const style = [boxStyle(box, map), background && background !== 'transparent' && `background:${background}`, border, radius].filter(Boolean)
  return `<div class="shape" style="${style.join(';')}">${inner}</div>`
}

async function renderPicture(pic, ctx, map) {
  const { pres, rels, layoutTree, masterTree } = ctx
  const ph = phOf(pic)
  const box = xfrmOf(pic) ?? (ph && xfrmOf(findPlaceholder(layoutTree, ph) ?? findPlaceholder(masterTree, ph) ?? pic))
  if (!box) return ''
  const blip = dig(pchild(pic, 'blipFill'), 'a:blip')
  const rel = blip && rels.get(blip.getAttributeNS(NS.r, 'embed'))
  const uri = rel && !rel.external ? await pres.dataUri(rel.target) : null
  if (!uri) return ''
  const src = dig(pchild(pic, 'blipFill'), 'a:srcRect')
  let img = `<img src="${uri}" style="width:100%;height:100%;object-fit:fill">`
  if (src) {
    const [l, t, r, b] = ['l', 't', 'r', 'b'].map((k) => num(src, k, 0) / 100000)
    const w = 100 / Math.max(0.01, 1 - l - r)
    const h = 100 / Math.max(0.01, 1 - t - b)
    img = `<img src="${uri}" style="position:absolute;width:${w}%;height:${h}%;left:${-l * w}%;top:${-t * h}%">`
  }
  return `<div class="shape pic" style="${boxStyle(box, map)}">${img}</div>`
}

function renderConnector(cxn, ctx, map) {
  const box = xfrmOf(cxn)
  if (!box) return ''
  const ln = dig(pchild(cxn, 'spPr'), 'a:ln')
  const styleEl = pchild(cxn, 'style')
  const color = colorOf(kid(ln, 'a:solidFill'), ctx.theme) ?? (styleEl && colorOf(kid(styleEl, 'a:lnRef'), ctx.theme)) ?? '#444'
  const width = Math.max(0.5, num(ln, 'w', 12700) / EMU_PT)
  const [x1, y1] = map(box.x, box.y)
  const [x2, y2] = map(box.x + box.w, box.y + box.h)
  const w = Math.max((x2 - x1) / EMU_PT, 0.1)
  const h = Math.max((y2 - y1) / EMU_PT, 0.1)
  const [ax, bx] = box.flipH ? [w, 0] : [0, w]
  const [ay, by] = box.flipV ? [h, 0] : [0, h]
  return `<svg class="shape" style="left:${pt(x1)};top:${pt(y1)};width:${w}pt;height:${h}pt;overflow:visible" viewBox="0 0 ${w} ${h}"><line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="${color}" stroke-width="${width}"/></svg>`
}

function renderTable(frame, ctx, map) {
  const box = xfrmOf(frame)
  const tbl = dig(frame, 'a:graphic', 'a:graphicData', 'a:tbl')
  if (!box || !tbl) return ''
  const cols = kids(dig(tbl, 'a:tblGrid'), 'a:gridCol').map((c) => num(c, 'w', 0))
  const rows = kids(tbl, 'a:tr')
    .map((tr) => {
      const cells = kids(tr, 'a:tc')
        .filter((tc) => tc.getAttribute('hMerge') !== '1' && tc.getAttribute('vMerge') !== '1')
        .map((tc) => {
          const span = num(tc, 'gridSpan', 1)
          const rowSpan = num(tc, 'rowSpan', 1)
          const fill = colorOf(dig(tc, 'a:tcPr', 'a:solidFill'), ctx.theme)
          const body = kid(tc, 'a:txBody')
          const content = body ? renderTextBody(body, { theme: ctx.theme, chain: [ctx.defaultTextStyle], fontScale: 1, fontColor: null }) : ''
          return `<td${span > 1 ? ` colspan="${span}"` : ''}${rowSpan > 1 ? ` rowspan="${rowSpan}"` : ''}${fill ? ` style="background:${fill}"` : ''}>${content}</td>`
        })
      return `<tr style="height:${pt(num(tr, 'h', 0))}">${cells.join('')}</tr>`
    })
    .join('')
  const colgroup = `<colgroup>${cols.map((w) => `<col style="width:${pt(w)}">`).join('')}</colgroup>`
  return `<div class="shape" style="${boxStyle(box, map)};height:auto"><table class="ptbl">${colgroup}${rows}</table></div>`
}

// ---------- charts ----------

const chartText = (el) => (el ? Array.from(el.getElementsByTagNameNS(NS.a, 't')).map((t) => t.textContent).join('') : '')

function cachePoints(ref) {
  const cache =
    dig(ref, 'c:strRef', 'c:strCache') ??
    dig(ref, 'c:numRef', 'c:numCache') ??
    // Multi-level categories: the first level holds the leaf labels.
    dig(ref, 'c:multiLvlStrRef', 'c:multiLvlStrCache', 'c:lvl') ??
    dig(ref, 'c:strLit') ??
    dig(ref, 'c:numLit')
  const out = []
  for (const p of kids(cache, 'c:pt')) out[num(p, 'idx', out.length)] = dig(p, 'c:v')?.textContent ?? ''
  return out
}

function niceScale(min, max, steps = 5) {
  if (min === max) max = min + 1
  const raw = (max - min) / steps
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  const lo = Math.floor(min / step) * step
  const hi = Math.ceil(max / step) * step
  const ticks = []
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Number(v.toFixed(10)))
  return { lo, hi, ticks }
}

const fmt = (v) => (Math.abs(v) >= 1e6 ? `${+(v / 1e6).toFixed(1)}M` : Math.abs(v) >= 1e4 ? `${+(v / 1e3).toFixed(1)}k` : `${+v.toFixed(2)}`)

function renderChart(root, box, map, theme) {
  const chart = dig(root, 'c:chart')
  const plot = dig(chart, 'c:plotArea')
  const typeEl = children(plot).find((n) => /Chart$/.test(n.localName))
  if (!typeEl) return null
  const type = typeEl.localName.replace('3D', '')
  const [x, y] = map(box.x, box.y)
  const [x2, y2] = map(box.x + box.w, box.y + box.h)
  const W = (x2 - x) / EMU_PT
  const H = (y2 - y) / EMU_PT

  const series = kids(typeEl, 'c:ser').map((ser, i) => {
    const color = colorOf(dig(ser, 'c:spPr', 'a:solidFill'), theme) ?? colorOf(dig(ser, 'c:spPr', 'a:ln', 'a:solidFill'), theme) ?? accent(theme, i)
    const vals = cachePoints(kid(ser, 'c:val') ?? kid(ser, 'c:yVal')).map(Number)
    const cats = cachePoints(kid(ser, 'c:cat') ?? kid(ser, 'c:xVal'))
    const name = dig(ser, 'c:tx', 'c:v')?.textContent ?? cachePoints(kid(ser, 'c:tx'))[0] ?? `Series ${i + 1}`
    const points = kids(ser, 'c:dPt').map((d) => [num(dig(d, 'c:idx'), 'val', 0), colorOf(dig(d, 'c:spPr', 'a:solidFill'), theme)])
    return { name, vals, cats, color, pointColors: new Map(points) }
  })
  if (!series.length) return null

  const title = dig(chart, 'c:autoTitleDeleted')?.getAttribute('val') === '1' ? '' : chartText(dig(chart, 'c:title')) || (series.length === 1 && dig(chart, 'c:title') ? series[0].name : '')
  const legendPos = dig(chart, 'c:legend') ? (dig(chart, 'c:legend', 'c:legendPos')?.getAttribute('val') ?? 'r') : null
  const cats = series[0].cats.length ? series[0].cats : series[0].vals.map((_, i) => String(i + 1))
  const out = []
  const font = `font-family="Calibri,Arial,sans-serif" fill="#595959"`
  let top = 8
  if (title) {
    out.push(`<text x="${W / 2}" y="${top + 13}" text-anchor="middle" font-size="13" ${font}>${esc(title)}</text>`)
    top += 24
  }

  const pie = type === 'pieChart' || type === 'doughnutChart'
  const legendItems = pie ? cats.map((c, i) => [c, series[0].pointColors.get(i) ?? accent(theme, i)]) : series.map((s) => [s.name, s.color])
  let right = W - 8
  let bottom = H - 8
  if (legendPos) {
    if (legendPos === 'b' || legendPos === 't') {
      const ly = legendPos === 'b' ? H - 12 : top + 4
      let lx = 8
      legendItems.forEach(([label, color]) => {
        out.push(`<rect x="${lx}" y="${ly - 7}" width="8" height="8" fill="${color}"/><text x="${lx + 11}" y="${ly}" font-size="9" ${font}>${esc(label)}</text>`)
        lx += 20 + String(label).length * 5
      })
      if (legendPos === 'b') bottom -= 18
      else top += 18
    } else {
      const lw = Math.min(W * 0.35, 18 + Math.max(...legendItems.map(([l]) => String(l).length)) * 5)
      right -= lw
      legendItems.forEach(([label, color], i) => {
        const ly = top + 14 + i * 14
        out.push(`<rect x="${right + 8}" y="${ly - 7}" width="8" height="8" fill="${color}"/><text x="${right + 19}" y="${ly}" font-size="9" ${font}>${esc(label)}</text>`)
      })
    }
  }

  if (pie) {
    const vals = series[0].vals.map((v) => Math.max(0, v || 0))
    const total = vals.reduce((a, b) => a + b, 0) || 1
    const cx = (8 + right) / 2
    const cy = (top + bottom) / 2
    const r = Math.max(10, Math.min(right - 8, bottom - top) / 2 - 4)
    const hole = type === 'doughnutChart' ? (num(dig(typeEl, 'c:holeSize'), 'val', 50) / 100) * r : 0
    let a0 = -Math.PI / 2
    vals.forEach((v, i) => {
      const a1 = a0 + (v / total) * Math.PI * 2
      const large = a1 - a0 > Math.PI ? 1 : 0
      const p = (a, rr) => `${(cx + rr * Math.cos(a)).toFixed(2)} ${(cy + rr * Math.sin(a)).toFixed(2)}`
      const color = series[0].pointColors.get(i) ?? accent(theme, i)
      const d = hole
        ? `M${p(a0, r)} A${r} ${r} 0 ${large} 1 ${p(a1, r)} L${p(a1, hole)} A${hole} ${hole} 0 ${large} 0 ${p(a0, hole)} Z`
        : `M${cx} ${cy} L${p(a0, r)} A${r} ${r} 0 ${large} 1 ${p(a1, r)} Z`
      if (v > 0) out.push(`<path d="${d}" fill="${color}" stroke="#fff" stroke-width="1"/>`)
      a0 = a1
    })
  } else {
    const horizontal = type === 'barChart' && dig(typeEl, 'c:barDir')?.getAttribute('val') === 'bar'
    const grouping = dig(typeEl, 'c:grouping')?.getAttribute('val') ?? 'clustered'
    const stacked = grouping === 'stacked' || grouping === 'percentStacked'
    const percent = grouping === 'percentStacked'
    const n = cats.length
    const totals = cats.map((_, i) => series.reduce((s, ser) => s + Math.abs(ser.vals[i] || 0), 0) || 1)
    const value = (ser, i) => (percent ? ((ser.vals[i] || 0) / totals[i]) * 100 : ser.vals[i] || 0)
    let lo = 0
    let hi = 0
    cats.forEach((_, i) => {
      if (stacked && (type === 'barChart' || type === 'areaChart')) {
        let pos = 0
        let neg = 0
        series.forEach((s) => (value(s, i) >= 0 ? (pos += value(s, i)) : (neg += value(s, i))))
        hi = Math.max(hi, pos)
        lo = Math.min(lo, neg)
      } else series.forEach((s) => ((hi = Math.max(hi, value(s, i))), (lo = Math.min(lo, value(s, i)))))
    })
    const scale = niceScale(lo, hi)
    const labelW = horizontal ? Math.min(90, 8 + Math.max(...cats.map((c) => String(c).length)) * 4.6) : 34
    const px0 = 8 + labelW
    const py0 = top + 6
    const pw = Math.max(10, right - px0 - 6)
    const ph = Math.max(10, bottom - py0 - (horizontal ? 18 : 18))
    const vpos = (v) => (horizontal ? px0 + ((v - scale.lo) / (scale.hi - scale.lo)) * pw : py0 + ph - ((v - scale.lo) / (scale.hi - scale.lo)) * ph)
    for (const t of scale.ticks) {
      if (horizontal) out.push(`<line x1="${vpos(t)}" y1="${py0}" x2="${vpos(t)}" y2="${py0 + ph}" stroke="#d9d9d9" stroke-width="0.6"/><text x="${vpos(t)}" y="${py0 + ph + 12}" text-anchor="middle" font-size="8" ${font}>${fmt(t)}${percent ? '%' : ''}</text>`)
      else out.push(`<line x1="${px0}" y1="${vpos(t)}" x2="${px0 + pw}" y2="${vpos(t)}" stroke="#d9d9d9" stroke-width="0.6"/><text x="${px0 - 4}" y="${vpos(t) + 3}" text-anchor="end" font-size="8" ${font}>${fmt(t)}${percent ? '%' : ''}</text>`)
    }
    const band = (horizontal ? ph : pw) / Math.max(n, 1)
    cats.forEach((c, i) => {
      const center = (horizontal ? py0 : px0) + band * (i + 0.5)
      const label = esc(String(c).slice(0, 18))
      if (horizontal) out.push(`<text x="${px0 - 4}" y="${center + 3}" text-anchor="end" font-size="8" ${font}>${label}</text>`)
      else if (n <= 24 || i % Math.ceil(n / 24) === 0) out.push(`<text x="${center}" y="${py0 + ph + 12}" text-anchor="middle" font-size="8" ${font}>${label}</text>`)
    })

    if (type === 'barChart') {
      const groupW = band * 0.72
      const barW = stacked ? groupW : groupW / series.length
      cats.forEach((_, i) => {
        let pos = 0
        let neg = 0
        series.forEach((s, k) => {
          const v = value(s, i)
          const base = stacked ? (v >= 0 ? pos : neg) : 0
          const end = base + v
          if (stacked) v >= 0 ? (pos = end) : (neg = end)
          const start = (horizontal ? py0 : px0) + band * i + (band - groupW) / 2 + (stacked ? 0 : k * barW)
          const a = vpos(Math.min(base, end))
          const b = vpos(Math.max(base, end))
          const color = s.pointColors.get(i) ?? s.color
          out.push(
            horizontal
              ? `<rect x="${a.toFixed(2)}" y="${start.toFixed(2)}" width="${Math.max(0, b - a).toFixed(2)}" height="${barW.toFixed(2)}" fill="${color}"/>`
              : `<rect x="${start.toFixed(2)}" y="${b.toFixed(2)}" width="${barW.toFixed(2)}" height="${Math.max(0, a - b).toFixed(2)}" fill="${color}"/>`,
          )
        })
      })
    } else {
      const xs = cats.map((_, i) => px0 + band * (i + 0.5))
      const running = cats.map(() => 0)
      series.forEach((s) => {
        const ys = cats.map((_, i) => {
          const v = value(s, i) + (stacked ? running[i] : 0)
          if (stacked) running[i] = v
          return vpos(v)
        })
        const pts = xs.map((px, i) => `${px.toFixed(2)},${ys[i].toFixed(2)}`)
        if (type === 'areaChart') {
          out.push(`<polygon points="${xs[0].toFixed(2)},${vpos(Math.max(scale.lo, 0)).toFixed(2)} ${pts.join(' ')} ${xs[xs.length - 1].toFixed(2)},${vpos(Math.max(scale.lo, 0)).toFixed(2)}" fill="${s.color}" fill-opacity="0.75"/>`)
        } else {
          const markers = type === 'scatterChart' || kid(typeEl, 'c:marker')?.getAttribute('val') !== '0'
          if (type !== 'scatterChart' || dig(typeEl, 'c:scatterStyle')?.getAttribute('val') !== 'marker') {
            out.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round"/>`)
          }
          if (markers) xs.forEach((px, i) => out.push(`<circle cx="${px.toFixed(2)}" cy="${ys[i].toFixed(2)}" r="2.6" fill="${s.color}"/>`))
        }
      })
    }
    out.push(horizontal ? `<line x1="${vpos(Math.max(scale.lo, 0))}" y1="${py0}" x2="${vpos(Math.max(scale.lo, 0))}" y2="${py0 + ph}" stroke="#a6a6a6" stroke-width="0.8"/>` : `<line x1="${px0}" y1="${vpos(Math.max(scale.lo, 0))}" x2="${px0 + pw}" y2="${vpos(Math.max(scale.lo, 0))}" stroke="#a6a6a6" stroke-width="0.8"/>`)
  }

  return `<svg class="shape" style="left:${(x / EMU_PT).toFixed(2)}pt;top:${(y / EMU_PT).toFixed(2)}pt;width:${W.toFixed(2)}pt;height:${H.toFixed(2)}pt" viewBox="0 0 ${W.toFixed(2)} ${H.toFixed(2)}">${out.join('')}</svg>`
}

// ---------- tree ----------

async function renderGraphicFrame(el, ctx, map) {
  const data = dig(el, 'a:graphic', 'a:graphicData')
  const box = xfrmOf(el)
  if (dig(data, 'a:tbl')) return renderTable(el, ctx, map)
  if (!box) return ''
  try {
    const chartRef = dig(data, 'c:chart')
    if (chartRef) {
      const rel = ctx.rels.get(chartRef.getAttributeNS(NS.r, 'id'))
      const root = rel && (await ctx.pres.xml(rel.target))
      const svg = root && renderChart(root, box, map, ctx.theme)
      if (svg) return svg
    }
    const diagram = dig(data, 'dgm:relIds')
    if (diagram) {
      // SmartArt: PowerPoint saves a ready-made drawing next to the diagram data.
      const dataRel = ctx.rels.get(diagram.getAttributeNS(NS.r, 'dm'))
      const dataRoot = dataRel && (await ctx.pres.xml(dataRel.target))
      const drawingId = dataRoot && Array.from(dataRoot.getElementsByTagNameNS(NS.dsp, 'dataModelExt'))[0]?.getAttribute('relId')
      const drawingRel = drawingId && ctx.rels.get(drawingId)
      const drawing = drawingRel && (await ctx.pres.xml(drawingRel.target))
      const tree = drawing && kid(drawing, 'dsp:spTree')
      if (tree) {
        const shifted = (x, y) => map(box.x + x, box.y + y)
        return renderTree(tree, { ...ctx, rels: await ctx.pres.rels(drawingRel.target) }, shifted)
      }
    }
  } catch (e) {
    console.warn('[pptx] graphic frame:', e.message)
  }
  return `<div class="shape missing" style="${boxStyle(box, map)}"><span>Content not shown</span></div>`
}

async function renderTree(tree, ctx, map, { skipPlaceholders = false } = {}) {
  const out = []
  for (const el of children(tree)) {
    if (skipPlaceholders && phOf(el)) continue
    const name = el.localName
    if (name === 'sp') out.push(await renderShape(el, ctx, map))
    else if (name === 'pic') out.push(await renderPicture(el, ctx, map))
    else if (name === 'cxnSp') out.push(renderConnector(el, ctx, map))
    else if (name === 'graphicFrame') out.push(await renderGraphicFrame(el, ctx, map))
    else if (name === 'grpSp') {
      const g = xfrmOf(el)
      let inner = map
      if (g?.chOff && g?.chExt) {
        const cx = num(g.chOff, 'x', 0)
        const cy = num(g.chOff, 'y', 0)
        const sx = g.w / (num(g.chExt, 'cx', 1) || 1)
        const sy = g.h / (num(g.chExt, 'cy', 1) || 1)
        inner = (x, y) => map(g.x + (x - cx) * sx, g.y + (y - cy) * sy)
      }
      out.push(await renderTree(el, ctx, inner, { skipPlaceholders }))
    }
  }
  return out.join('')
}

async function backgroundOf(parts, theme, pres) {
  for (const { root, rels } of parts) {
    const bg = dig(root, 'p:cSld', 'p:bg')
    if (!bg) continue
    const bgPr = kid(bg, 'p:bgPr')
    if (bgPr) return (await fillCss(bgPr, theme, pres, rels)) ?? '#fff'
    const ref = kid(bg, 'p:bgRef')
    if (ref) return colorOf(ref, theme) ?? '#fff'
  }
  return '#fff'
}

export async function pptxDocument(buffer) {
  let zip
  try {
    zip = await JSZip.loadAsync(buffer)
  } catch {
    throw new HttpError(422, 'This presentation couldn’t be read. It may be damaged or password-protected.')
  }
  const pres = new Pptx(zip)
  const presentation = await pres.xml('ppt/presentation.xml')
  if (!presentation) throw new HttpError(422, 'This file isn’t a PowerPoint presentation.')
  const presRels = await pres.rels('ppt/presentation.xml')
  const sldSz = kid(presentation, 'p:sldSz')
  const W = num(sldSz, 'cx', 12192000)
  const H = num(sldSz, 'cy', 6858000)
  const defaultTextStyle = kid(presentation, 'p:defaultTextStyle')

  const themeCache = new Map()
  const themeFor = async (masterPath) => {
    const rel = [...(await pres.rels(masterPath)).values()].find((r) => r.type.endsWith('/theme'))
    if (!rel) return { colors: {}, majorFont: null, minorFont: null }
    if (!themeCache.has(rel.target)) {
      const root = await pres.xml(rel.target)
      const colors = {}
      const scheme = root?.getElementsByTagNameNS(NS.a, 'clrScheme')[0]
      for (const c of children(scheme)) {
        const v = kid(c, 'a:srgbClr')?.getAttribute('val') ?? kid(c, 'a:sysClr')?.getAttribute('lastClr')
        if (v) colors[c.localName] = v
      }
      const fonts = root?.getElementsByTagNameNS(NS.a, 'fontScheme')[0]
      themeCache.set(rel.target, {
        colors,
        majorFont: dig(fonts, 'a:majorFont', 'a:latin')?.getAttribute('typeface') ?? null,
        minorFont: dig(fonts, 'a:minorFont', 'a:latin')?.getAttribute('typeface') ?? null,
      })
    }
    return themeCache.get(rel.target)
  }

  const slides = []
  for (const id of kids(dig(presentation, 'p:sldIdLst'), 'p:sldId')) {
    const rel = presRels.get(id.getAttributeNS(NS.r, 'id'))
    if (!rel) continue
    const slide = await pres.xml(rel.target)
    if (!slide || slide.getAttribute('show') === '0') continue
    const slideRels = await pres.rels(rel.target)
    const layoutPath = [...slideRels.values()].find((r) => r.type.endsWith('/slideLayout'))?.target
    const layout = layoutPath ? await pres.xml(layoutPath) : null
    const layoutRels = layoutPath ? await pres.rels(layoutPath) : new Map()
    const masterPath = [...layoutRels.values()].find((r) => r.type.endsWith('/slideMaster'))?.target
    const master = masterPath ? await pres.xml(masterPath) : null
    const masterRels = masterPath ? await pres.rels(masterPath) : new Map()
    const theme = masterPath ? await themeFor(masterPath) : { colors: {} }

    const base = {
      theme,
      pres,
      layoutTree: dig(layout, 'p:cSld', 'p:spTree'),
      masterTree: dig(master, 'p:cSld', 'p:spTree'),
      txStyles: kid(master, 'p:txStyles'),
      defaultTextStyle,
    }
    const identity = (x, y) => [x, y]
    const background = await backgroundOf(
      [
        { root: slide, rels: slideRels },
        { root: layout, rels: layoutRels },
        { root: master, rels: masterRels },
      ],
      theme,
      pres,
    )
    let html = ''
    const showMaster = slide.getAttribute('showMasterSp') !== '0'
    if (showMaster && layout?.getAttribute('showMasterSp') !== '0' && base.masterTree) {
      html += await renderTree(base.masterTree, { ...base, rels: masterRels }, identity, { skipPlaceholders: true })
    }
    if (showMaster && base.layoutTree) {
      html += await renderTree(base.layoutTree, { ...base, rels: layoutRels }, identity, { skipPlaceholders: true })
    }
    html += await renderTree(dig(slide, 'p:cSld', 'p:spTree'), { ...base, rels: slideRels }, identity)
    slides.push(`<div class="slide" style="background:${background}">${html}</div>`)
  }
  if (!slides.length) throw new HttpError(422, 'This presentation has no slides to convert.')

  return {
    html: page(
      `@page{size:${pt(W)} ${pt(H)};margin:0}
.slide{position:relative;width:${pt(W)};height:${pt(H)};overflow:hidden;break-after:page}
.slide:last-child{break-after:auto}
.shape{position:absolute}
.pic{overflow:hidden}
.tx{position:absolute;inset:0;display:flex;flex-direction:column;overflow:visible}
.tx p{margin:0;overflow-wrap:break-word}
.bu{display:inline-block}
.missing{border:1pt dashed #b0b0b0;display:flex;align-items:center;justify-content:center;color:#888;font:10pt Arial,sans-serif}
.ptbl{width:100%;border-collapse:collapse;table-layout:fixed}
.ptbl td{border:0.75pt solid #9a9a9a;padding:3pt 5pt;vertical-align:top}`,
      slides.join(''),
    ),
  }
}
