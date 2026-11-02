import { ArrowRight, Plus, X } from 'lucide-react'
import { useRef } from 'react'
import { useSession } from '../lib/hooks.js'
import ToolIcon from './ToolIcon.jsx'

/** Two-pane workspace: content on the left, options and the action button on the right. */
export default function ToolLayout({ main, sidebar, onAction, disabled, hint, actionLabel, mainClass = '' }) {
  const { tool, files, error, setError } = useSession()
  return (
    <div className="workspace">
      <section className={`ws-main ${mainClass}`}>{main}</section>
      {tool.multiple && <AddFilesButton count={files.length} />}
      <aside className="ws-side">
        <header className="side-head">
          <ToolIcon tool={tool} size="sm" />
          <h1>{tool.name}</h1>
        </header>
        <div className="side-body">{sidebar}</div>
        <footer className="side-foot">
          {error && (
            <div className="alert" role="alert">
              <span>{error}</span>
              <button type="button" className="alert-close" aria-label="Dismiss" onClick={() => setError('')}>
                <X size={16} />
              </button>
            </div>
          )}
          {hint && <p className="side-hint">{hint}</p>}
          <button type="button" className="btn btn-primary btn-lg btn-block" disabled={disabled} onClick={onAction}>
            {actionLabel ?? tool.action}
            <ArrowRight size={20} />
          </button>
        </footer>
      </aside>
    </div>
  )
}

function AddFilesButton({ count }) {
  const { addFiles, accept } = useSession()
  const input = useRef(null)
  return (
    <>
      <button type="button" className="add-files" title="Add more files" onClick={() => input.current.click()}>
        <Plus size={24} />
        <span className="add-files-count">{count}</span>
      </button>
      <input
        ref={input}
        type="file"
        hidden
        multiple
        accept={accept}
        onChange={(e) => {
          addFiles(e.target.files)
          e.target.value = ''
        }}
      />
    </>
  )
}
