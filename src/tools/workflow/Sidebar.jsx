import { Bookmark, Check, Link2, Trash2 } from 'lucide-react'
import ToolIcon from '../../components/ToolIcon.jsx'
import { RECIPES } from '../../lib/workflow.js'
import { stepTool } from './StepCard.jsx'
import { useLibrary } from './useLibrary.js'

/** Recipes, the workflows saved in this browser, and Save / Copy share link. */
export default function Sidebar({ name, steps, onLoad }) {
  const { saved, save, remove, share, flash } = useLibrary()
  return (
    <>
        <h3 className="wf-side-title">Recipes</h3>
        <div className="wf-recipes">
          {RECIPES.map((r) => (
            <button key={r.id} type="button" className={`wf-recipe ${name === r.name ? 'is-active' : ''}`} onClick={() => onLoad(r)}>
              <strong>{r.name}</strong>
              <small>{r.text}</small>
              <span className="wf-recipe-steps">
                {r.steps.map((s, i) => (
                  <ToolIcon key={i} tool={stepTool(s.type)} size="xs" />
                ))}
              </span>
            </button>
          ))}
        </div>

        {saved.length > 0 && (
          <>
            <h3 className="wf-side-title">Your workflows</h3>
            <div className="wf-saved">
              {saved.map((w) => (
                <div key={w.id} className="wf-saved-row">
                  <button type="button" onClick={() => onLoad(w)}>
                    <Bookmark size={15} /> <span className="truncate">{w.name}</span>
                    <small>{w.steps.length} steps</small>
                  </button>
                  <button type="button" className="icon-btn" aria-label={`Delete ${w.name}`} onClick={() => remove(w.id)}>
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="wf-share">
          <button type="button" className="btn btn-ghost" onClick={() => save(name, steps)} disabled={!steps.length}>
            <Bookmark size={16} /> Save
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => share(name, steps)} disabled={!steps.length}>
            <Link2 size={16} /> Copy share link
          </button>
        </div>
        {flash && (
          <p className="wf-flash" role="status">
            <Check size={15} /> {flash}
          </p>
        )}
    </>
  )
}
