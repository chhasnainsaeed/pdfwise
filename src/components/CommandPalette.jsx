import { CornerDownLeft, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { OPEN_PALETTE } from '../lib/events.js'
import { recentTools } from '../lib/handoff.js'
import { ALIASES, TOOL_SEO } from '../seo.js'
import { TOOLS, TOOLS_BY_ID } from '../tools.js'
import ToolIcon from './ToolIcon.jsx'

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
    hay: `${a.name} reduce shrink size`.toLowerCase(),
  })),
]

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
  // Prefer the real tool over its size presets when both match equally.
  return total + (entry.path.includes('-to-') && entry.tool.id === 'compress-pdf' ? -0.5 : 0)
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const navigate = useNavigate()
  const input = useRef(null)
  const listRef = useRef(null)

  useEffect(() => {
    const onKey = (e) => {
      const typing = e.target.closest?.('input, textarea, select, [contenteditable="true"]')
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((o) => !o)
      } else if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        setOpen(true)
      }
    }
    const onOpen = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener(OPEN_PALETTE, onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener(OPEN_PALETTE, onOpen)
    }
  }, [])

  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
    }
  }, [open])

  const results = useMemo(() => {
    const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
    if (!words.length) {
      const recent = recentTools().map((id) => ENTRIES.find((e) => e.path === `/${id}`)).filter(Boolean)
      const rest = ENTRIES.filter((e) => TOOLS_BY_ID[e.path.slice(1)] && !recent.includes(e))
      return [...recent.map((e) => ({ ...e, recent: true })), ...rest]
    }
    return ENTRIES.map((e) => ({ e, s: score(e, words) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((r) => r.e)
  }, [query])

  useEffect(() => setActive(0), [query])
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!open) return null

  const go = (entry) => {
    setOpen(false)
    navigate(entry.path)
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(results.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter' && results[active]) {
      e.preventDefault()
      go(results[active])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Search tools">
        <div className="palette-search">
          <Search size={20} />
          <input
            ref={input}
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="What do you want to do? Try “compress 200kb” or “sign”"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={results[active] ? `pal-${active}` : undefined}
          />
          <kbd>Esc</kbd>
        </div>
        <ul className="palette-list" id="palette-list" role="listbox" ref={listRef}>
          {results.length === 0 && <li className="palette-empty">No tool matches “{query}”.</li>}
          {results.map((r, i) => (
            <li
              key={r.path}
              id={`pal-${i}`}
              role="option"
              aria-selected={i === active}
              className="palette-item"
              onMouseMove={() => setActive(i)}
              onClick={() => go(r)}
            >
              <ToolIcon tool={r.tool} size="sm" />
              <span className="palette-text">
                <strong>{r.name}</strong>
                <small>{r.text}</small>
              </span>
              {r.recent && <span className="palette-tag">Recent</span>}
              {i === active && <CornerDownLeft size={16} className="palette-enter" />}
            </li>
          ))}
        </ul>
        <div className="palette-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> to move
          </span>
          <span>
            <kbd>Enter</kbd> to open
          </span>
          <span>
            <kbd>Ctrl</kbd>
            <kbd>K</kbd> anywhere
          </span>
        </div>
      </div>
    </div>
  )
}
