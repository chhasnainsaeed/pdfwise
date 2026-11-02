import { Copy, PenLine, Trash2, TriangleAlert, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import PageThumb from '../components/PageThumb.jsx'
import ToolLayout from '../components/ToolLayout.jsx'
import { Summary } from '../components/controls.jsx'
import { PDF_TYPE, baseName, range, uid } from '../lib/files.js'
import { useElementSize, useSession } from '../lib/hooks.js'
import { signPdf } from '../lib/ops.js'
import { usePdfInfo } from '../lib/pdfjs.js'
import SignatureModal from './SignatureModal.jsx'

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

function Placement({ p, scale, dims, src, active, onSelect, onChange, onRemove }) {
  const drag = useRef(null)

  const down = (e, mode) => {
    e.stopPropagation()
    e.preventDefault()
    onSelect()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { mode, x: e.clientX, y: e.clientY, p }
  }

  const move = (e) => {
    const d = drag.current
    if (!d) return
    const dx = (e.clientX - d.x) / scale
    const dy = (e.clientY - d.y) / scale
    if (d.mode === 'move') {
      onChange({ ...d.p, x: clamp(d.p.x + dx, 0, dims.width - d.p.w), y: clamp(d.p.y + dy, 0, dims.height - d.p.h) })
    } else {
      const ratio = d.p.w / d.p.h
      let w = clamp(d.p.w + dx, 24, dims.width - d.p.x)
      let h = w / ratio
      if (d.p.y + h > dims.height) {
        h = dims.height - d.p.y
        w = h * ratio
      }
      onChange({ ...d.p, w, h })
    }
  }

  const up = () => {
    drag.current = null
  }

  return (
    <div
      className={`placement ${active ? 'is-active' : ''}`}
      style={{ left: p.x * scale, top: p.y * scale, width: p.w * scale, height: p.h * scale }}
      onPointerDown={(e) => down(e, 'move')}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onClick={(e) => e.stopPropagation()}
    >
      <img src={src} alt="Your signature" draggable={false} />
      <button
        type="button"
        className="placement-remove"
        aria-label="Remove signature"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
      >
        <X size={13} strokeWidth={3} />
      </button>
      <span className="placement-resize" onPointerDown={(e) => down(e, 'resize')} />
    </div>
  )
}

export default function Sign() {
  const { files, run } = useSession()
  const item = files[0]
  const info = usePdfInfo(files)[item.id]
  const count = info?.pages ?? 0
  const [sig, setSig] = useState(null)
  const [modal, setModal] = useState(true)
  const [placements, setPlacements] = useState([])
  const [active, setActive] = useState(null)
  const [docRef, doc] = useElementSize()
  const pageWidth = Math.min(doc.width, 820)

  useEffect(() => {
    if (!active) return
    const onKey = (e) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName)) {
        setPlacements((l) => l.filter((p) => p.id !== active))
        setActive(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])

  const saveSignature = (s) => {
    setSig(s)
    setModal(false)
    // Keep existing placements' widths, adopt the new signature's proportions.
    setPlacements((l) => l.map((p) => ({ ...p, h: Math.min(p.w / s.ratio, p.pageH - p.y) })))
  }

  const place = (page, dims, x, y) => {
    if (!sig) {
      setModal(true)
      return
    }
    let w = Math.min(170, dims.width * 0.35)
    let h = w / sig.ratio
    if (h > dims.height * 0.3) {
      h = dims.height * 0.3
      w = h * sig.ratio
    }
    const p = {
      id: uid(),
      page,
      x: clamp(x - w / 2, 0, dims.width - w),
      y: clamp(y - h / 2, 0, dims.height - h),
      w,
      h,
      pageW: dims.width,
      pageH: dims.height,
    }
    setPlacements((l) => [...l, p])
    setActive(p.id)
  }

  const copyToAll = () => {
    const src = placements.find((p) => p.id === active) ?? placements[placements.length - 1]
    if (!src) return
    const taken = new Set(placements.map((p) => p.page))
    const copies = range(count)
      .map((i) => i + 1)
      .filter((n) => !taken.has(n))
      .map((n) => ({ ...src, id: uid(), page: n }))
    setPlacements((l) => [...l, ...copies])
  }

  const save = () =>
    run(async () => ({
      files: [{ name: `${baseName(item.file.name)}-signed.pdf`, type: PDF_TYPE, data: await signPdf(item.file, sig.url, placements) }],
    }))

  const pagesSigned = new Set(placements.map((p) => p.page)).size

  return (
    <>
      <ToolLayout
        mainClass="is-doc"
        main={
          info?.error ? (
            <div className="alert inline-alert">
              <TriangleAlert size={18} /> “{item.file.name}” can’t be opened ({info.error}).
            </div>
          ) : (
            <div className="sign-doc" ref={docRef} onPointerDown={() => setActive(null)}>
              {pageWidth > 0 &&
                range(count).map((i) => (
                  <div key={i} className="sign-page">
                    <PageThumb file={item.file} page={i + 1} fitW={pageWidth} fitH={100000}>
                      {(dims) => {
                        const scale = dims.boxW / dims.width
                        return (
                          <div
                            className={`sign-layer ${sig ? 'can-place' : ''}`}
                            onClick={(e) => {
                              const r = e.currentTarget.getBoundingClientRect()
                              place(i + 1, dims, (e.clientX - r.left) / scale, (e.clientY - r.top) / scale)
                            }}
                          >
                            {sig &&
                              placements
                                .filter((p) => p.page === i + 1)
                                .map((p) => (
                                  <Placement
                                    key={p.id}
                                    p={p}
                                    scale={scale}
                                    dims={dims}
                                    src={sig.url}
                                    active={active === p.id}
                                    onSelect={() => setActive(p.id)}
                                    onChange={(n) => setPlacements((l) => l.map((x) => (x.id === p.id ? n : x)))}
                                    onRemove={() => setPlacements((l) => l.filter((x) => x.id !== p.id))}
                                  />
                                ))}
                          </div>
                        )
                      }}
                    </PageThumb>
                    <div className="page-label">
                      Page {i + 1} of {count}
                    </div>
                  </div>
                ))}
            </div>
          )
        }
        sidebar={
          <>
            <div className="sig-card">
              {sig ? (
                <img src={sig.url} alt="Your signature" />
              ) : (
                <span className="muted">No signature yet</span>
              )}
            </div>
            <button type="button" className="btn btn-outline" onClick={() => setModal(true)}>
              <PenLine size={18} /> {sig ? 'Change signature' : 'Create signature'}
            </button>
            {sig && (
              <p className="side-text">
                Click anywhere on a page to place your signature. Drag it to move, pull the corner to resize.
              </p>
            )}
            {placements.length > 0 && (
              <div className="btn-row">
                <button type="button" className="btn btn-outline" onClick={copyToAll} disabled={pagesSigned >= count}>
                  <Copy size={18} /> Every page
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => {
                    setPlacements([])
                    setActive(null)
                  }}
                >
                  <Trash2 size={18} /> Clear all
                </button>
              </div>
            )}
            <Summary
              rows={[
                ['Signatures placed', placements.length],
                ['Pages signed', `${pagesSigned} of ${count || '…'}`],
              ]}
            />
          </>
        }
        hint={!sig ? 'Create your signature to get started.' : placements.length === 0 ? 'Place your signature on at least one page.' : null}
        disabled={!sig || placements.length === 0}
        onAction={save}
      />
      {modal && <SignatureModal canClose={!!sig} onClose={() => setModal(false)} onSave={saveSignature} />}
    </>
  )
}
