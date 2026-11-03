import { ChevronLeft, ChevronRight, TriangleAlert } from 'lucide-react'
import { useRef, useState } from 'react'
import PageThumb from '../components/PageThumb.jsx'
import ToolLayout from '../components/ToolLayout.jsx'
import { Field, NumberInput, Segmented } from '../components/controls.jsx'
import { PDF_TYPE, baseName } from '../lib/files.js'
import { useElementSize, useSession } from '../lib/hooks.js'
import { cropPdf } from '../lib/ops.js'
import { usePdfInfo } from '../lib/pdfjs.js'

const PT_PER_MM = 72 / 25.4
const MIN = 20
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const HANDLES = ['t', 'r', 'b', 'l', 'tl', 'tr', 'bl', 'br']

function CropOverlay({ dims, margins, onChange }) {
  const drag = useRef(null)
  const scale = dims.boxW / dims.width

  const start = (e, edge) => {
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { edge, x: e.clientX, y: e.clientY, m: margins }
  }

  const move = (e) => {
    const d = drag.current
    if (!d) return
    const dx = (e.clientX - d.x) / scale
    const dy = (e.clientY - d.y) / scale
    const m = d.m
    const n = { ...m }
    if (d.edge === 'move') {
      const w = dims.width - m.left - m.right
      const h = dims.height - m.top - m.bottom
      n.left = clamp(m.left + dx, 0, dims.width - w)
      n.right = dims.width - w - n.left
      n.top = clamp(m.top + dy, 0, dims.height - h)
      n.bottom = dims.height - h - n.top
    } else {
      if (d.edge.includes('t')) n.top = clamp(m.top + dy, 0, dims.height - m.bottom - MIN)
      if (d.edge.includes('b')) n.bottom = clamp(m.bottom - dy, 0, dims.height - m.top - MIN)
      if (d.edge.includes('l')) n.left = clamp(m.left + dx, 0, dims.width - m.right - MIN)
      if (d.edge.includes('r')) n.right = clamp(m.right - dx, 0, dims.width - m.left - MIN)
    }
    onChange(n)
  }

  const end = () => {
    drag.current = null
  }

  const pct = (v, total) => `${(v / total) * 100}%`
  const top = pct(margins.top, dims.height)
  const bottom = pct(margins.bottom, dims.height)
  const left = pct(margins.left, dims.width)
  const right = pct(margins.right, dims.width)

  return (
    <div className="crop-overlay" onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      <div className="crop-shade" style={{ top: 0, left: 0, right: 0, height: top }} />
      <div className="crop-shade" style={{ bottom: 0, left: 0, right: 0, height: bottom }} />
      <div className="crop-shade" style={{ top, bottom, left: 0, width: left }} />
      <div className="crop-shade" style={{ top, bottom, right: 0, width: right }} />
      <div className="crop-box" style={{ top, bottom, left, right }} onPointerDown={(e) => start(e, 'move')}>
        {HANDLES.map((h) => (
          <span key={h} className={`crop-handle h-${h}`} onPointerDown={(e) => start(e, h)} />
        ))}
      </div>
    </div>
  )
}

export default function Crop() {
  const { files, run } = useSession()
  const item = files[0]
  const info = usePdfInfo(files)[item.id]
  const count = info?.pages ?? 0
  const [page, setPage] = useState(1)
  const [margins, setMargins] = useState({ top: 0, right: 0, bottom: 0, left: 0 })
  const [scope, setScope] = useState('all')
  const [stageRef, stage] = useElementSize()

  const toMm = (pt) => Math.round((pt / PT_PER_MM) * 10) / 10
  const setMm = (key, v) => setMargins((m) => ({ ...m, [key]: v === '' ? 0 : Math.max(0, Number(v) * PT_PER_MM) }))
  const untouched = Object.values(margins).every((v) => v < 0.5)

  const save = () =>
    run(async () => ({
      files: [
        {
          name: `${baseName(item.file.name)}-cropped.pdf`,
          type: PDF_TYPE,
          data: await cropPdf(item.file, margins, scope === 'all' ? null : [page - 1]),
        },
      ],
    }))

  return (
    <ToolLayout
      mainClass="is-fill"
      main={
        info?.error ? (
          <div className="alert inline-alert">
            <TriangleAlert size={18} /> “{item.file.name}” can’t be opened ({info.error}).
          </div>
        ) : (
          <div className="crop-stage">
            <div className="pager">
              <button
                type="button"
                className="mini-btn"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                title="Previous page"
              >
                <ChevronLeft size={16} />
              </button>
              <span>
                Page {page} of {count || '…'}
              </span>
              <button
                type="button"
                className="mini-btn"
                disabled={page >= count}
                onClick={() => setPage((p) => p + 1)}
                title="Next page"
              >
                <ChevronRight size={16} />
              </button>
            </div>
            <div className="crop-canvas" ref={stageRef}>
              {stage.width > 0 && count > 0 && (
                <PageThumb file={item.file} page={page} fitW={stage.width} fitH={stage.height}>
                  {(d) => <CropOverlay dims={d} margins={margins} onChange={setMargins} />}
                </PageThumb>
              )}
            </div>
          </div>
        )
      }
      sidebar={
        <>
          <p className="side-text">Drag the edges or corners of the box on the page, or type exact margins below.</p>
          <div className="crop-inputs">
            {['top', 'left', 'right', 'bottom'].map((k) => (
              <Field key={k} label={k[0].toUpperCase() + k.slice(1)}>
                <NumberInput value={toMm(margins[k])} min={0} step={0.5} suffix="mm" onChange={(v) => setMm(k, v)} />
              </Field>
            ))}
          </div>
          <Field label="Apply to">
            <Segmented
              label="Apply to"
              value={scope}
              onChange={setScope}
              options={[
                { value: 'all', label: 'All pages' },
                { value: 'page', label: `Page ${page} only` },
              ]}
            />
          </Field>
          {!untouched && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setMargins({ top: 0, right: 0, bottom: 0, left: 0 })}
            >
              Reset crop
            </button>
          )}
        </>
      }
      hint={untouched ? 'Move an edge of the crop box to start.' : null}
      disabled={untouched || !count}
      onAction={save}
    />
  )
}
