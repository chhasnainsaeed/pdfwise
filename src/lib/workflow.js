// Workflows: a list of steps run one after another on a batch of files, entirely in the browser.
// Each step reuses the same library code as the matching single tool. Steps that work file by
// file run on every file; Merge and "Images to PDF" combine everything into one file.

import { PDF_TYPE, UserError, baseName, formatBytes, matchesKind } from './files.js'

const SIZE_OPTIONS = [
  { value: 102400, label: '100 KB' },
  { value: 204800, label: '200 KB' },
  { value: 512000, label: '500 KB' },
  { value: 1048576, label: '1 MB' },
  { value: 2097152, label: '2 MB' },
  { value: 5242880, label: '5 MB' },
]

const asPdf = (name, data) => new File([data], name, { type: PDF_TYPE })

/**
 * Step types. `input`/`output` are 'pdf' or 'image'. `combine` steps turn the whole batch
 * into one file. `last` steps must end the workflow (encrypted or non-PDF output).
 * Fields drive the options form; `secret` fields are never saved or shared.
 */
export const STEP_TYPES = {
  'images-to-pdf': {
    label: 'Images to PDF',
    tool: 'images-to-pdf',
    input: 'image',
    output: 'pdf',
    combine: true,
    summary: (o) => `${o.size === 'fit' ? 'Page fits each image' : o.size.toUpperCase()} pages, all images in one PDF`,
    fields: [{ key: 'size', label: 'Page size', type: 'select', options: [{ value: 'a4', label: 'A4' }, { value: 'letter', label: 'Letter' }, { value: 'fit', label: 'Fit image' }] }],
    defaults: { size: 'a4' },
    async run(files, o, progress) {
      const { imagesToPdf } = await import('./convert.js')
      const data = await imagesToPdf(files, { size: o.size, orientation: 'auto', margin: 'small' }, progress)
      return [asPdf(`${baseName(files[0].name)}.pdf`, data)]
    },
  },
  repair: {
    label: 'Repair',
    tool: 'repair-pdf',
    input: 'pdf',
    output: 'pdf',
    summary: () => 'Rebuild damaged files',
    fields: [],
    defaults: {},
    async each(file) {
      const { repairPdf } = await import('./qpdf.js')
      return asPdf(file.name, (await repairPdf(file)).bytes)
    },
  },
  unlock: {
    label: 'Unlock',
    tool: 'unlock-pdf',
    input: 'pdf',
    output: 'pdf',
    summary: (o) => (o.password ? 'Remove password' : 'Remove restrictions'),
    fields: [{ key: 'password', label: 'Password (if the files need one)', type: 'password', secret: true }],
    defaults: { password: '' },
    async each(file, o) {
      const { unlockPdf } = await import('./qpdf.js')
      return asPdf(file.name, await unlockPdf(file, o.password))
    },
  },
  merge: {
    label: 'Merge',
    tool: 'merge-pdf',
    input: 'pdf',
    output: 'pdf',
    combine: true,
    summary: (o) => `Join everything into “${o.name || 'merged'}.pdf”`,
    fields: [{ key: 'name', label: 'File name', type: 'text', placeholder: 'merged' }],
    defaults: { name: 'merged' },
    async run(files, o, progress) {
      const { mergePdfs } = await import('./ops.js')
      const name = (o.name || 'merged').replace(/[\\/:*?"<>|]+/g, '-').replace(/\.pdf$/i, '')
      return [asPdf(`${name}.pdf`, await mergePdfs(files, progress))]
    },
  },
  pages: {
    label: 'Keep or remove pages',
    tool: 'remove-pages',
    input: 'pdf',
    output: 'pdf',
    summary: (o) => `${o.action === 'keep' ? 'Keep' : 'Remove'} pages ${o.pages || '…'}`,
    fields: [
      { key: 'action', label: 'Action', type: 'select', options: [{ value: 'remove', label: 'Remove these pages' }, { value: 'keep', label: 'Keep only these pages' }] },
      { key: 'pages', label: 'Pages', type: 'text', placeholder: 'e.g. 1, 3-5, 9-' },
    ],
    defaults: { action: 'remove', pages: '1' },
    validate: (o) => (o.pages.trim() ? null : 'type the pages, like “1, 3-5”'),
    async each(file, o) {
      const [{ loadPdf, buildFromPages }, { parsePageList }] = await Promise.all([import('./ops.js'), import('./ranges.js')])
      const count = (await loadPdf(file)).getPageCount()
      const parsed = parsePageList(o.pages, count)
      if (parsed.error) throw new UserError(`“${file.name}”: ${parsed.error}`)
      const chosen = new Set(parsed.pages)
      const keep = [...Array(count).keys()].filter((i) => (o.action === 'keep' ? chosen.has(i) : !chosen.has(i)))
      if (!keep.length) throw new UserError(`That would leave “${file.name}” with no pages.`)
      return asPdf(file.name, await buildFromPages(keep.map((index) => ({ file, index }))))
    },
  },
  rotate: {
    label: 'Rotate',
    tool: 'rotate-pdf',
    input: 'pdf',
    output: 'pdf',
    summary: (o) => `Turn every page ${o.deg === 180 ? 'upside down' : o.deg === 90 ? '90° right' : '90° left'}`,
    fields: [{ key: 'deg', label: 'Rotation', type: 'select', number: true, options: [{ value: 90, label: '90° right' }, { value: 180, label: '180°' }, { value: 270, label: '90° left' }] }],
    defaults: { deg: 90 },
    async each(file, o) {
      const { rotateAll } = await import('./ops.js')
      return asPdf(file.name, await rotateAll(file, o.deg))
    },
  },
  ocr: {
    label: 'OCR (searchable text)',
    tool: 'ocr-pdf',
    input: 'pdf',
    output: 'pdf',
    summary: (o) => `Recognize ${o.lang === 'eng' ? 'English' : o.lang} text on scanned pages`,
    fields: [
      {
        key: 'lang',
        label: 'Language',
        type: 'select',
        options: [
          { value: 'eng', label: 'English' },
          { value: 'urd', label: 'Urdu' },
          { value: 'ara', label: 'Arabic' },
          { value: 'hin', label: 'Hindi' },
          { value: 'spa', label: 'Spanish' },
          { value: 'fra', label: 'French' },
          { value: 'deu', label: 'German' },
        ],
      },
    ],
    defaults: { lang: 'eng' },
    async each(file, o, progress) {
      const { ocrPdf } = await import('./ocr.js')
      try {
        const r = await ocrPdf(file, { lang: o.lang, skipText: true, output: 'pdf' }, progress)
        return asPdf(file.name, r.bytes)
      } catch (e) {
        // Already-searchable files pass through unchanged.
        if (e instanceof UserError && /already has selectable text/.test(e.message)) return file
        throw e
      }
    },
  },
  watermark: {
    label: 'Watermark',
    tool: 'add-watermark',
    input: 'pdf',
    output: 'pdf',
    summary: (o) => `Stamp “${o.text}” ${o.layout === 'tile' ? 'across' : 'on'} every page`,
    fields: [
      { key: 'text', label: 'Text', type: 'text', placeholder: 'CONFIDENTIAL' },
      { key: 'layout', label: 'Layout', type: 'select', options: [{ value: 'center', label: 'Once, centered' }, { value: 'tile', label: 'Tiled' }] },
    ],
    defaults: { text: 'CONFIDENTIAL', layout: 'center' },
    validate: (o) => (o.text.trim() ? null : 'type the watermark text'),
    async each(file, o) {
      const { addWatermark } = await import('./ops.js')
      const data = await addWatermark(file, {
        mode: 'text',
        text: o.text,
        font: 'helvetica',
        fontSize: o.layout === 'tile' ? 36 : 64,
        color: '#e5484d',
        opacity: 0.25,
        angle: 45,
        layout: o.layout,
      })
      return asPdf(file.name, data)
    },
  },
  'page-numbers': {
    label: 'Page numbers',
    tool: 'add-page-numbers',
    input: 'pdf',
    output: 'pdf',
    summary: (o) => `“${o.format.replace('{n}', '1').replace('{total}', '12')}” at the ${o.position.replace('-', ' ')}`,
    fields: [
      {
        key: 'format',
        label: 'Format',
        type: 'select',
        options: [
          { value: '{n}', label: '1' },
          { value: 'Page {n}', label: 'Page 1' },
          { value: '{n} / {total}', label: '1 / 12' },
          { value: 'Page {n} of {total}', label: 'Page 1 of 12' },
        ],
      },
      {
        key: 'position',
        label: 'Position',
        type: 'select',
        options: ['bottom-center', 'bottom-right', 'bottom-left', 'top-center', 'top-right', 'top-left'].map((v) => ({ value: v, label: v.replace('-', ' ') })),
      },
    ],
    defaults: { format: 'Page {n} of {total}', position: 'bottom-center' },
    async each(file, o) {
      const { addPageNumbers, loadPdf } = await import('./ops.js')
      const count = (await loadPdf(file)).getPageCount()
      const data = await addPageNumbers(file, {
        position: o.position,
        margin: 30,
        format: o.format,
        start: 1,
        from: 1,
        to: count,
        fontSize: 11,
        font: 'helvetica',
        color: '#222222',
      })
      return asPdf(file.name, data)
    },
  },
  compress: {
    label: 'Compress',
    tool: 'compress-pdf',
    input: 'pdf',
    output: 'pdf',
    summary: (o) => (o.mode === 'target' ? `Make each file smaller than ${formatBytes(o.target)}` : `${o.level[0].toUpperCase()}${o.level.slice(1)} compression`),
    fields: [
      { key: 'mode', label: 'Mode', type: 'select', options: [{ value: 'target', label: 'Target size' }, { value: 'level', label: 'Quality level' }] },
      { key: 'target', label: 'Smaller than', type: 'select', number: true, options: SIZE_OPTIONS, when: (o) => o.mode === 'target' },
      {
        key: 'level',
        label: 'Level',
        type: 'select',
        options: [{ value: 'low', label: 'Less compression' }, { value: 'recommended', label: 'Recommended' }, { value: 'extreme', label: 'Extreme' }],
        when: (o) => o.mode === 'level',
      },
    ],
    defaults: { mode: 'target', target: 1048576, level: 'recommended' },
    async each(file, o, progress, report) {
      const { compressPdf, compressToTarget } = await import('./compress.js')
      const r = o.mode === 'target' ? await compressToTarget(file, o.target, progress) : await compressPdf(file, o.level, progress)
      if (r.reached === false) report(`“${file.name}” couldn’t get under ${formatBytes(o.target)} (smallest: ${formatBytes(r.after)}).`)
      return asPdf(file.name, r.bytes)
    },
  },
  protect: {
    label: 'Password protect',
    tool: 'protect-pdf',
    input: 'pdf',
    output: 'pdf',
    last: true,
    summary: () => 'Lock with AES-256',
    fields: [{ key: 'password', label: 'Password', type: 'password', secret: true }],
    defaults: { password: '' },
    validate: (o) => (o.password ? null : 'enter a password'),
    async each(file, o) {
      const { protectPdf } = await import('./qpdf.js')
      return asPdf(file.name, await protectPdf(file, { password: o.password, allowPrint: true, allowCopy: true, allowEdit: true }))
    },
  },
  'to-images': {
    label: 'Pages to JPG',
    tool: 'pdf-to-jpg',
    input: 'pdf',
    output: 'image',
    last: true,
    summary: (o) => `Every page as a ${o.dpi} DPI JPG`,
    fields: [{ key: 'dpi', label: 'Resolution', type: 'select', number: true, options: [{ value: 96, label: '96 DPI (screen)' }, { value: 150, label: '150 DPI' }, { value: 300, label: '300 DPI (print)' }] }],
    defaults: { dpi: 150 },
    async run(files, o, progress) {
      const { pdfsToImages } = await import('./convert.js')
      const out = await pdfsToImages(files, { dpi: o.dpi, format: 'jpg' }, progress)
      return out.map((r) => new File([r.data], r.name, { type: r.type }))
    },
  },
}

export const STEP_ORDER = ['images-to-pdf', 'repair', 'unlock', 'merge', 'pages', 'rotate', 'ocr', 'watermark', 'page-numbers', 'compress', 'protect', 'to-images']

export const newStep = (type, opts = {}) => ({ type, opts: { ...STEP_TYPES[type].defaults, ...opts } })

/** Ready-made workflows for common jobs. */
export const RECIPES = [
  {
    id: 'email-ready',
    name: 'Email-ready PDF',
    text: 'Join files and shrink the result under 1 MB.',
    steps: [newStep('merge'), newStep('compress', { mode: 'target', target: 1048576 })],
  },
  {
    id: 'application',
    name: 'Application pack',
    text: 'One numbered PDF under 500 KB, for job and admission portals.',
    steps: [newStep('merge', { name: 'application' }), newStep('page-numbers'), newStep('compress', { mode: 'target', target: 512000 })],
  },
  {
    id: 'photos',
    name: 'Photos to small PDF',
    text: 'Phone photos or scans into one compact PDF.',
    steps: [newStep('images-to-pdf'), newStep('compress', { mode: 'target', target: 1048576 })],
  },
  {
    id: 'searchable',
    name: 'Searchable scans',
    text: 'OCR scanned PDFs, then compress them.',
    steps: [newStep('ocr'), newStep('compress', { mode: 'level', level: 'recommended' })],
  },
  {
    id: 'confidential',
    name: 'Confidential share',
    text: 'Watermark every page, then lock with a password.',
    steps: [newStep('watermark', { layout: 'tile' }), newStep('protect')],
  },
  {
    id: 'shrink-all',
    name: 'Bulk compress',
    text: 'Compress every file in a batch, separately.',
    steps: [newStep('compress', { mode: 'level', level: 'recommended' })],
  },
]

/** Problems that stop a workflow from running on these files, or null. */
export function checkWorkflow(steps, files) {
  if (!steps.length) return 'Add at least one step.'
  const images = files.filter((f) => matchesKind(f, 'image')).length
  const pdfs = files.filter((f) => matchesKind(f, 'pdf')).length
  if (images && pdfs) return 'Use either PDFs or images in one run, not both.'
  let kind = images ? 'image' : 'pdf'
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]
    const def = STEP_TYPES[s.type]
    const n = `Step ${i + 1} (${def.label})`
    if (def.input !== kind) {
      return kind === 'image'
        ? `Your files are images — start with “Images to PDF”.`
        : def.input === 'image'
          ? `${n} needs images, but your files are PDFs. Remove it.`
          : `${n} can’t follow a step that outputs images.`
    }
    if (def.last && i < steps.length - 1) return `${n} has to be the last step.`
    const problem = def.validate?.(s.opts)
    if (problem) return `${n}: ${problem}.`
    kind = def.output
  }
  return null
}

/**
 * Runs the steps. progress(done, total, label) reports overall progress (0–1000).
 * Returns { files: File[], notes: string[] }.
 */
export async function runWorkflow(steps, files, progress) {
  let batch = files
  const notes = []
  const report = (msg) => notes.push(msg)
  const SCALE = 1000
  for (let i = 0; i < steps.length; i++) {
    const def = STEP_TYPES[steps[i].type]
    const o = steps[i].opts
    const label = `Step ${i + 1} of ${steps.length}: ${def.label}`
    const at = (frac) => progress(Math.round(((i + Math.min(1, frac)) / steps.length) * SCALE), SCALE, label)
    at(0)
    if (def.run) {
      batch = await def.run(batch, o, (d, t) => at(d / Math.max(t, 1)))
    } else {
      const next = []
      for (let k = 0; k < batch.length; k++) {
        const sub = (d, t) => at((k + d / Math.max(t, 1)) / batch.length)
        next.push(await def.each(batch[k], o, sub, report))
        at((k + 1) / batch.length)
      }
      batch = next
    }
  }
  progress(SCALE, SCALE, 'Packing your files…')
  return { files: batch, notes }
}

// --- Saving and sharing (secret fields such as passwords are always left out) ---

const SAVED_KEY = 'pdfwise:workflows'

export function stripSecrets(steps) {
  return steps.map((s) => {
    const opts = { ...s.opts }
    for (const f of STEP_TYPES[s.type].fields) if (f.secret) opts[f.key] = STEP_TYPES[s.type].defaults[f.key]
    return { type: s.type, opts }
  })
}

/** Accepts only known step types and option keys, so a shared link can't inject anything odd. */
export function sanitizeSteps(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((s) => s && STEP_TYPES[s.type])
    .slice(0, 20)
    .map((s) => {
      const def = STEP_TYPES[s.type]
      const opts = { ...def.defaults }
      for (const f of def.fields) {
        const v = s.opts?.[f.key]
        if (f.secret || v === undefined) continue
        if (f.options && !f.options.some((opt) => opt.value === v)) continue
        if (f.type === 'text' && typeof v === 'string') opts[f.key] = v.slice(0, 120)
        else if (f.options) opts[f.key] = v
      }
      return { type: s.type, opts }
    })
}

export function savedWorkflows() {
  try {
    const list = JSON.parse(localStorage.getItem(SAVED_KEY) || '[]')
    return Array.isArray(list) ? list.map((w) => ({ id: String(w.id), name: String(w.name).slice(0, 60), steps: sanitizeSteps(w.steps) })) : []
  } catch {
    return []
  }
}

export function saveWorkflows(list) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(list.map((w) => ({ ...w, steps: stripSecrets(w.steps) }))))
    return true
  } catch {
    return false
  }
}

const b64url = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64url = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))))

export function encodeWorkflow(name, steps) {
  return b64url(JSON.stringify({ n: name, s: stripSecrets(steps).map((x) => [x.type, x.opts]) }))
}

export function decodeWorkflow(code) {
  try {
    const data = JSON.parse(unb64url(code))
    const steps = sanitizeSteps((data.s ?? []).map(([type, opts]) => ({ type, opts })))
    return steps.length ? { name: typeof data.n === 'string' ? data.n.slice(0, 60) : 'Shared workflow', steps } : null
  } catch {
    return null
  }
}
