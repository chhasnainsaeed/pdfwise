import { BadgeCheck, ShieldCheck, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BRAND, CATEGORIES, TOOLS } from '../tools.js'
import ToolIcon from './ToolIcon.jsx'

const FEATURES = [
  {
    icon: ShieldCheck,
    title: 'Private by design',
    text: 'PDF tools run in your browser, so those files never leave your device. Office conversions use your own server and delete files right away.',
  },
  {
    icon: Zap,
    title: 'Fast, even offline',
    text: 'No upload or download queue — work starts the moment you drop a file, on your own machine.',
  },
  {
    icon: BadgeCheck,
    title: 'Free, no sign-up',
    text: 'No accounts, no watermarks on your output, no daily limits. Just open a tool and get going.',
  },
]

export default function Home() {
  const [filter, setFilter] = useState('all')
  const tools = filter === 'all' ? TOOLS : TOOLS.filter((t) => t.category === filter)

  useEffect(() => {
    document.title = `${BRAND} — Free PDF tools in your browser`
  }, [])

  return (
    <div className="home">
      <section className="hero">
        <h1>
          Every PDF tool you need, <span className="hl">right in your browser</span>
        </h1>
        <p>
          Merge, split, compress, convert, edit, sign and protect PDFs — free, and almost every tool runs
          right on your device.
        </p>
      </section>

      <div className="filters" role="tablist" aria-label="Tool categories">
        {[{ id: 'all', label: 'All' }, ...CATEGORIES].map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={filter === c.id}
            className={`pill ${filter === c.id ? 'is-active' : ''}`}
            onClick={() => setFilter(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="tool-grid">
        {tools.map((t) => (
          <Link key={t.id} to={`/${t.id}`} className="tool-card" style={{ '--c': t.color }}>
            <ToolIcon tool={t} />
            {t.server && (
              <span className="server-badge" title="Converted on your PDFwise server">
                Server
              </span>
            )}
            <h3>{t.name}</h3>
            <p>{t.description}</p>
          </Link>
        ))}
      </div>

      <section className="features">
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <div key={title} className="feature">
            <span className="feature-icon">
              <Icon />
            </span>
            <h3>{title}</h3>
            <p>{text}</p>
          </div>
        ))}
      </section>
    </div>
  )
}
