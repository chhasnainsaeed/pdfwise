import { Upload } from 'lucide-react'
import { Suspense, useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { bucket, timeBucket, track } from '../lib/analytics.js'
import { KINDS, UserError, acceptFor, friendlyError, matchesKind, packResult, sleep, uid } from '../lib/files.js'
import { clearHandoff, peekHandoff, rememberTool } from '../lib/handoff.js'
import { SessionContext, usePaste, useWindowFileDrop } from '../lib/hooks.js'
import { ALIASES, TOOL_SEO, applyHead } from '../seo.js'
import { TOOLS_BY_ID } from '../tools.js'
import { TOOL_COMPONENTS } from '../tools/index.jsx'
import DoneStage from './session/DoneStage.jsx'
import ProcessingOverlay from './session/ProcessingOverlay.jsx'
import ToolGuide from './session/ToolGuide.jsx'
import UploadStage from './session/UploadStage.jsx'

/** /:toolId — a tool, or a landing page (src/landing.js) that opens a tool with a preset. */
export default function ToolPage() {
  const { toolId } = useParams()
  const alias = ALIASES[toolId]
  const tool = TOOLS_BY_ID[alias?.tool ?? toolId]
  if (!tool) return <NotFound />
  return <ToolSession key={toolId} tool={tool} alias={alias} slug={toolId} />
}

function NotFound() {
  useEffect(() => track('404', { path: location.pathname }), [])
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

const Loading = () => (
  <div className="page-loading">
    <span className="spinner" />
  </div>
)

/**
 * One use of a tool: upload → work (the tool's own screen) → processing → done.
 * Tool screens get files, run() and errors through SessionContext (useSession()).
 */
function ToolSession({ tool, alias, slug }) {
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
  const seo = alias?.seo ?? TOOL_SEO[tool.id]

  useEffect(() => {
    clearHandoff()
    rememberTool(tool.id)
    if (incoming?.items?.length)
      track('Files added', {
        tool: tool.id,
        page: slug,
        files: bucket(incoming.items.length),
        via: incoming.source ?? 'handoff',
      })
    // Once per session: `incoming` is captured on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool.id])

  useEffect(() => applyHead(seo), [seo])
  useEffect(() => () => result && URL.revokeObjectURL(result.url), [result])
  useEffect(() => {
    if (usesFiles && stage === 'work' && files.length === 0) setStage('upload')
  }, [usesFiles, stage, files.length])

  const addFiles = useCallback(
    (list, via = 'picker') => {
      const all = Array.from(list)
      const ok = all.filter((f) => matchesKind(f, tool.kind))
      if (ok.length < all.length)
        setError(`Skipped ${all.length - ok.length} file(s) — ${tool.name} only accepts ${KINDS[tool.kind].noun}.`)
      else if (!tool.multiple && ok.length > 1)
        setError(`${tool.name} works on one file at a time, so only “${ok[0].name}” was added.`)
      else setError('')
      if (!ok.length) return
      track('Files added', { tool: tool.id, page: slug, files: bucket(ok.length), via })
      const items = ok.map((file) => ({ id: uid(), file }))
      setFiles((prev) => (tool.multiple ? [...prev, ...items] : items.slice(0, 1)))
      setStage('work')
    },
    [tool, slug],
  )

  /** Runs a tool's task, shows progress, then the result. task({ progress }) → { files, zipName?, stats?, note?, analytics? } */
  const run = useCallback(
    async (task) => {
      setError('')
      setProgress(null)
      setStage('processing')
      const started = performance.now()
      try {
        const out = await task({ progress: (done, total, label) => setProgress({ done, total, label }) })
        const packed = await packResult(out)
        const elapsed = performance.now() - started
        if (elapsed < 600) await sleep(600 - elapsed) // long enough to read, never a flash
        setResult({ ...packed, url: URL.createObjectURL(packed.blob), stats: out.stats, note: out.note })
        setStage('done')
        track('Tool completed', {
          tool: tool.id,
          page: slug,
          outputs: bucket(packed.count),
          time: timeBucket(performance.now() - started),
          offline: navigator.onLine ? 'no' : 'yes',
          ...out.analytics,
        })
      } catch (e) {
        console.error(e)
        track('Tool failed', { tool: tool.id, page: slug, reason: e instanceof UserError ? 'user' : 'error' })
        setError(friendlyError(e))
        setStage('work')
      }
    },
    [tool.id, slug],
  )

  // Files can be dropped or pasted anywhere on the page while the tool can take them.
  const acceptsFiles = usesFiles && (stage === 'upload' || (stage === 'work' && tool.multiple))
  useWindowFileDrop({ enabled: acceptsFiles, onDrop: (list) => addFiles(list, 'drop'), onActive: setDropping })
  usePaste({ enabled: acceptsFiles, onFiles: (list) => addFiles(list, 'paste') })

  const restart = () => {
    setFiles([])
    setResult(null)
    setError('')
    setSession((n) => n + 1)
    setStage(usesFiles ? 'upload' : 'work')
  }

  const Workspace = TOOL_COMPONENTS[tool.id]
  const preset = {
    target: alias?.target,
    level: alias?.level,
    workflow: alias?.workflow,
    name: alias?.name,
    url: incoming?.url,
  }
  const ctx = {
    tool,
    files,
    setFiles,
    addFiles,
    run,
    error,
    setError,
    preset,
    accept: usesFiles ? acceptFor(tool.kind) : '',
  }

  return (
    <SessionContext.Provider value={ctx}>
      {stage === 'upload' && (
        <>
          <UploadStage tool={tool} title={alias?.name} lead={seo.lead} onFiles={addFiles} error={error} />
          <ToolGuide tool={tool} title={alias?.name ?? tool.name} seo={seo} slug={alias ? slug : null} />
        </>
      )}
      {stage !== 'upload' && (
        <div className="workspace-host" hidden={stage === 'done'}>
          <Suspense fallback={<Loading />}>
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
