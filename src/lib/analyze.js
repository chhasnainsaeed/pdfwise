import { KINDS, formatBytes, matchesKind } from './files.js'

const KIND_ORDER = ['pdf', 'image', 'word', 'excel', 'powerpoint']

export const kindOf = (file) => KIND_ORDER.find((k) => matchesKind(file, k)) ?? null

const LARGE = 2 * 1024 * 1024

/** Looks at a PDF without changing it: pages, text, encryption. */
async function inspectPdf(file) {
  const { getPdf } = await import('./pdfjs.js')
  try {
    const pdf = await getPdf(file)
    const sample = Math.min(pdf.numPages, 3)
    let chars = 0
    for (let n = 1; n <= sample; n++) {
      const page = await pdf.getPage(n)
      const text = await page.getTextContent()
      chars += text.items.reduce((sum, item) => sum + (item.str?.trim().length ?? 0), 0)
    }
    return { pages: pdf.numPages, scanned: chars / sample < 25, locked: false }
  } catch (e) {
    if (e?.name === 'PasswordException') return { pages: null, scanned: false, locked: true }
    return { pages: null, scanned: false, locked: false, broken: true }
  }
}

/**
 * Works out which tools fit the dropped files and why, best first.
 * Returns { kind, files, facts: [string], picks: [{ id, reason }], skipped }.
 */
export async function analyzeFiles(list) {
  const all = Array.from(list)
  const groups = {}
  for (const f of all) {
    const k = kindOf(f)
    if (k) (groups[k] ??= []).push(f)
  }
  const kind = KIND_ORDER.find((k) => groups[k])
  if (!kind) return { kind: null, files: [], facts: [], picks: [], skipped: all.length }

  const files = groups[kind]
  const skipped = all.length - files.length
  const total = files.reduce((s, f) => s + f.size, 0)
  const many = files.length > 1
  const facts = [`${files.length} ${KINDS[kind].label} file${many ? 's' : ''}`, formatBytes(total)]
  const picks = []
  const add = (id, reason) => {
    if (!picks.some((p) => p.id === id)) picks.push({ id, reason })
  }

  if (kind === 'pdf') {
    const info = await inspectPdf(files[0])
    if (info.pages) facts.push(`${many ? 'first has ' : ''}${info.pages} page${info.pages === 1 ? '' : 's'}`)
    if (info.locked) {
      facts.push('password-protected')
      add('unlock-pdf', 'It’s locked — remove the password first')
    }
    if (info.broken) {
      facts.push('looks damaged')
      add('repair-pdf', 'It didn’t open cleanly — try repairing it')
    }
    if (many) add('merge-pdf', `Join these ${files.length} PDFs into one`)
    if (many) add('pdf-workflows', 'Merge, number, compress and more — in one click')
    if (info.scanned && !info.locked) {
      facts.push('scanned (no text layer)')
      add('ocr-pdf', 'It’s a scan — make the text searchable and copyable')
    }
    if (total > LARGE) add('compress-pdf', `${formatBytes(total)} is heavy for email or upload portals`)
    if (info.pages > 1) {
      add('split-pdf', `Break the ${info.pages} pages into separate files`)
      add('organize-pdf', 'Reorder, rotate or delete pages')
    }
    add('sign-pdf', 'Sign it')
    add('edit-pdf', 'Add text, images or highlights')
    add('compress-pdf', 'Make it smaller')
    add('pdf-to-word', 'Turn it into an editable Word file')
    add('protect-pdf', 'Lock it with a password')
    add('pdf-to-jpg', 'Save the pages as images')
    add('add-page-numbers', 'Number the pages')
    add('add-watermark', 'Stamp a watermark')
  } else if (kind === 'image') {
    add('images-to-pdf', many ? `Put these ${files.length} images into one PDF` : 'Turn this image into a PDF')
    add('pdf-workflows', 'Make one compact PDF from them in a single step')
  } else {
    const id = { word: 'word-to-pdf', excel: 'excel-to-pdf', powerpoint: 'powerpoint-to-pdf' }[kind]
    add(id, `Convert ${many ? 'them' : 'it'} to PDF`)
  }

  return { kind, files, facts, picks: picks.slice(0, 5), skipped }
}

/** First http(s)-looking address in a piece of pasted text. */
export function findUrl(text) {
  const m = /\bhttps?:\/\/[^\s<>"']+/i.exec(text || '') ?? /\b(?:www\.)[a-z0-9-]+(?:\.[a-z0-9-]+)+[^\s<>"']*/i.exec(text || '')
  return m ? m[0] : null
}
