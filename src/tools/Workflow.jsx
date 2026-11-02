import { ArrowDown, ArrowUp, Bookmark, Check, ChevronDown, Download, GripVertical, Link2, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import ToolIcon from '../components/ToolIcon.jsx'
import ToolLayout from '../components/ToolLayout.jsx'
import { Field } from '../components/controls.jsx'
import { baseName, formatBytes, matchesKind, uid } from '../lib/files.js'
import { useReorder, useSession } from '../lib/hooks.js'
import {
  RECIPES,
  STEP_ORDER,
  STEP_TYPES,
  checkWorkflow,
  decodeWorkflow,
  encodeWorkflow,
  newStep,
  runWorkflow,
  savedWorkflows,
  saveWorkflows,
} from '../lib/workflow.js'
import { TOOLS_BY_ID } from '../tools.js'

const withIds = (steps) => steps.map((s) => ({ ...s, opts: { ...s.opts }, id: uid() }))
const stepTool = (type) => TOOLS_BY_ID[STEP_TYPES[type].tool]

/** A sensible first workflow for the files that were dropped. */
function starter(files) {
  if (files.some((f) => matchesKind(f.file, 'image'))) return RECIPES.find((r) => r.id === 'photos')
  if (files.length > 1) return RECIPES.find((r) => r.id === 'email-ready')
  return RECIPES.find((r) => r.id === 'shrink-all')
}

export default function Workflow() {
  const { files, setFiles, run } = useSession()
  const [params, setParams] = useSearchParams()
  const [initial] = useState(() => {
    const shared = params.get('w') && decodeWorkflow(params.get('w'))
    if (shared) return { name: shared.name, steps: shared.steps, shared: true }
    const r = starter(files)
    return { name: r.name, steps: r.steps }
  })
  const [name, setName] = useState(initial.name)
  const [steps, setSteps] = useState(() => withIds(initial.steps))
  const [open, setOpen] = useState(() => (initial.shared ? null : 0))
  const [picker, setPicker] = useState(false)
  const [saved, setSaved] = useState(savedWorkflows)
  const [flash, setFlash] = useState('')
  const { bind, over, dragging } = useReorder(setSteps)

  useEffect(() => {
    // The share code has been read; keep the address bar clean.
    if (params.get('w')) setParams({}, { replace: true })
  }, [params, setParams])

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(''), 2600)
    return () => clearTimeout(t)
  }, [flash])

  const problem = useMemo(() => checkWorkflow(steps, files.map((f) => f.file)), [steps, files])
  const totalIn = files.reduce((n, f) => n + f.file.size, 0)
  const combines = steps.some((s) => STEP_TYPES[s.type].combine)

  const load = (wf) => {
    setName(wf.name)
    setSteps(withIds(wf.steps))
    setOpen(wf.steps.findIndex((s) => STEP_TYPES[s.type].fields.some((f) => f.secret)))
    setPicker(false)
  }

  const update = (id, patch) => setSteps((list) => list.map((s) => (s.id === id ? { ...s, opts: { ...s.opts, ...patch } } : s)))
  const remove = (id) => setSteps((list) => list.filter((s) => s.id !== id))
  const move = (i, d) =>
    setSteps((list) => {
      const next = [...list]
      const j = i + d
      if (j < 0 || j >= next.length) return list
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })

  const add = (type) => {
    const step = { ...newStep(type), id: uid() }
    // New steps go before a closing step (Protect, Pages to JPG) unless they close it themselves.
    const closing = steps.length && STEP_TYPES[steps[steps.length - 1].type].last && !STEP_TYPES[type].last
    const at = STEP_TYPES[type].input === 'image' ? 0 : closing ? steps.length - 1 : steps.length
    setSteps([...steps.slice(0, at), step, ...steps.slice(at)])
    setOpen(at)
    setPicker(false)
  }

  const save = () => {
    const label = name.trim() || 'My workflow'
    const others = saved.filter((w) => w.name !== label)
    const next = [{ id: uid(), name: label, steps }, ...others].slice(0, 12)
    if (saveWorkflows(next)) {
      setSaved(savedWorkflows())
      setFlash('Saved in this browser — passwords are never stored.')
    } else setFlash('Your browser blocked saving.')
  }

  const removeSaved = (id) => {
    const next = saved.filter((w) => w.id !== id)
    saveWorkflows(next)
    setSaved(savedWorkflows())
  }

  const share = async () => {
    const url = `${location.origin}/pdf-workflows?w=${encodeWorkflow(name.trim() || 'Shared workflow', steps)}`
    try {
      await navigator.clipboard.writeText(url)
      setFlash('Link copied — anyone can open it and run the same steps. Passwords are never included.')
    } catch {
      window.prompt('Copy this link:', url)
    }
  }

  const go = () =>
    run(async ({ progress }) => {
      const input = files.map((f) => f.file)
      const { files: out, notes } = await runWorkflow(steps, input, progress)
      const totalOut = out.reduce((n, f) => n + f.size, 0)
      const renamed = out.map((f) => {
        const ext = f.name.split('.').pop()
        const keep = combines || STEP_TYPES[steps[steps.length - 1].type].output === 'image'
        return { name: keep ? f.name : `${baseName(f.name)}-final.${ext}`, type: f.type, data: f }
      })
      const summary = `Ran ${steps.length} step${steps.length > 1 ? 's' : ''} on ${input.length} file${input.length > 1 ? 's' : ''} → ${out.length} file${out.length > 1 ? 's' : ''}, ${formatBytes(totalIn)} → ${formatBytes(totalOut)}.`
      return {
        files: renamed,
        zipName: `${(name.trim() || 'workflow').replace(/[^\w-]+/g, '-').toLowerCase()}.zip`,
        stats: steps.some((s) => s.type === 'compress') ? { before: totalIn, after: totalOut } : undefined,
        note: [summary, ...notes].join(' '),
      }
    })

  return (
    <ToolLayout
      mainClass="wf-main"
      main={
        <div className="wf">
          <div className="wf-files">
            {files.map((f) => (
              <span key={f.id} className="wf-file">
                <span className="truncate">{f.file.name}</span>
                <small>{formatBytes(f.file.size)}</small>
                <button type="button" aria-label={`Remove ${f.file.name}`} onClick={() => setFiles((list) => list.filter((x) => x.id !== f.id))}>
                  <X size={14} />
                </button>
              </span>
            ))}
          </div>

          <input className="wf-name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Workflow name" maxLength={60} />

          <ol className="wf-pipeline">
            <li className="wf-node wf-node-io">
              <span className="wf-dot" />
              {files.length} file{files.length === 1 ? '' : 's'} in · {formatBytes(totalIn)}
            </li>
            {steps.map((s, i) => (
              <StepCard
                key={s.id}
                step={s}
                index={i}
                count={steps.length}
                open={open === i}
                onToggle={() => setOpen(open === i ? null : i)}
                onChange={(patch) => update(s.id, patch)}
                onRemove={() => remove(s.id)}
                onMove={(d) => move(i, d)}
                drag={bind(i)}
                dragOver={over === i && dragging !== i}
              />
            ))}
            <li className="wf-add">
              <button type="button" className={`wf-add-btn ${picker ? 'is-open' : ''}`} onClick={() => setPicker((p) => !p)}>
                <Plus size={18} /> Add step
              </button>
              {picker && (
                <div className="wf-picker">
                  {STEP_ORDER.map((type) => (
                    <button key={type} type="button" className="wf-pick" onClick={() => add(type)}>
                      <ToolIcon tool={stepTool(type)} size="xs" />
                      {STEP_TYPES[type].label}
                    </button>
                  ))}
                </div>
              )}
            </li>
            <li className="wf-node wf-node-io wf-node-out">
              <Download size={16} />
              {combines ? 'One file out' : files.length > 1 ? `${files.length} files out, zipped` : 'Your file out'}
            </li>
          </ol>
        </div>
      }
      sidebar={
        <>
          <h3 className="wf-side-title">Recipes</h3>
          <div className="wf-recipes">
            {RECIPES.map((r) => (
              <button key={r.id} type="button" className={`wf-recipe ${name === r.name ? 'is-active' : ''}`} onClick={() => load(r)}>
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
                    <button type="button" onClick={() => load(w)}>
                      <Bookmark size={15} /> <span className="truncate">{w.name}</span>
                      <small>{w.steps.length} steps</small>
                    </button>
                    <button type="button" className="icon-btn" aria-label={`Delete ${w.name}`} onClick={() => removeSaved(w.id)}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="wf-share">
            <button type="button" className="btn btn-ghost" onClick={save} disabled={!steps.length}>
              <Bookmark size={16} /> Save
            </button>
            <button type="button" className="btn btn-ghost" onClick={share} disabled={!steps.length}>
              <Link2 size={16} /> Copy share link
            </button>
          </div>
          {flash && (
            <p className="wf-flash" role="status">
              <Check size={15} /> {flash}
            </p>
          )}
        </>
      }
      hint={problem}
      disabled={Boolean(problem)}
      actionLabel={problem ? 'Run workflow' : `Run ${steps.length} step${steps.length > 1 ? 's' : ''}`}
      onAction={go}
    />
  )
}

function StepCard({ step, index, count, open, onToggle, onChange, onRemove, onMove, drag, dragOver }) {
  const def = STEP_TYPES[step.type]
  const tool = stepTool(step.type)
  const fields = def.fields.filter((f) => !f.when || f.when(step.opts))
  const needs = def.validate?.(step.opts)
  return (
    <li className={`wf-step ${open ? 'is-open' : ''} ${dragOver ? 'is-over' : ''}`} style={{ '--c': tool.color, '--i': index }} {...drag}>
      <div className="wf-step-head">
        <span className="wf-grip" aria-hidden="true">
          <GripVertical size={16} />
        </span>
        <span className="wf-num">{index + 1}</span>
        <ToolIcon tool={tool} size="sm" />
        <button type="button" className="wf-step-main" onClick={onToggle} aria-expanded={open}>
          <strong>{def.label}</strong>
          <small className={needs ? 'wf-needs' : ''}>{needs ? `Needs: ${needs}` : def.summary(step.opts)}</small>
        </button>
        <span className="wf-step-tools">
          <button type="button" className="icon-btn" aria-label="Move up" disabled={index === 0} onClick={() => onMove(-1)}>
            <ArrowUp size={16} />
          </button>
          <button type="button" className="icon-btn" aria-label="Move down" disabled={index === count - 1} onClick={() => onMove(1)}>
            <ArrowDown size={16} />
          </button>
          <button type="button" className="icon-btn" aria-label={`Remove ${def.label}`} onClick={onRemove}>
            <Trash2 size={16} />
          </button>
          {fields.length > 0 && (
            <button type="button" className="icon-btn wf-chev" aria-label={open ? 'Hide options' : 'Show options'} onClick={onToggle}>
              <ChevronDown size={18} />
            </button>
          )}
        </span>
      </div>
      {open && fields.length > 0 && (
        <div className="wf-step-body" draggable={false} onDragStart={(e) => e.preventDefault()}>
          {fields.map((f) => (
            <Field key={f.key} label={f.label}>
              {f.options ? (
                <select
                  className="text-input"
                  value={step.opts[f.key]}
                  onChange={(e) => onChange({ [f.key]: f.number ? Number(e.target.value) : e.target.value })}
                >
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="text-input"
                  type={f.type === 'password' ? 'password' : 'text'}
                  autoComplete={f.type === 'password' ? 'new-password' : 'off'}
                  value={step.opts[f.key]}
                  placeholder={f.placeholder}
                  onChange={(e) => onChange({ [f.key]: e.target.value })}
                />
              )}
            </Field>
          ))}
        </div>
      )}
    </li>
  )
}
