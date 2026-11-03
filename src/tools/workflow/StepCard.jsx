import { ArrowDown, ArrowUp, ChevronDown, GripVertical, Trash2 } from 'lucide-react'
import ToolIcon from '../../components/ToolIcon.jsx'
import { Field } from '../../components/controls.jsx'
import { STEP_TYPES } from '../../lib/workflow.js'
import { TOOLS_BY_ID } from '../../tools.js'

/** The tool whose icon and color a workflow step borrows. */
export const stepTool = (type) => TOOLS_BY_ID[STEP_TYPES[type].tool]

/** One step in the pipeline: header with reorder/remove buttons, and its options when open. */
export default function StepCard({ step, index, count, open, onToggle, onChange, onRemove, onMove, drag, dragOver }) {
  const def = STEP_TYPES[step.type]
  const tool = stepTool(step.type)
  const fields = def.fields.filter((f) => !f.when || f.when(step.opts))
  const needs = def.validate?.(step.opts)
  return (
    <li
      className={`wf-step ${open ? 'is-open' : ''} ${dragOver ? 'is-over' : ''}`}
      style={{ '--c': tool.color, '--i': index }}
      {...drag}
    >
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
          <button
            type="button"
            className="icon-btn"
            aria-label="Move up"
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            <ArrowUp size={16} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Move down"
            disabled={index === count - 1}
            onClick={() => onMove(1)}
          >
            <ArrowDown size={16} />
          </button>
          <button type="button" className="icon-btn" aria-label={`Remove ${def.label}`} onClick={onRemove}>
            <Trash2 size={16} />
          </button>
          {fields.length > 0 && (
            <button
              type="button"
              className="icon-btn wf-chev"
              aria-label={open ? 'Hide options' : 'Show options'}
              onClick={onToggle}
            >
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
