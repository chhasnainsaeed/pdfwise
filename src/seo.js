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

const plural = (t) => (t.multiple ? 'files' : 'file')

function toolSeo(t) {
  const local = !t.server
  const suffix = local ? 'Free, Private, No Upload' : 'Free Online Converter'
  let title = `${t.name} — ${suffix} | ${BRAND}`
  if (title.length > 62) title = `${t.name} Online Free | ${BRAND}`
  const description = `${t.description} ${local ? 'Runs in your browser — files never leave your device.' : 'Files are deleted right after conversion.'} Free, no sign-up.`
  const noun =
    t.kind === 'url'
      ? 'web page'
      : t.kind === 'any'
        ? 'PDFs or images'
        : t.kind === 'image'
          ? 'images'
          : t.kind === 'pdf'
            ? `PDF ${plural(t)}`
            : `${t.kind === 'word' ? 'Word' : t.kind === 'excel' ? 'Excel' : 'PowerPoint'} ${plural(t)}`
  const steps =
    t.steps ??
    (t.kind === 'url'
      ? [
          'Paste the address of the web page.',
          'Choose page size, orientation and margins.',
          `Click “${t.action}” and download your PDF.`,
        ]
      : [
          `Select or drop your ${noun} — or paste them with Ctrl+V.`,
          'Adjust the options in the side panel.',
          `Click “${t.action}” and download the result.`,
        ])
  const faq = [
    [`Is ${t.name} free?`, `Yes. ${BRAND} is free with no sign-up, no watermark on your files and no daily limits.`],
    local
      ? [
          'Are my files uploaded?',
          `No. ${t.name} runs entirely in your browser, so your files never leave your device.`,
        ]
      : [
          'Are my files uploaded?',
          'Yes — this conversion needs a server. Files are processed in a temporary folder and deleted as soon as the PDF is ready.',
        ],
    ...(t.faq ?? []),
    [
      'Does it work on phones?',
      `Yes. ${BRAND} works in any modern browser on Android, iPhone, Windows, Mac and Linux.`,
    ],
  ]
  return { title, description, keywords: t.keywords ?? [], steps, faq }
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
      : [
          'Are my files uploaded?',
          'Yes — this conversion needs a server. Files are deleted as soon as the result is ready.',
        ],
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

/**
 * Landing pages to link from a page ("More ways to get it done"). On a landing page: its group
 * first. On a tool page: the tool's own landing pages first; tools without any get none.
 */
export function moreLinks(tool, slug, limit = 8) {
  const all = Object.entries(ALIASES).filter(([id]) => id !== slug)
  const me = slug && ALIASES[slug]
  if (!me && !all.some(([, a]) => a.tool === tool.id)) return []
  const first = me ? ([, a]) => a.group === me.group : ([, a]) => a.tool === tool.id
  const ranked = [...all.filter(first), ...all.filter((x) => !first(x))]
  return ranked.slice(0, limit).map(([id, a]) => ({ path: `/${id}`, name: a.name }))
}

/** Every crawlable path with its page data, for the prerenderer and sitemap. */
export function allPages() {
  return [
    { path: '/', name: BRAND, seo: HOME_SEO },
    ...TOOLS.map((t) => ({ path: `/${t.id}`, name: t.name, tool: t, seo: TOOL_SEO[t.id] })),
    ...Object.entries(ALIASES).map(([id, a]) => ({
      path: `/${id}`,
      name: a.name,
      tool: TOOLS_BY_ID[a.tool],
      seo: a.seo,
      slug: id,
    })),
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
