import { ChevronDown, Menu, Search, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { BRAND, CATEGORIES, TOOLS } from '../tools.js'
import { openPalette } from '../lib/events.js'
import { InstallButton } from './AppStatus.jsx'
import Logo from './Logo.jsx'
import ToolIcon from './ToolIcon.jsx'

// Every convert tool, in registry order, so new ones show up in the menu automatically.
const CONVERT = TOOLS.filter((t) => t.category === 'convert')

function ToolLink({ tool }) {
  return (
    <Link to={`/${tool.id}`} className="menu-tool">
      <ToolIcon tool={tool} size="xs" />
      <span>{tool.name}</span>
    </Link>
  )
}

function Dropdown({ id, label, open, setOpen, wide, children }) {
  const isOpen = open === id
  return (
    <div
      className={`nav-drop ${wide ? 'is-wide' : ''}`}
      onMouseEnter={() => setOpen(id)}
      onMouseLeave={() => setOpen(null)}
    >
      <button
        type="button"
        className={`nav-link ${isOpen ? 'is-open' : ''}`}
        aria-expanded={isOpen}
        onClick={() => setOpen(isOpen ? null : id)}
      >
        {label}
        <ChevronDown size={16} />
      </button>
      {isOpen && (
        <div className="drop-wrap">
          <div className="drop-panel">{children}</div>
        </div>
      )}
    </div>
  )
}

export default function Header() {
  const { pathname } = useLocation()
  const [drop, setDrop] = useState(null)
  const [mobile, setMobile] = useState(false)

  useEffect(() => {
    setDrop(null)
    setMobile(false)
  }, [pathname])

  const grouped = CATEGORIES.map((c) => ({ ...c, tools: TOOLS.filter((t) => t.category === c.id) }))

  return (
    <header className="site-header">
      <div className="header-inner">
        <Link to="/" className="brand" aria-label={`${BRAND} home`}>
          <Logo />
          <span className="brand-name">{BRAND}</span>
        </Link>

        <nav className="main-nav" aria-label="Main">
          <NavLink to="/merge-pdf" className="nav-link">
            Merge PDF
          </NavLink>
          <NavLink to="/split-pdf" className="nav-link">
            Split PDF
          </NavLink>
          <NavLink to="/compress-pdf" className="nav-link">
            Compress PDF
          </NavLink>
          <Dropdown id="convert" label="Convert PDF" open={drop} setOpen={setDrop}>
            <div className="drop-list">
              {CONVERT.map((t) => (
                <ToolLink key={t.id} tool={t} />
              ))}
            </div>
          </Dropdown>
          <Dropdown id="all" label="All PDF tools" open={drop} setOpen={setDrop} wide>
            <div className="mega">
              {grouped.map((g) => (
                <div key={g.id} className="mega-col">
                  <h4>{g.label}</h4>
                  {g.tools.map((t) => (
                    <ToolLink key={t.id} tool={t} />
                  ))}
                </div>
              ))}
            </div>
          </Dropdown>
        </nav>

        <InstallButton />
        <button type="button" className="search-btn" onClick={openPalette} aria-label="Search tools (Ctrl+K)">
          <Search size={18} />
          <span className="search-btn-text">Search tools</span>
          <kbd>Ctrl K</kbd>
        </button>

        <button
          type="button"
          className="icon-btn menu-toggle"
          aria-label={mobile ? 'Close menu' : 'Open menu'}
          aria-expanded={mobile}
          onClick={() => setMobile((m) => !m)}
        >
          {mobile ? <X /> : <Menu />}
        </button>
      </div>

      {mobile && (
        <div className="mobile-menu">
          {grouped.map((g) => (
            <div key={g.id} className="mobile-group">
              <h4>{g.label}</h4>
              <div className="mobile-tools">
                {g.tools.map((t) => (
                  <ToolLink key={t.id} tool={t} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </header>
  )
}
