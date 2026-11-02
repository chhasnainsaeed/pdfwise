import { ArrowLeft, ClipboardPaste, Download, FileText, RotateCcw, Server, ShieldCheck, Upload } from 'lucide-react'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { KINDS, PDF_TYPE, acceptFor, formatBytes, friendlyError, matchesKind, packResult, sleep, uid } from '../lib/files.js'
import { clearHandoff, handOff, peekHandoff, rememberTool } from '../lib/handoff.js'
import { SessionContext } from '../lib/hooks.js'
import { ALIASES, TOOL_SEO, applyHead } from '../seo.js'
import { TOOLS_BY_ID } from '../tools.js'
import { TOOL_COMPONENTS } from '../tools/index.jsx'
import ToolIcon from './ToolIcon.jsx'

const hasFiles = (e) => Array.from(e.dataTransfer?.types ?? []).includes('Files')

export default function ToolPage() {
  const { toolId } = useParams()
  const alias = ALIASES[toolId]
  const tool = TOOLS_BY_ID[alias?.tool ?? toolId]
  if (!tool) return <NotFound />
  return <ToolSession key={toolId} tool={tool} alias={alias} />
}

function NotFound() {
  return (
    <div className="stage-center">
      <h1 className="stage-title">Page not found</h1>
      <p className="stage-lead">That tool doesn’t exist — or not yet, anyway.</p>
      <Link to="/" className="btn btn-primary btn-lg">
        See all tools
      </Link>
    </div>
  )
}

function ToolSession({ tool, alias }) {
  // URL-based tools (HTML to PDF) skip the upload step entirely.
  const usesFiles = !tool.urlInput
  const [incoming] = useState(() => peekHandoff(tool.id))
  const [files, setFiles] = useState(() => incoming?.items ?? [])
  const [stage, setStage] = useState(() => (!usesFiles || incoming?.items?.length ? 'work' : 'upload'))
  const [session, setSession] = useState(0)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState(null)
  const [result, setResult] = useState(null)
  const [dropping, setDropping] = useState(false)

  useEffect(() => {
    clearHandoff()
    rememberTool(tool.id)
  }, [tool.id])

  const seo = alias?.seo ?? TOOL_SEO[tool.id]
  useEffect(() => applyHead(seo), [seo])

  useEffect(() => () => result && URL.revokeObjectURL(result.url), [result])

  useEffect(() => {
    if (usesFiles && stage === 'work' && files.length === 0) setStage('upload')
  }, [usesFiles, stage, files.length])

  const addFiles = useCallback(
    (list) => {
      const all = Array.from(list)
      const ok = all.filter((f) => matchesKind(f, tool.kind))
      const noun = KINDS[tool.kind].noun
      if (ok.length < all.length) setError(`Skipped ${all.length - ok.length} file(s) — ${tool.name} only accepts ${noun}.`)
      else if (!tool.multiple && ok.length > 1) setError(`${tool.name} works on one file at a time, so only “${ok[0].name}” was added.`)
      else setError('')
      if (!ok.length) return
      const items = ok.map((file) => ({ id: uid(), file }))
      setFiles((prev) => (tool.multiple ? [...prev, ...items] : items.slice(0, 1)))
      setStage('work')
    },
    [tool],
  )

  const run = useCallback(async (task) => {
    setError('')
    setProgress(null)
    setStage('processing')
    const started = performance.now()
    try {
      const out = await task({ progress: (done, total) => setProgress({ done, total }) })
      const packed = await packResult(out)
      const elapsed = performance.now() - started
      if (elapsed < 600) await sleep(600 - elapsed)
      setResult({ ...packed, url: URL.createObjectURL(packed.blob), stats: out.stats, note: out.note })
      setStage('done')
    } catch (e) {
      console.error(e)
      setError(friendlyError(e))
      setStage('work')
    }
  }, [])

  // Page-wide drag & drop for adding files.
  const acceptsDrop = usesFiles && (stage === 'upload' || (stage === 'work' && tool.multiple))
  useEffect(() => {
    let depth = 0
    const enter = (e) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth++
      if (acceptsDrop) setDropping(true)
    }
    const over = (e) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = acceptsDrop ? 'copy' : 'none'
    }
    const leave = (e) => {
      if (!hasFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (!depth) setDropping(false)
    }
    const drop = (e) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setDropping(false)
      if (acceptsDrop) addFiles(e.dataTransfer.files)
    }
    // Ctrl+V: pasted files (screenshots, copied PDFs) join the session like dropped ones.
    const paste = (e) => {
      if (e.target.closest?.('input, textarea, [contenteditable="true"]')) return
      const pasted = Array.from(e.clipboardData?.files ?? [])
      if (pasted.length && acceptsDrop) {
        e.preventDefault()
        addFiles(pasted)
      }
    }
    window.addEventListener('paste', paste)
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('paste', paste)
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [acceptsDrop, addFiles])

  const restart = () => {
    setFiles([])
    setResult(null)
    setError('')
    setSession((n) => n + 1)
    setStage(usesFiles ? 'upload' : 'work')
  }

  const Workspace = TOOL_COMPONENTS[tool.id]
  const preset = { target: alias?.target, url: incoming?.url }
  const ctx = { tool, files, setFiles, addFiles, run, error, setError, preset, accept: usesFiles ? acceptFor(tool.kind) : '' }

  return (
    <SessionContext.Provider value={ctx}>
      {stage === 'upload' && (
        <>
          <UploadStage tool={tool} title={alias?.name} lead={seo.lead} onFiles={addFiles} error={error} />
          <ToolGuide tool={tool} title={alias?.name ?? tool.name} seo={seo} />
        </>
      )}
      {stage !== 'upload' && (
        <div className="workspace-host" hidden={stage === 'done'}>
          <Suspense
            fallback={
              <div className="page-loading">
                <span className="spinner" />
              </div>
            }
          >
            <Workspace key={session} />
          </Suspense>
        </div>
      )}
      {stage === 'processing' && <ProcessingOverlay tool={tool} progress={progress} />}
      {stage === 'done' && result && (
        <DoneStage tool={tool} result={result} onBack={() => setStage('work')} onRestart={restart} />
      )}
      {dropping && (
        <div className="drop-overlay">
          <div className="drop-overlay-card">
            <Upload size={40} />
            <strong>Drop your {KINDS[tool.kind].label} files here</strong>
          </div>
        </div>
      )}
    </SessionContext.Provider>
  )
}

function UploadStage({ tool, title, lead, onFiles, error }) {
  const input = useRef(null)
  const noun = KINDS[tool.kind].label
  const plural = tool.multiple ? `${noun} files` : `${noun} file`
  return (
    <div className="stage-center upload-stage" style={{ '--c': tool.color }}>
      <div className="icon-orbit" aria-hidden="true">
        <span className="orbit-ring" />
        <span className="orbit-ring orbit-ring-2" />
        <ToolIcon tool={tool} size="lg" />
      </div>
      <h1 className="stage-title">{title ?? tool.name}</h1>
      <p className="stage-lead">{lead ?? tool.description}</p>
      <button type="button" className="btn btn-primary btn-xl" onClick={() => input.current.click()}>
        <Upload size={22} />
        Select {plural}
      </button>
      <p className="upload-hint">
        or drop {plural} anywhere on this page · <ClipboardPaste size={14} /> paste with <kbd>Ctrl</kbd>+<kbd>V</kbd>
      </p>
      <input
        ref={input}
        type="file"
        hidden
        multiple={tool.multiple}
        accept={acceptFor(tool.kind)}
        onChange={(e) => {
          onFiles(e.target.files)
          e.target.value = ''
        }}
      />
      {error && (
        <div className="alert upload-alert" role="alert">
          {error}
        </div>
      )}
      <p className="privacy-note">
        {tool.server ? <Server size={16} /> : <ShieldCheck size={16} />}
        {tool.server
          ? 'Converted on your PDFwise server — files are deleted as soon as the PDF is ready.'
          : 'Processed on your device — your files never leave your browser.'}
      </p>
    </div>
  )
}

function ProcessingOverlay({ tool, progress }) {
  const pct = progress?.total ? Math.round((progress.done / progress.total) * 100) : null
  return (
    <div className="processing" role="status" aria-live="polite">
      <div className="processing-card">
        <span className="spinner spinner-lg" />
        <h2>{tool.processing}</h2>
        {pct !== null ? (
          <>
            <div className="progress">
              <div className="progress-bar" style={{ width: `${pct}%` }} />
            </div>
            <p className="muted">
              {progress.done} of {progress.total}
            </p>
          </>
        ) : (
          <p className="muted">This happens on your device, so it won’t take long.</p>
        )}
      </div>
    </div>
  )
}

function DoneStage({ tool, result, onBack, onRestart }) {
  const navigate = useNavigate()
  const isPdf = result.type === PDF_TYPE
  const ext = result.name.split('.').pop().toLowerCase()
  const label =
    result.count > 1
      ? `ZIP (${result.count} files)`
      : { pdf: 'PDF', png: 'PNG', jpg: 'JPG', docx: 'Word file', txt: 'text file' }[ext] ?? 'file'
  const related = isPdf ? tool.related.map((id) => TOOLS_BY_ID[id]).filter(Boolean) : []

  const continueWith = (id) => {
    handOff(id, [{ id: uid(), file: new File([result.blob], result.name, { type: PDF_TYPE }) }])
    navigate(`/${id}`)
  }

  return (
    <div className="stage-center done-stage">
      <h1 className="stage-title">{tool.done}</h1>
      {result.stats && <CompressStats stats={result.stats} />}
      {result.note && <p className="stage-lead">{result.note}</p>}

      <div className="done-card">
        <div className="done-file">
          <FileText size={20} />
          <span className="done-file-name">{result.name}</span>
          <span className="muted">{formatBytes(result.blob.size)}</span>
        </div>
        <a className="btn btn-primary btn-xl" href={result.url} download={result.name}>
          <Download size={22} />
          Download {label}
        </a>
      </div>

      <div className="done-links">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          <ArrowLeft size={18} /> Back to editing
        </button>
        <button type="button" className="btn btn-ghost" onClick={onRestart}>
          <RotateCcw size={18} /> Start over
        </button>
      </div>

      {related.length > 0 && (
        <section className="continue">
          <h2>Continue with this file</h2>
          <div className="continue-grid">
            {related.map((t) => (
              <button key={t.id} type="button" className="continue-item" onClick={() => continueWith(t.id)}>
                <ToolIcon tool={t} size="sm" />
                <span>{t.name}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function CompressStats({ stats }) {
  const saved = stats.before > 0 ? Math.round((1 - stats.after / stats.before) * 100) : 0
  return (
    <div className="compress-stats">
      <div className="ring" style={{ '--p': Math.max(saved, 0) }}>
        <span>{saved > 0 ? `-${saved}%` : '0%'}</span>
      </div>
      <div>
        <strong>{saved > 0 ? `Your PDF is ${saved}% smaller` : 'This PDF was already well optimized'}</strong>
        <p className="muted">
          {formatBytes(stats.before)} → {formatBytes(stats.after)}
        </p>
      </div>
    </div>
  )
}

/** How-to steps, FAQ and related tools under the upload area — for people and search engines. */
function ToolGuide({ tool, title, seo }) {
  const related = tool.related.map((id) => TOOLS_BY_ID[id]).filter(Boolean)
  return (
    <section className="tool-guide" aria-labelledby="guide-title">
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
