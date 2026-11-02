// Tool search for the Ctrl+K palette: tools and landing pages, matched by name, keywords and text.
import { ALIASES, TOOL_SEO } from '../seo.js'
import { TOOLS, TOOLS_BY_ID } from '../tools.js'

const ENTRIES = [
  ...TOOLS.map((t) => ({
    path: `/${t.id}`,
    name: t.name,
    tool: t,
    text: t.description,
    hay: [t.name, ...TOOL_SEO[t.id].keywords].join(' ').toLowerCase(),
  })),
  ...Object.entries(ALIASES).map(([id, a]) => ({
    path: `/${id}`,
    name: a.name,
    tool: TOOLS_BY_ID[a.tool],
    text: a.seo.lead,
    hay: [a.name, ...(a.keywords ?? [])].join(' ').toLowerCase(),
    landing: true,
  })),
]

/** Every word must match; earlier, stronger matches score higher. 0 = no match. */
function score(entry, words) {
  const name = entry.name.toLowerCase()
  let total = 0
  for (const w of words) {
    if (name.startsWith(w)) total += 4
    else if (name.split(/\s+/).some((part) => part.startsWith(w))) total += 3
    else if (entry.hay.includes(w)) total += 2
    else if (entry.text.toLowerCase().includes(w)) total += 1
    else return 0
  }
  return entry.landing ? total - 0.5 : total // on a tie, the tool comes before its landing pages
}

/**
 * Matches for `query`, best first. With an empty query: recently used tools (flagged `recent`),
 * then every other tool.
 */
export function searchTools(query, recentIds = []) {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  if (!words.length) {
    const recent = recentIds.map((id) => ENTRIES.find((e) => e.path === `/${id}`)).filter(Boolean)
    const rest = ENTRIES.filter((e) => !e.landing && !recent.includes(e))
    return [...recent.map((e) => ({ ...e, recent: true })), ...rest]
  }
  return ENTRIES.map((e) => ({ e, s: score(e, words) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((r) => r.e)
}
