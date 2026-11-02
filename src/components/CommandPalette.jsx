import { CornerDownLeft, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { OPEN_PALETTE } from '../lib/events.js'
import { track } from '../lib/analytics.js'
import { recentTools } from '../lib/handoff.js'
import { searchTools } from '../lib/search.js'
import ToolIcon from './ToolIcon.jsx'

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

  const results = useMemo(() => searchTools(query, recentTools()), [query])

  useEffect(() => setActive(0), [query])
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!open) return null

  const go = (entry) => {
    track('Search used', { page: entry.path.slice(1), typed: query.trim() ? 'yes' : 'no' })
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
