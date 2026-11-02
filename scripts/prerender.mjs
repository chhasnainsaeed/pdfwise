// Runs after `vite build`: writes one static HTML file per page (home, every tool, the
// compress-to-size pages) with its own <title>, description, canonical URL, Open Graph tags,
// JSON-LD and readable content, plus sitemap.xml and robots.txt. React replaces the static
// content when the app starts; search engines and link previews see a complete page.
//
//   SITE_URL=https://your-domain.com npm run build
//
// Without SITE_URL, canonical/OG URLs and the sitemap are skipped (a warning is printed).

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { allPages } from '../src/seo.js'
import { BRAND, CATEGORIES, TOOLS } from '../src/tools.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const SITE = (process.env.SITE_URL || '').replace(/\/+$/, '')
if (!SITE) console.warn('[prerender] SITE_URL is not set — skipping canonical URLs and sitemap.xml. Example: SITE_URL=https://pdfwise.example npm run build')

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const json = (o) => JSON.stringify(o).replace(/</g, '\\u003c')
const abs = (p) => `${SITE}${p === '/' ? '/' : p}`

const template = readFileSync(path.join(dist, 'index.html'), 'utf8')

function head(page) {
  const { title, description } = page.seo
  const tags = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${esc(BRAND)}" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
  ]
  if (SITE) tags.push(`<link rel="canonical" href="${abs(page.path)}" />`, `<meta property="og:url" content="${abs(page.path)}" />`)
  for (const ld of jsonLd(page)) tags.push(`<script type="application/ld+json">${json(ld)}</script>`)
  return tags.join('\n    ')
}

function jsonLd(page) {
  const out = []
  if (!page.tool) {
    out.push({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: BRAND,
      description: page.seo.description,
      ...(SITE && { url: abs('/') }),
    })
    return out
  }
  out.push({
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: `${page.name} — ${BRAND}`,
    description: page.seo.description,
    applicationCategory: 'UtilitiesApplication',
    operatingSystem: 'Any (runs in the browser)',
    browserRequirements: 'Requires JavaScript',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    ...(SITE && { url: abs(page.path) }),
  })
  out.push({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: page.seo.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  })
  if (SITE) {
    out.push({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: BRAND, item: abs('/') },
        { '@type': 'ListItem', position: 2, name: page.name, item: abs(page.path) },
      ],
    })
  }
  return out
}

const nav = () =>
  CATEGORIES.map(
    (c) =>
      `<h2>${esc(c.label)}</h2><ul>${TOOLS.filter((t) => t.category === c.id)
        .map((t) => `<li><a href="/${t.id}">${esc(t.name)}</a> — ${esc(t.description)}</li>`)
        .join('')}</ul>`,
  ).join('')

function body(page) {
  if (!page.tool) {
    return `<main class="seo-static"><h1>Every PDF tool you need, right in your browser</h1><p>${esc(page.seo.description)}</p>${nav()}</main>`
  }
  const t = page.tool
  const steps = page.seo.steps.map((s) => `<li>${esc(s)}</li>`).join('')
  const faq = page.seo.faq.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join('')
  const related = t.related.map((id) => TOOLS.find((x) => x.id === id)).filter(Boolean)
  return `<main class="seo-static"><nav><a href="/">${esc(BRAND)}</a></nav><h1>${esc(page.name)}</h1><p>${esc(page.seo.lead ?? t.description)}</p><h2>How to use ${esc(page.name)}</h2><ol>${steps}</ol><h2>Frequently asked questions</h2>${faq}${
    related.length ? `<h2>Related tools</h2><ul>${related.map((r) => `<li><a href="/${r.id}">${esc(r.name)}</a></li>`).join('')}</ul>` : ''
  }</main>`
}

const pages = allPages()
for (const page of pages) {
  const html = template
    .replace(/<title>[\s\S]*?<\/title>\s*/, '')
    .replace(/<meta\s+name="description"[\s\S]*?\/>\s*/, '')
    .replace('</head>', `  ${head(page)}\n  </head>`)
    .replace('<div id="root"></div>', `<div id="root">${body(page)}</div>`)
  const file = page.path === '/' ? 'index.html' : `${page.path.slice(1)}.html`
  writeFileSync(path.join(dist, file), html)
}

const robots = ['User-agent: *', 'Allow: /', 'Disallow: /api/']
if (SITE) {
  const today = new Date().toISOString().slice(0, 10)
  const urls = pages
    .map((p) => `  <url><loc>${abs(p.path)}</loc><lastmod>${today}</lastmod><priority>${p.path === '/' ? '1.0' : p.path.startsWith('/compress-pdf-to-') ? '0.7' : '0.8'}</priority></url>`)
    .join('\n')
  writeFileSync(path.join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`)
  robots.push('', `Sitemap: ${abs('/sitemap.xml')}`)
}
writeFileSync(path.join(dist, 'robots.txt'), `${robots.join('\n')}\n`)
console.log(`[prerender] wrote ${pages.length} pages${SITE ? ', sitemap.xml' : ''} and robots.txt`)
