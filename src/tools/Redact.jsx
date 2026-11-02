import { Search, Trash2, TriangleAlert, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import PageThumb from '../components/PageThumb.jsx'
import ToolLayout from '../components/ToolLayout.jsx'
import { Checkbox, Field, Summary } from '../components/controls.jsx'
import { PDF_TYPE, baseName, pluralize, range, uid } from '../lib/files.js'
import { useElementSize, useSession } from '../lib/hooks.js'
import { usePdfInfo } from '../lib/pdfjs.js'
import { applyRedactions, findText } from '../lib/redact.js'

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

function Box({ box, scale, dims, onChange, onRemove }) {
  const drag = useRef(null)
  const down = (e, kind) => {
    e.stopPropagation()
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { kind, x: e.clientX, y: e.clientY, box }
  }
  const move = (e) => {
    const d = drag.current
    if (!d) return
    const dx = (e.clientX - d.x) / scale
    const dy = (e.clientY - d.y) / scale
    if (d.kind === 'move') onChange({ x: clamp(d.box.x + dx, 0, dims.width - d.box.w), y: clamp(d.box.y + dy, 0, dims.height - d.box.h) })
    else onChange({ w: clamp(d.box.w + dx, 4, dims.width - d.box.x), h: clamp(d.box.h + dy, 4, dims.height - d.box.y) })
  }
  const up = () => {
    drag.current = null
  }
  return (
    <div
      className="redact-box"
      style={{ left: box.x * scale, top: box.y * scale, width: box.w * scale, height: box.h * scale }}
      onPointerDown={(e) => down(e, 'move')}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      <button type="button" className="placement-remove" aria-label="Remove redaction" onPointerDown={(e) => e.stopPropagation()} onClick={onRemove}>
        <X size={13} strokeWidth={3} />
      </button>
      <span className="placement-resize" onPointerDown={(e) => down(e, 'resize')} />
    </div>
  )
}

function RedactLayer({ page, dims, boxes, onAdd, onChange, onRemove }) {
  const scale = dims.boxW / dims.width
  const draft = useRef(null)
  const [preview, setPreview] = useState(null)
  const toPt = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    return [clamp((e.clientX - r.left) / scale, 0, dims.width), clamp((e.clientY - r.top) / scale, 0, dims.height)]
  }
  const rect = (d) => ({ x: Math.min(d.x0, d.x1), y: Math.min(d.y0, d.y1), w: Math.abs(d.x1 - d.x0), h: Math.abs(d.y1 - d.y0) })
  return (
    <div
      className="edit-layer mode-rect"
      onPointerDown={(e) => {
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        const [x, y] = toPt(e)
        draft.current = { x0: x, y0: y, x1: x, y1: y }
        setPreview(rect(draft.current))
      }}
      onPointerMove={(e) => {
        if (!draft.current) return
        ;[draft.current.x1, draft.current.y1] = toPt(e)
        setPreview(rect(draft.current))
      }}
      onPointerUp={() => {
        const d = draft.current
        draft.current = null
        setPreview(null)
        if (!d) return
        const r = rect(d)
        if (r.w >= 3 && r.h >= 3) onAdd({ id: uid(), page, ...r, pageW: dims.width, pageH: dims.height })
      }}
    >
      {boxes.map((b) => (
        <Box key={b.id} box={b} scale={scale} dims={dims} onChange={(patch) => onChange(b.id, patch)} onRemove={() => onRemove(b.id)} />
      ))}
      {preview && <div className="redact-box is-preview" style={{ left: preview.x * scale, top: preview.y * scale, width: preview.w * scale, height: preview.h * scale }} />}
    </div>
  )
}

export default function Redact() {
  const { files, run, setError } = useSession()
  const item = files[0]
  const info = usePdfInfo(files)[item.id]
  const count = info?.pages ?? 0
  const [boxes, setBoxes] = useState([])
  const [query, setQuery] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [searching, setSearching] = useState(false)
  const [lastSearch, setLastSearch] = useState(null)
  const [keepMetadata, setKeepMetadata] = useState(false)
  const [docRef, doc] = useElementSize()
  const pageWidth = Math.min(doc.width, 860)

  useEffect(() => setLastSearch(null), [query, caseSensitive, wholeWord])

  const search = async () => {
    setSearching(true)
    try {
      const found = await findText(item.file, query, { caseSensitive, wholeWord })
      setBoxes((list) => [...list, ...found.map((b) => ({ ...b, id: uid(), fromSearch: true }))])
      setLastSearch(found.length)
    } catch {
      setError('Couldn’t search this PDF’s text.')
    } finally {
      setSearching(false)
    }
  }

  const pagesAffected = new Set(boxes.map((b) => b.page)).size

  const save = () =>
    run(async ({ progress }) => ({
      files: [{ name: `${baseName(item.file.name)}-redacted.pdf`, type: PDF_TYPE, data: await applyRedactions(item.file, boxes, { keepMetadata }, progress) }],
      note: `${pluralize(boxes.length, 'area')} redacted on ${pluralize(pagesAffected, 'page')}. Those pages are now images; run OCR PDF if you need their remaining text to be searchable.`,
    }))

  return (
    <ToolLayout
      mainClass="is-doc"
      main={
        info?.error ? (
          <div className="alert inline-alert">
            <TriangleAlert size={18} /> “{item.file.name}” can’t be opened ({info.error}).
          </div>
        ) : (
          <>
            <p className="edit-hint">Drag over anything you want to black out, or search for text in the panel.</p>
            <div className="sign-doc" ref={docRef}>
              {pageWidth > 0 &&
                range(count).map((i) => (
                  <div key={i} className="sign-page">
                    <PageThumb file={item.file} page={i + 1} fitW={pageWidth} fitH={100000}>
                      {(dims) => (
                        <RedactLayer
                          page={i + 1}
                          dims={dims}
                          boxes={boxes.filter((b) => b.page === i + 1)}
                          onAdd={(b) => setBoxes((list) => [...list, b])}
                          onChange={(id, patch) => setBoxes((list) => list.map((b) => (b.id === id ? { ...b, ...patch } : b)))}
                          onRemove={(id) => setBoxes((list) => list.filter((b) => b.id !== id))}
                        />
                      )}
                    </PageThumb>
                    <div className="page-label">
                      Page {i + 1} of {count}
                    </div>
                  </div>
                ))}
            </div>
          </>
        )
      }
      sidebar={
        <>
          <Field label="Find text to redact" hint={lastSearch === null ? 'Every match is marked; remove any you want to keep.' : `${lastSearch} match${lastSearch === 1 ? '' : 'es'} marked.`}>
            <form
              className="search-row"
              onSubmit={(e) => {
                e.preventDefault()
                if (query.trim() && !searching) search()
              }}
            >
              <input className="text-input" value={query} placeholder="Name, email, account number…" onChange={(e) => setQuery(e.target.value)} />
              <button type="submit" className="btn btn-outline" disabled={!query.trim() || searching}>
                <Search size={18} />
              </button>
            </form>
          </Field>
          <div className="check-list">
            <Checkbox checked={caseSensitive} onChange={setCaseSensitive}>
              Match case
            </Checkbox>
            <Checkbox checked={wholeWord} onChange={setWholeWord}>
              Whole words only
            </Checkbox>
            <Checkbox checked={keepMetadata} onChange={setKeepMetadata}>
              Keep the title and author
            </Checkbox>
          </div>
          {boxes.length > 0 && (
            <button type="button" className="btn btn-ghost" onClick={() => setBoxes([])}>
              <Trash2 size={18} /> Remove all marks
            </button>
          )}
          <Summary
            rows={[
              ['Areas marked', boxes.length],
              ['Pages affected', `${pagesAffected} of ${count || '…'}`],
            ]}
          />
          <p className="side-text small">
            Redaction is permanent. Marked pages are flattened into images with the areas blacked out, and the document is
            rebuilt so the hidden text, links and other content from those pages are gone — not just covered.
          </p>
        </>
      }
      hint={boxes.length === 0 ? 'Mark at least one area to redact.' : null}
      disabled={boxes.length === 0}
      onAction={save}
    />
  )
}
