import { Download, Plus, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import ToolIcon from '../components/ToolIcon.jsx'
import ToolLayout from '../components/ToolLayout.jsx'
import { baseName, pluralize, formatBytes, matchesKind, uid } from '../lib/files.js'
import { moveItem, useReorder, useSession } from '../lib/hooks.js'
import {
  RECIPES,
  STEP_ORDER,
  STEP_TYPES,
  checkWorkflow,
  decodeWorkflow,
  newStep,
  runWorkflow,
  sanitizeSteps,
} from '../lib/workflow.js'
import Sidebar from './workflow/Sidebar.jsx'
import StepCard, { stepTool } from './workflow/StepCard.jsx'

const withIds = (steps) => steps.map((s) => ({ ...s, opts: { ...s.opts }, id: uid() }))

/** A sensible first workflow for the files that were dropped. */
function starter(files) {
  if (files.some((f) => matchesKind(f.file, 'image'))) return RECIPES.find((r) => r.id === 'photos')
  if (files.length > 1) return RECIPES.find((r) => r.id === 'email-ready')
  return RECIPES.find((r) => r.id === 'shrink-all')
}

export default function Workflow() {
  const session = useSession()
  const { files, setFiles, run } = session
  const [params, setParams] = useSearchParams()
  const [initial] = useState(() => {
    const shared = params.get('w') && decodeWorkflow(params.get('w'))
    if (shared) return { name: shared.name, steps: shared.steps, shared: true }
    const preset = session.preset?.workflow && sanitizeSteps(session.preset.workflow)
    if (preset?.length) return { name: session.preset.name, steps: preset }
    const r = starter(files)
    return { name: r.name, steps: r.steps }
  })
  const [name, setName] = useState(initial.name)
  const [steps, setSteps] = useState(() => withIds(initial.steps))
  const [open, setOpen] = useState(() => (initial.shared ? null : 0))
  const [picker, setPicker] = useState(false)
  const { bind, over, dragging } = useReorder(setSteps)

  useEffect(() => {
    // The share code has been read; keep the address bar clean.
    if (params.get('w')) setParams({}, { replace: true })
  }, [params, setParams])

  const problem = useMemo(
    () =>
      checkWorkflow(
        steps,
        files.map((f) => f.file),
      ),
    [steps, files],
  )
  const totalIn = files.reduce((n, f) => n + f.file.size, 0)
  const combines = steps.some((s) => STEP_TYPES[s.type].combine)

  const load = (wf) => {
    setName(wf.name)
    setSteps(withIds(wf.steps))
    setOpen(wf.steps.findIndex((s) => STEP_TYPES[s.type].fields.some((f) => f.secret)))
    setPicker(false)
  }

  const update = (id, patch) =>
    setSteps((list) => list.map((s) => (s.id === id ? { ...s, opts: { ...s.opts, ...patch } } : s)))
  const remove = (id) => setSteps((list) => list.filter((s) => s.id !== id))
  const move = (i, d) => setSteps((list) => (list[i + d] ? moveItem(list, i, i + d) : list))

  const add = (type) => {
    const step = { ...newStep(type), id: uid() }
    // New steps go before a closing step (Protect, Pages to JPG) unless they close it themselves.
    const closing = steps.length && STEP_TYPES[steps[steps.length - 1].type].last && !STEP_TYPES[type].last
    const at = STEP_TYPES[type].input === 'image' ? 0 : closing ? steps.length - 1 : steps.length
    setSteps([...steps.slice(0, at), step, ...steps.slice(at)])
    setOpen(at)
    setPicker(false)
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
      const summary = `Ran ${pluralize(steps.length, 'step')} on ${pluralize(input.length, 'file')} → ${pluralize(out.length, 'file')}, ${formatBytes(totalIn)} → ${formatBytes(totalOut)}.`
      return {
        files: renamed,
        zipName: `${(name.trim() || 'workflow').replace(/[^\w-]+/g, '-').toLowerCase()}.zip`,
        stats: steps.some((s) => s.type === 'compress') ? { before: totalIn, after: totalOut } : undefined,
        note: [summary, ...notes].join(' '),
        analytics: {
          recipe: RECIPES.some((r) => r.name === name) || name === session.preset?.name ? name : 'custom',
          steps: steps.map((s) => s.type).join('>'),
        },
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
                <button
                  type="button"
                  aria-label={`Remove ${f.file.name}`}
                  onClick={() => setFiles((list) => list.filter((x) => x.id !== f.id))}
                >
                  <X size={14} />
                </button>
              </span>
            ))}
          </div>

          <input
            className="wf-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Workflow name"
            maxLength={60}
          />

          <ol className="wf-pipeline">
            <li className="wf-node wf-node-io">
              <span className="wf-dot" />
              {pluralize(files.length, 'file')} in · {formatBytes(totalIn)}
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
              <button
                type="button"
                className={`wf-add-btn ${picker ? 'is-open' : ''}`}
                onClick={() => setPicker((p) => !p)}
              >
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
      sidebar={<Sidebar name={name} steps={steps} onLoad={load} />}
      hint={problem}
      disabled={Boolean(problem)}
      actionLabel={problem ? 'Run workflow' : `Run ${pluralize(steps.length, 'step')}`}
      onAction={go}
    />
  )
}
