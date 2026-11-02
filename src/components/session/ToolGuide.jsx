import { Link } from 'react-router-dom'
import { moreLinks } from '../../seo.js'
import { TOOLS_BY_ID } from '../../tools.js'
import ToolIcon from '../ToolIcon.jsx'

/** How-to steps, FAQ and related tools under the upload area — for people and search engines. */
export default function ToolGuide({ tool, title, seo, slug }) {
  const related = (slug ? [tool.id, ...tool.related] : tool.related).map((id) => TOOLS_BY_ID[id]).filter(Boolean)
  const more = moreLinks(tool, slug)
  return (
    <section className="tool-guide" aria-labelledby="guide-title">
      {seo.about && <p className="guide-about">{seo.about}</p>}
      <h2 id="guide-title">How to use {title}</h2>
      <ol className="guide-steps">
        {seo.steps.map((step, i) => (
          <li key={i}>
            <span className="guide-num">{i + 1}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <h2>Frequently asked questions</h2>
      <div className="guide-faq">
        {seo.faq.map(([q, a]) => (
          <details key={q}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
      {more.length > 0 && (
        <>
          <h2>More ways to get it done</h2>
          <div className="size-links-row guide-more">
            {more.map((m) => (
              <Link key={m.path} to={m.path} className="chip chip-lg">
                {m.name}
              </Link>
            ))}
          </div>
        </>
      )}
      {related.length > 0 && (
        <>
          <h2>Related tools</h2>
          <div className="continue-grid">
            {related.map((t) => (
              <Link key={t.id} to={`/${t.id}`} className="continue-item">
                <ToolIcon tool={t} size="sm" />
                <span>{t.name}</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
