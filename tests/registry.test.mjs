// Checks that every tool entry (src/tools.js) and landing page (src/landing.js) is complete and
// consistent, so a new or edited tool can't quietly break menus, routes or SEO.
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { test } from 'node:test'
import { ICONS } from '../src/components/icons.js'
import { KINDS } from '../src/lib/files.js'
import { checkWorkflow, sanitizeSteps } from '../src/lib/workflow.js'
import { LANDING_PAGES } from '../src/landing.js'
import { ALIASES, TOOL_SEO, allPages, moreLinks } from '../src/seo.js'
import { CATEGORIES, TOOLS, TOOLS_BY_ID } from '../src/tools.js'

const KIND_IDS = [...Object.keys(KINDS), 'url']

test('every tool has the required fields', () => {
  for (const t of TOOLS) {
    for (const key of ['id', 'name', 'category', 'color', 'icon', 'component', 'kind', 'description', 'action', 'processing', 'done']) {
      assert.ok(t[key], `${t.id ?? t.name}: missing ${key}`)
    }
    assert.match(t.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${t.id}: id must be lowercase-with-dashes`)
    assert.match(t.color, /^#[0-9a-f]{6}$/i, `${t.id}: color must be #rrggbb`)
    assert.ok(Array.isArray(t.related), `${t.id}: related must be a list`)
  }
})

test('tool ids are unique and do not clash with landing pages', () => {
  const ids = TOOLS.map((t) => t.id)
  assert.equal(new Set(ids).size, ids.length, 'duplicate tool id')
  for (const p of LANDING_PAGES) assert.ok(!TOOLS_BY_ID[p.slug], `landing page /${p.slug} clashes with a tool`)
})

test('categories, kinds, icons, screens and related tools all exist', () => {
  const categories = CATEGORIES.map((c) => c.id)
  for (const t of TOOLS) {
    assert.ok(categories.includes(t.category), `${t.id}: unknown category ${t.category}`)
    assert.ok(KIND_IDS.includes(t.kind), `${t.id}: unknown kind ${t.kind}`)
    assert.ok(ICONS[t.icon], `${t.id}: icon ${t.icon} is not listed in src/components/icons.js`)
    assert.ok(existsSync(new URL(`../src/tools/${t.component}.jsx`, import.meta.url)), `${t.id}: src/tools/${t.component}.jsx is missing`)
    for (const r of t.related) assert.ok(TOOLS_BY_ID[r], `${t.id}: related tool ${r} doesn't exist`)
  }
})

test('every page has a unique, sensibly sized title and description', () => {
  const pages = allPages()
  const titles = pages.map((p) => p.seo.title)
  assert.equal(new Set(titles).size, titles.length, `duplicate titles: ${titles.filter((t, i) => titles.indexOf(t) !== i)}`)
  const descriptions = pages.map((p) => p.seo.description)
  assert.equal(new Set(descriptions).size, descriptions.length, 'duplicate descriptions')
  for (const p of pages) {
    assert.ok(p.seo.title.length <= 70, `${p.path}: title is ${p.seo.title.length} chars (keep it ≤ 70)`)
    assert.ok(p.seo.description.length >= 70 && p.seo.description.length <= 170, `${p.path}: description is ${p.seo.description.length} chars (aim for 70–170)`)
  }
})

test('tool pages have steps and FAQs', () => {
  for (const t of TOOLS) {
    const seo = TOOL_SEO[t.id]
    assert.ok(seo.steps.length >= 2, `${t.id}: needs at least 2 how-to steps`)
    assert.ok(seo.faq.length >= 3, `${t.id}: needs at least 3 FAQs`)
    for (const [q, a] of seo.faq) assert.ok(q && a, `${t.id}: FAQ entries need a question and an answer`)
  }
})

test('landing pages are complete and point at real tools', () => {
  const slugs = LANDING_PAGES.map((p) => p.slug)
  assert.equal(new Set(slugs).size, slugs.length, 'duplicate landing slug')
  for (const p of LANDING_PAGES) {
    assert.ok(TOOLS_BY_ID[p.tool], `${p.slug}: tool ${p.tool} doesn't exist`)
    for (const key of ['name', 'title', 'description', 'lead', 'about']) assert.ok(p[key], `${p.slug}: missing ${key}`)
    assert.ok(p.steps?.length >= 2, `${p.slug}: needs steps`)
    assert.ok(['size', 'combine', 'task'].includes(p.group), `${p.slug}: unknown group ${p.group}`)
    assert.ok(p.about.length >= 120, `${p.slug}: “about” is too short to be useful (${p.about.length} chars)`)
  }
})

test('landing-page workflow presets are valid workflows', () => {
  for (const p of LANDING_PAGES.filter((x) => x.preset.workflow)) {
    assert.equal(p.tool, 'pdf-workflows', `${p.slug}: workflow presets need tool: 'pdf-workflows'`)
    const clean = sanitizeSteps(p.preset.workflow)
    assert.deepEqual(clean, p.preset.workflow.map((s) => ({ type: s.type, opts: { ...clean.find((c) => c.type === s.type).opts } })), `${p.slug}: preset has unknown steps or option values`)
    for (const [i, s] of p.preset.workflow.entries()) {
      for (const [k, v] of Object.entries(s.opts)) assert.equal(clean[i].opts[k], v, `${p.slug}: step ${s.type} option ${k}=${v} isn't allowed`)
    }
    const sample = clean[0].type === 'images-to-pdf' ? new File(['x'], 'a.jpg', { type: 'image/jpeg' }) : new File(['x'], 'a.pdf', { type: 'application/pdf' })
    assert.equal(checkWorkflow(clean, [sample, sample]), null, `${p.slug}: preset doesn't run as-is`)
  }
})

test('size presets are within a sensible range', () => {
  for (const p of LANDING_PAGES) {
    if (p.preset.target) assert.ok(p.preset.target >= 10 * 1024 && p.preset.target <= 50 * 1024 * 1024, `${p.slug}: odd target size`)
    if (p.preset.level) assert.ok(['low', 'recommended', 'extreme'].includes(p.preset.level), `${p.slug}: unknown level`)
  }
})

test('“more ways” links never point at the page itself', () => {
  for (const [slug, a] of Object.entries(ALIASES)) {
    const links = moreLinks(TOOLS_BY_ID[a.tool], slug)
    assert.ok(links.length > 0, `${slug}: no related landing pages`)
    assert.ok(!links.some((l) => l.path === `/${slug}`), `${slug}: links to itself`)
  }
})
