// Search-engine copy for every page: titles, descriptions, keywords, how-to steps and FAQs.
// Used at runtime (document head + the on-page "How it works" section) and by
// scripts/prerender.mjs, which writes one static HTML file per page at build time.
// Pure data — no browser or React imports, so Node can load it.

import { LANDING_PAGES } from './landing.js'
import { BRAND, TOOLS, TOOLS_BY_ID } from './tools.js'

export const HOME_SEO = {
  title: `${BRAND} — Free PDF Tools That Run in Your Browser`,
  description:
    'Merge, split, compress, convert, edit, sign and protect PDFs for free. Almost every tool runs on your device, so your files are never uploaded. No sign-up.',
}

// Extra search phrases per tool (also used by the command palette search).
const KEYWORDS = {
  'pdf-workflows': ['batch pdf', 'bulk compress pdf', 'pdf automation', 'process multiple pdfs', 'recipe', 'workflow'],
  'merge-pdf': ['combine pdf', 'join pdf', 'merge pdf files'],
  'split-pdf': ['separate pdf', 'split pdf pages', 'cut pdf'],
  'remove-pages': ['delete pdf pages', 'remove page from pdf'],
  'extract-pages': ['save pdf pages', 'extract page from pdf'],
  'organize-pdf': ['reorder pdf pages', 'rearrange pdf', 'sort pdf pages'],
  'compress-pdf': ['reduce pdf size', 'shrink pdf', 'make pdf smaller', 'pdf under 1mb', 'pdf to 200kb'],
  'repair-pdf': ['fix pdf', 'corrupted pdf', 'recover pdf'],
  'ocr-pdf': ['scanned pdf to text', 'searchable pdf', 'image to text'],
  'images-to-pdf': ['image to pdf', 'png to pdf', 'photo to pdf', 'picture to pdf'],
  'pdf-to-jpg': ['pdf to image', 'pdf to png', 'convert pdf to picture'],
  'word-to-pdf': ['docx to pdf', 'doc to pdf'],
  'excel-to-pdf': ['xlsx to pdf', 'spreadsheet to pdf'],
  'powerpoint-to-pdf': ['ppt to pdf', 'pptx to pdf', 'slides to pdf'],
  'html-to-pdf': ['web page to pdf', 'url to pdf', 'website to pdf'],
  'pdf-to-pdfa': ['pdfa converter', 'archive pdf'],
  'pdf-to-word': ['pdf to docx', 'convert pdf to editable word'],
  'edit-pdf': ['pdf editor', 'write on pdf', 'add text to pdf', 'highlight pdf'],
  'rotate-pdf': ['turn pdf', 'flip pdf pages'],
  'add-page-numbers': ['number pdf pages', 'pdf page numbering'],
  'add-watermark': ['stamp pdf', 'watermark pdf', 'confidential stamp'],
  'crop-pdf': ['trim pdf margins', 'cut pdf margins'],
  'sign-pdf': ['e-sign pdf', 'electronic signature', 'sign document online'],
  'protect-pdf': ['password protect pdf', 'encrypt pdf', 'lock pdf'],
  'unlock-pdf': ['remove pdf password', 'decrypt pdf'],
  'redact-pdf': ['black out pdf', 'hide text in pdf', 'censor pdf'],
}

// One tool-specific question each, on top of the shared ones.
const EXTRA_FAQ = {
  'pdf-workflows': ['What can a workflow do?', 'Chain up to 20 steps — merge, keep or remove pages, rotate, OCR, watermark, page numbers, compress (even to an exact size), password-protect or turn pages into JPGs — and run them on many files at once. Save workflows in your browser or share them as a link; passwords are never saved or shared.'],
  'merge-pdf': ['Can I change the order before merging?', 'Yes. Drag the file cards, or use the arrows, into the order you want. The merged PDF follows that order exactly.'],
  'split-pdf': ['Can I split a PDF into one file per page?', 'Yes. Pick “Every page” and each page becomes its own PDF, downloaded together as a ZIP.'],
  'compress-pdf': ['Can I compress a PDF to an exact size like 200 KB or 1 MB?', 'Yes. Choose “Target size”, pick a size such as 100 KB, 200 KB, 500 KB or 1 MB, and PDFwise finds the best quality that fits under it.'],
  'ocr-pdf': ['Which languages does OCR support?', '22 languages, including English, Urdu, Arabic, Hindi, Spanish, French, German, Russian, Chinese, Japanese and Korean.'],
  'images-to-pdf': ['Can I put several photos into one PDF?', 'Yes. Add as many images as you like, drag them into order, and choose A4, Letter or “fit to image” pages.'],
  'pdf-to-word': ['Will the Word file keep the layout?', '“Keep the layout” places editable text over the page’s graphics so it looks like the original. “Flowing text” gives clean paragraphs that are easier to edit.'],
  'sign-pdf': ['Is the signature legally binding?', 'PDFwise adds a visual signature (drawn, typed or uploaded). Many everyday agreements accept this, but documents that require a certified digital signature need a dedicated signing service.'],
  'protect-pdf': ['How strong is the encryption?', 'Files are locked with AES-256, the strongest standard PDF encryption.'],
  'redact-pdf': ['Is redacted text really gone?', 'Yes. Marked pages are flattened and the file is rebuilt, so the hidden text can’t be copied, searched or recovered.'],
  'word-to-pdf': ['Will my fonts and layout be kept?', 'Fonts, tables, images, page size and margins carry over. With LibreOffice on the server, fidelity is closest to Word itself.'],
  'html-to-pdf': ['Can it save pages behind a login?', 'No. The page is loaded fresh by the server’s browser, so only public pages work.'],
}

const plural = (t) => (t.multiple ? 'files' : 'file')

function toolSeo(t) {
  const local = !t.server
  const suffix = local ? 'Free, Private, No Upload' : 'Free Online Converter'
  let title = `${t.name} — ${suffix} | ${BRAND}`
  if (title.length > 62) title = `${t.name} Online Free | ${BRAND}`
  const description = `${t.description} ${local ? 'Runs in your browser — files never leave your device.' : 'Files are deleted right after conversion.'} Free, no sign-up.`
  const noun = t.kind === 'url' ? 'web page' : t.kind === 'any' ? 'PDFs or images' : t.kind === 'image' ? 'images' : t.kind === 'pdf' ? `PDF ${plural(t)}` : `${t.kind === 'word' ? 'Word' : t.kind === 'excel' ? 'Excel' : 'PowerPoint'} ${plural(t)}`
  const steps =
    t.id === 'pdf-workflows'
      ? ['Drop all your PDFs or images at once.', 'Pick a ready-made recipe or build your own chain of steps.', `Click “${t.action}” — every step runs in order and you download the result.`]
      : t.kind === 'url'
      ? ['Paste the address of the web page.', 'Choose page size, orientation and margins.', `Click “${t.action}” and download your PDF.`]
      : [`Select or drop your ${noun} — or paste them with Ctrl+V.`, 'Adjust the options in the side panel.', `Click “${t.action}” and download the result.`]
  const faq = [
    [`Is ${t.name} free?`, `Yes. ${BRAND} is free with no sign-up, no watermark on your files and no daily limits.`],
    local
      ? ['Are my files uploaded?', `No. ${t.name} runs entirely in your browser, so your files never leave your device.`]
      : ['Are my files uploaded?', 'Yes — this conversion needs a server. Files are processed in a temporary folder and deleted as soon as the PDF is ready.'],
    ...(EXTRA_FAQ[t.id] ? [EXTRA_FAQ[t.id]] : []),
    ['Does it work on phones?', `Yes. ${BRAND} works in any modern browser on Android, iPhone, Windows, Mac and Linux.`],
  ]
  return { title, description, keywords: KEYWORDS[t.id] ?? [], steps, faq }
}

export const TOOL_SEO = Object.fromEntries(TOOLS.map((t) => [t.id, toolSeo(t)]))

// Landing pages for "compress PDF to N KB": the Compress tool with a target preset.
export const SIZE_TARGETS = [
  { slug: '100kb', label: '100 KB', bytes: 100 * 1024 },
  { slug: '200kb', label: '200 KB', bytes: 200 * 1024 },
  { slug: '500kb', label: '500 KB', bytes: 500 * 1024 },
  { slug: '1mb', label: '1 MB', bytes: 1024 * 1024 },
  { slug: '2mb', label: '2 MB', bytes: 2 * 1024 * 1024 },
]

// Landing pages (src/landing.js): a tool opened with a preset, plus copy for one specific search.
function landingFaq(page, tool) {
  const local = !tool.server
  return [
    ...page.faq,
    ['Is it free?', `Yes. ${BRAND} is free with no sign-up, no watermark on your files and no daily limits.`],
    local
      ? ['Are my files uploaded?', 'No. Everything runs in your browser, so your files never leave your device.']
      : ['Are my files uploaded?', 'Yes — this conversion needs a server. Files are deleted as soon as the result is ready.'],
  ]
}

export const ALIASES = Object.fromEntries(
  LANDING_PAGES.map((page) => {
    const tool = TOOLS_BY_ID[page.tool]
    return [
      page.slug,
      {
        tool: page.tool,
        group: page.group,
        name: page.name,
        target: page.preset.target,
        level: page.preset.level,
        workflow: page.preset.workflow,
        keywords: page.keywords,
        seo: {
          title: `${page.title} | ${BRAND}`,
          description: page.description,
          lead: page.lead,
          about: page.about,
          steps: page.steps,
          faq: landingFaq(page, tool),
          keywords: page.keywords,
        },
      },
    ]
  }),
)

/** Other landing pages to link to from one page: same group first, then the rest. */
export function siblingPages(slug, limit = 8) {
  const me = ALIASES[slug]
  const all = Object.entries(ALIASES).filter(([id]) => id !== slug)
  const ranked = me ? [...all.filter(([, a]) => a.group === me.group), ...all.filter(([, a]) => a.group !== me.group)] : all
  return ranked.slice(0, limit).map(([id, a]) => ({ path: `/${id}`, name: a.name }))
}

/** Every crawlable path with its page data, for the prerenderer and sitemap. */
export function allPages() {
  return [
    { path: '/', name: BRAND, seo: HOME_SEO },
    ...TOOLS.map((t) => ({ path: `/${t.id}`, name: t.name, tool: t, seo: TOOL_SEO[t.id] })),
    ...Object.entries(ALIASES).map(([id, a]) => ({ path: `/${id}`, name: a.name, tool: TOOLS_BY_ID[a.tool], seo: a.seo, slug: id })),
  ]
}

/** Puts title, description and canonical into <head> (client-side navigation). */
export function applyHead({ title, description }) {
  if (typeof document === 'undefined') return
  document.title = title
  let meta = document.querySelector('meta[name="description"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'description'
    document.head.appendChild(meta)
  }
  meta.content = description
  const canonical = document.querySelector('link[rel="canonical"]')
  if (canonical) canonical.href = new URL(location.pathname, canonical.href).href
}
