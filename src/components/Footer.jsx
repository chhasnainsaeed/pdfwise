import { Link } from 'react-router-dom'
import { BRAND, TOOLS } from '../tools.js'
import Logo from './Logo.jsx'

const COLUMNS = [
  { label: 'Organize', categories: ['organize'] },
  { label: 'Optimize & convert', categories: ['optimize', 'convert'] },
  { label: 'Edit & sign', categories: ['edit', 'sign'] },
  { label: 'Security', categories: ['security'] },
]

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <Link to="/" className="brand">
            <Logo size={28} />
            <span className="brand-name">{BRAND}</span>
          </Link>
          <p>Free PDF tools that run in your browser. Only Office-to-PDF conversion uses a server — your own.</p>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.label} className="footer-col">
            <h4>{col.label}</h4>
            {TOOLS.filter((t) => col.categories.includes(t.category)).map((t) => (
              <Link key={t.id} to={`/${t.id}`}>
                {t.name}
              </Link>
            ))}
          </div>
        ))}
      </div>
      <div className="footer-bottom">
        © {new Date().getFullYear()} {BRAND} · Built with pdf-lib, PDF.js, qpdf and Tesseract
      </div>
    </footer>
  )
}
