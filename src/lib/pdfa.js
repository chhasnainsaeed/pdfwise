import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFRawStream, PDFString, decodePDFRawStream } from 'pdf-lib'
import { UserError } from './files.js'
import { flattenPage, rebuild } from './flatten.js'
import { srgbProfile } from './icc.js'

const N = (n) => PDFName.of(n)
const PRODUCER = 'PDFwise'
const UNSAFE_ACTIONS = new Set(['JavaScript', 'Launch', 'Sound', 'Movie', 'ResetForm', 'ImportData', 'Hide', 'SetOCGState', 'Rendition', 'Trans', 'GoTo3DView'])

function fontEmbedded(font) {
  const subtype = font.lookup(N('Subtype'))
  if (subtype === N('Type3')) return true
  if (subtype === N('Type0')) {
    const desc = font.lookup(N('DescendantFonts'))
    const child = desc instanceof PDFArray ? desc.lookup(0) : null
    return child instanceof PDFDict ? fontEmbedded(child) : false
  }
  const fd = font.lookup(N('FontDescriptor'))
  return fd instanceof PDFDict && (fd.has(N('FontFile')) || fd.has(N('FontFile2')) || fd.has(N('FontFile3')))
}

const decodedText = (stream) => {
  try {
    const bytes = stream instanceof PDFRawStream ? decodePDFRawStream(stream).decode() : stream.getContents?.()
    return bytes ? new TextDecoder('latin1').decode(bytes) : ''
  } catch {
    return ''
  }
}

/** Scans a resource dictionary (and nested forms) for problems PDF/A-2b doesn't allow. */
function scanResources(res, issues, seen = new Set()) {
  if (!(res instanceof PDFDict)) return
  const fonts = res.lookup(N('Font'))
  if (fonts instanceof PDFDict) {
    for (const [, v] of fonts.entries()) {
      const f = res.context.lookup(v)
      if (f instanceof PDFDict && !fontEmbedded(f)) issues.add('font')
    }
  }
  const spaces = res.lookup(N('ColorSpace'))
  if (spaces instanceof PDFDict) {
    for (const [, v] of spaces.entries()) {
      const cs = res.context.lookup(v)
      if (cs === N('DeviceCMYK') || (cs instanceof PDFArray && cs.toString().includes('/DeviceCMYK'))) issues.add('cmyk')
    }
  }
  const xobjects = res.lookup(N('XObject'))
  if (xobjects instanceof PDFDict) {
    for (const [, v] of xobjects.entries()) {
      const key = v.toString()
      if (seen.has(key)) continue
      seen.add(key)
      const x = res.context.lookup(v)
      if (!x?.dict) continue
      const subtype = x.dict.lookup(N('Subtype'))
      if (subtype === N('Image') && x.dict.lookup(N('ColorSpace')) === N('DeviceCMYK')) issues.add('cmyk')
      if (subtype === N('Form')) {
        if (/(?:-?[\d.]+\s+){4}[kK]\b/.test(decodedText(x))) issues.add('cmyk')
        scanResources(x.dict.lookup(N('Resources')), issues, seen)
      }
    }
  }
}

function pageIssues(page) {
  const issues = new Set()
  scanResources(page.node.Resources(), issues)
  const contents = page.node.Contents()
  const streams = contents instanceof PDFArray ? contents.asArray().map((r) => page.doc.context.lookup(r)) : contents ? [contents] : []
  if (streams.some((s) => /(?:-?[\d.]+\s+){4}[kK]\b/.test(decodedText(s)))) issues.add('cmyk')
  return issues
}

function cleanAnnotations(doc) {
  let removed = 0
  for (const page of doc.getPages()) {
    page.node.delete(N('AA'))
    const annots = page.node.Annots()
    if (!annots) continue
    const keep = []
    for (const ref of annots.asArray()) {
      const a = doc.context.lookup(ref)
      if (!(a instanceof PDFDict)) continue
      const subtype = a.lookup(N('Subtype'))
      const hasAppearance = a.lookup(N('AP')) instanceof PDFDict
      if (subtype !== N('Link') && subtype !== N('Popup') && !hasAppearance) {
        removed++
        continue
      }
      const action = a.lookup(N('A'))
      if (action instanceof PDFDict && UNSAFE_ACTIONS.has(action.lookup(N('S'))?.decodeText?.())) a.delete(N('A'))
      a.delete(N('AA'))
      // Printable, not hidden.
      const flags = a.lookup(N('F'))
      const f = flags instanceof PDFNumber ? flags.asNumber() : 0
      a.set(N('F'), PDFNumber.of((f | 4) & ~(1 | 2 | 32)))
      keep.push(ref)
    }
    page.node.set(N('Annots'), doc.context.obj(keep))
  }
  return removed
}

const xmlEscape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const isoDate = (d) => d.toISOString().replace(/\.\d{3}Z$/, 'Z')

function xmpPacket({ title, author, created, modified }) {
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:dc="http://purl.org/dc/elements/1.1/"
    xmlns:xmp="http://ns.adobe.com/xap/1.0/"
    xmlns:pdf="http://ns.adobe.com/pdf/1.3/"
    xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
   <dc:format>application/pdf</dc:format>
   <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${xmlEscape(title)}</rdf:li></rdf:Alt></dc:title>
${author ? `   <dc:creator><rdf:Seq><rdf:li>${xmlEscape(author)}</rdf:li></rdf:Seq></dc:creator>\n` : ''}   <xmp:CreateDate>${isoDate(created)}</xmp:CreateDate>
   <xmp:ModifyDate>${isoDate(modified)}</xmp:ModifyDate>
   <xmp:MetadataDate>${isoDate(modified)}</xmp:MetadataDate>
   <xmp:CreatorTool>${PRODUCER}</xmp:CreatorTool>
   <pdf:Producer>${PRODUCER}</pdf:Producer>
   <pdfaid:part>2</pdfaid:part>
   <pdfaid:conformance>B</pdfaid:conformance>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`
}

/**
 * Converts to PDF/A-2b. Pages using fonts that aren't embedded or CMYK color (which an sRGB
 * output intent can't cover) are flattened to images when `flatten` is on. Returns the bytes
 * and a list of what was checked and changed.
 */
export async function convertToPdfA(file, { flatten = true } = {}, progress) {
  let src
  try {
    src = await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false })
  } catch (e) {
    if (/encrypt/i.test(String(e?.message))) throw new UserError('This PDF is encrypted. Unlock it first — PDF/A files can’t be encrypted.')
    throw e
  }
  const report = []
  const title = src.getTitle() || file.name.replace(/\.pdf$/i, '')
  const author = src.getAuthor()
  const created = new Date(Math.floor((src.getCreationDate()?.getTime() ?? Date.now()) / 1000) * 1000)

  const problems = src.getPages().map((p, i) => ({ page: i + 1, issues: pageIssues(p) })).filter((p) => p.issues.size)
  const fontPages = problems.filter((p) => p.issues.has('font')).length
  const cmykPages = problems.filter((p) => p.issues.has('cmyk')).length
  if (problems.length && flatten) {
    for (let i = 0; i < problems.length; i++) {
      await flattenPage(file, src, problems[i].page, { dpi: 200 })
      progress?.(i + 1, problems.length + 1)
    }
    report.push(`${problems.length} page${problems.length === 1 ? '' : 's'} with ${[fontPages && 'non-embedded fonts', cmykPages && 'CMYK color'].filter(Boolean).join(' or ')} converted to images.`)
  } else if (problems.length) {
    report.push(`Warning: ${problems.length} page${problems.length === 1 ? '' : 's'} still use ${[fontPages && 'non-embedded fonts', cmykPages && 'CMYK color'].filter(Boolean).join(' and ')}, so the file won’t fully comply.`)
  } else {
    report.push('All fonts are embedded and colors are RGB/gray.')
  }

  // A fresh document leaves behind JavaScript, attachments, open actions and unused objects.
  const doc = await rebuild(src)
  const removedAnnots = cleanAnnotations(doc)
  if (removedAnnots) report.push(`${removedAnnots} annotation${removedAnnots === 1 ? '' : 's'} without an appearance removed.`)
  report.push('Scripts, attachments and unsafe actions removed.')

  const ctx = doc.context
  const modified = new Date(Math.floor(Date.now() / 1000) * 1000)
  doc.setTitle(title)
  if (author) doc.setAuthor(author)
  doc.setProducer(PRODUCER)
  doc.setCreator(PRODUCER)
  doc.setCreationDate(created)
  doc.setModificationDate(modified)

  const metadata = ctx.register(ctx.stream(new TextEncoder().encode(xmpPacket({ title, author, created, modified })), { Type: 'Metadata', Subtype: 'XML' }))
  doc.catalog.set(N('Metadata'), metadata)
  const profile = ctx.register(ctx.flateStream(srgbProfile(), { N: 3 }))
  const intent = ctx.obj({
    Type: 'OutputIntent',
    S: 'GTS_PDFA1',
    OutputConditionIdentifier: PDFString.of('sRGB IEC61966-2.1'),
    RegistryName: PDFString.of('http://www.color.org'),
    Info: PDFString.of('sRGB IEC61966-2.1'),
    DestOutputProfile: profile,
  })
  doc.catalog.set(N('OutputIntents'), ctx.obj([intent]))
  const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')
  ctx.trailerInfo.ID = ctx.obj([PDFHexString.of(id), PDFHexString.of(id)])
  report.push('sRGB output intent, PDF/A-2b XMP metadata and document ID added.')

  progress?.(problems.length + 1, problems.length + 1)
  return { bytes: await doc.save({ useObjectStreams: true }), report }
}
