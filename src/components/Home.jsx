import { BadgeCheck, Clock, ShieldCheck, Zap } from 'lucide-react'
import { Suspense, lazy, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { recentTools } from '../lib/handoff.js'
import { LANDING_GROUPS } from '../landing.js'
import { ALIASES, HOME_SEO, applyHead } from '../seo.js'
import { CATEGORIES, TOOLS, TOOLS_BY_ID } from '../tools.js'
import SmartDrop from './SmartDrop.jsx'
import ToolIcon from './ToolIcon.jsx'

// three.js is ~150 KB gzipped: load it after the page is interactive, in its own chunk.
const Hero3D = lazy(() => import('./Hero3D.jsx'))

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

/** The 3D scene is decoration: skip it on Data Saver and on low-memory or low-core devices. */
function canAfford3D() {
  if (typeof navigator === 'undefined') return false
  if (navigator.connection?.saveData) return false
  if ((navigator.deviceMemory ?? 8) <= 2 || (navigator.hardwareConcurrency ?? 8) <= 2) return false
  return true
}

function useIdle() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const go = () => setReady(true)
    const id = window.requestIdleCallback ? requestIdleCallback(go, { timeout: 1200 }) : setTimeout(go, 300)
    return () => (window.cancelIdleCallback ? cancelIdleCallback(id) : clearTimeout(id))
  }, [])
  return ready
}

/** Tool card that tilts toward the pointer, with a light glare. */
function TiltCard({ tool }) {
  const move = (e) => {
    if (e.pointerType === 'touch') return
    const el = e.currentTarget
    const r = el.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width
    const y = (e.clientY - r.top) / r.height
    el.style.setProperty('--ry', `${(x - 0.5) * 14}deg`)
    el.style.setProperty('--rx', `${-(y - 0.5) * 14}deg`)
    el.style.setProperty('--gx', `${x * 100}%`)
    el.style.setProperty('--gy', `${y * 100}%`)
  }
  const leave = (e) => {
    e.currentTarget.style.setProperty('--rx', '0deg')
    e.currentTarget.style.setProperty('--ry', '0deg')
  }
  return (
    <Link to={`/${tool.id}`} className="tool-card" style={{ '--c': tool.color }} onPointerMove={move} onPointerLeave={leave}>
      <span className="tool-card-glare" aria-hidden="true" />
      <span className="tool-card-depth">
        <ToolIcon tool={tool} />
      </span>
      {tool.badge && <span className="new-badge">{tool.badge}</span>}
      {tool.server && (
        <span className="server-badge" title="Converted on your PDFwise server">
          Server
        </span>
      )}
      <h3>{tool.name}</h3>
      <p>{tool.description}</p>
    </Link>
  )
}

export default function Home() {
  const [filter, setFilter] = useState('all')
  const [recent] = useState(() => recentTools().map((id) => TOOLS_BY_ID[id]).filter(Boolean))
  const tools = filter === 'all' ? TOOLS : TOOLS.filter((t) => t.category === filter)
  const idle = useIdle()
  const [with3D] = useState(canAfford3D)

  useEffect(() => applyHead(HOME_SEO), [])

  return (
    <div className="home">
      <section className="hero3d">
        {idle && with3D && (
          <Suspense fallback={null}>
            <Hero3D />
          </Suspense>
        )}
        <div className="hero3d-content">
          <h1>
            Every PDF tool you need, <span className="hl">right in your browser</span>
          </h1>
          <p className="hero-lead">
            Merge, split, compress, convert, edit, sign and protect PDFs — free, and almost every tool runs right on
            your device.
          </p>
          <SmartDrop />
        </div>
      </section>

      {recent.length > 0 && (
        <nav className="recent" aria-label="Recently used tools">
          <span className="recent-label">
            <Clock size={15} /> Recent
          </span>
          {recent.map((t) => (
            <Link key={t.id} to={`/${t.id}`} className="recent-chip" style={{ '--c': t.color }}>
              <ToolIcon tool={t} size="xs" />
              {t.name}
            </Link>
          ))}
        </nav>
      )}

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
          <TiltCard key={t.id} tool={t} />
        ))}
      </div>

      <section className="size-links" aria-labelledby="tasks-title">
        <h2 id="tasks-title">Made for the job you’re doing</h2>
        <p>Each one opens the right tool, already set up — just add your files.</p>
        {LANDING_GROUPS.map((g) => (
          <div key={g.id} className="task-group">
            <h3>{g.label}</h3>
            <div className="size-links-row">
              {Object.entries(ALIASES)
                .filter(([, a]) => a.group === g.id)
                .map(([id, a]) => (
                  <Link key={id} to={`/${id}`} className="chip chip-lg">
                    {a.name}
                  </Link>
                ))}
            </div>
          </div>
        ))}
      </section>

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
