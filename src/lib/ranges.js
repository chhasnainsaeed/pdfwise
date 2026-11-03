import { pluralize } from './files.js'

/**
 * Parses a page list such as "1-3, 5, 8-" into sorted, unique 0-based indices.
 * Returns { pages } or { error }.
 */
export function parsePageList(text, count) {
  const set = new Set()
  const cleaned = text.replace(/\s*[-–]\s*/g, '-')
  for (const part of cleaned.split(/[\s,;]+/).filter(Boolean)) {
    let a
    let b
    const m = /^(\d*)-(\d*)$/.exec(part)
    if (m && (m[1] || m[2])) {
      a = m[1] ? Number(m[1]) : 1
      b = m[2] ? Number(m[2]) : count
    } else if (/^\d+$/.test(part)) {
      a = b = Number(part)
    } else {
      return { error: `“${part}” isn’t a page number or range.` }
    }
    if (a > b) [a, b] = [b, a]
    if (a < 1) return { error: 'Page numbers start at 1.' }
    if (b > count) return { error: `This document only has ${pluralize(count, 'page')}.` }
    for (let i = a; i <= b; i++) set.add(i - 1)
  }
  return { pages: [...set].sort((x, y) => x - y) }
}

/** Formats 0-based indices as a compact 1-based list: [0,1,2,4] → "1-3, 5". */
export function formatPageList(indices) {
  const s = [...indices].sort((a, b) => a - b)
  const parts = []
  for (let i = 0; i < s.length; i++) {
    let j = i
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++
    parts.push(i === j ? `${s[i] + 1}` : `${s[i] + 1}-${s[j] + 1}`)
    i = j
  }
  return parts.join(', ')
}

export function groupLabel(group) {
  return group.length === 1 ? `${group[0] + 1}` : `${group[0] + 1}-${group[group.length - 1] + 1}`
}
