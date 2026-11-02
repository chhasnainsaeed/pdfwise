import JSZip from 'jszip'

/** An error whose message is safe to show to the user as-is. */
export class UserError extends Error {}

let counter = 0
export const uid = () => `${Date.now().toString(36)}${(counter++).toString(36)}`

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export const range = (n) => Array.from({ length: n }, (_, i) => i)

export const baseName = (name) => name.replace(/\.[^.]+$/, '') || 'document'

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes
  let i = -1
  do {
    value /= 1024
    i++
  } while (value >= 1024 && i < units.length - 1)
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`
}

/** File types a tool can accept: extensions, MIME types, and wording for the UI. */
export const KINDS = {
  pdf: { label: 'PDF', noun: 'PDF files', exts: ['pdf'], mimes: ['application/pdf'] },
  image: {
    label: 'image',
    noun: 'JPG, PNG, WebP, GIF or BMP images',
    exts: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'],
    mimes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp'],
  },
  word: { label: 'Word', noun: 'Word documents (DOC, DOCX, ODT, RTF, TXT)', exts: ['doc', 'docx', 'odt', 'rtf', 'txt'], mimes: [] },
  excel: { label: 'Excel', noun: 'spreadsheets (XLS, XLSX, ODS, CSV)', exts: ['xls', 'xlsx', 'ods', 'csv'], mimes: [] },
  powerpoint: { label: 'PowerPoint', noun: 'presentations (PPT, PPTX, ODP)', exts: ['ppt', 'pptx', 'odp'], mimes: [] },
}

export const acceptFor = (kind) => [...KINDS[kind].mimes, ...KINDS[kind].exts.map((e) => `.${e}`)].join(',')

export const extOf = (name) => (/\.([^.]+)$/.exec(name)?.[1] ?? '').toLowerCase()

export function matchesKind(file, kind) {
  const k = KINDS[kind]
  return Boolean(k) && (k.exts.includes(extOf(file.name)) || k.mimes.includes(file.type))
}

export const canvasToBlob = (canvas, type, quality) =>
  new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode image'))), type, quality),
  )

function uniqueName(name, used) {
  let candidate = name
  let n = 2
  while (used.has(candidate)) {
    const dot = name.lastIndexOf('.')
    candidate = dot > 0 ? `${name.slice(0, dot)} (${n})${name.slice(dot)}` : `${name} (${n})`
    n++
  }
  used.add(candidate)
  return candidate
}

/**
 * Turns a tool's output ({ files: [{ name, data, type }], zipName }) into a single
 * downloadable blob — the file itself when there is one, otherwise a ZIP.
 */
export async function packResult({ files, zipName = 'files.zip' }) {
  if (!files.length) throw new UserError('Nothing was produced. Check your options and try again.')
  if (files.length === 1) {
    const f = files[0]
    const blob = f.data instanceof Blob ? f.data : new Blob([f.data], { type: f.type })
    return { blob, name: f.name, type: f.type, count: 1 }
  }
  const zip = new JSZip()
  const used = new Set()
  for (const f of files) zip.file(uniqueName(f.name, used), f.data)
  const blob = await zip.generateAsync({ type: 'blob' })
  return { blob, name: zipName, type: 'application/zip', count: files.length }
}

export function friendlyError(e) {
  if (e instanceof UserError) return e.message
  const msg = String(e?.message || e)
  if (e?.name === 'PasswordException' || /encrypt|password/i.test(msg)) {
    return 'This PDF is password-protected. Remove the password, then try again.'
  }
  if (/WinAnsi cannot encode/i.test(msg)) {
    return 'Your text contains characters the built-in PDF fonts can’t display. Stick to basic Latin letters, numbers and punctuation.'
  }
  if (/invalid pdf|failed to parse|no pdf header|PDF header/i.test(msg)) {
    return 'One of your files couldn’t be read as a PDF. It may be damaged.'
  }
  return `Something went wrong: ${msg}`
}

export const PDF_TYPE = 'application/pdf'
