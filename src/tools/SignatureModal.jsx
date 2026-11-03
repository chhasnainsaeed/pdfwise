import { Eraser, ImagePlus, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Checkbox, Segmented } from '../components/controls.jsx'
// Handwriting fonts, self-hosted, and only loaded with the Sign tool (latin subsets).
import '@fontsource/caveat/latin-600.css'
import '@fontsource/dancing-script/latin-600.css'
import '@fontsource/homemade-apple/latin-400.css'

const FONTS = [
  { family: 'Dancing Script', label: 'Elegant' },
  { family: 'Caveat', label: 'Casual' },
  { family: 'Homemade Apple', label: 'Handwritten' },
]
const COLORS = ['#111827', '#1d4ed8', '#b91c1c']

function makeCanvas(w, h) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

/** Crops a canvas to its non-transparent pixels, plus a little padding. */
function trimCanvas(canvas, pad = 6) {
  const { width, height } = canvas
  const data = canvas.getContext('2d').getImageData(0, 0, width, height).data
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 10) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null
  const w = maxX - minX + 1
  const h = maxY - minY + 1
  const out = makeCanvas(w + pad * 2, h + pad * 2)
  out.getContext('2d').drawImage(canvas, minX, minY, w, h, pad, pad, w, h)
  return out
}

function recolor(canvas, color) {
  const ctx = canvas.getContext('2d')
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalCompositeOperation = 'source-in'
  ctx.fillStyle = color
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.restore()
}

function DrawPad({ color, canvasRef, onInk }) {
  const points = useRef([])
  const drawing = useRef(false)

  useEffect(() => {
    const c = canvasRef.current
    const dpr = window.devicePixelRatio || 1
    const rect = c.getBoundingClientRect()
    c.width = Math.round(rect.width * dpr)
    c.height = Math.round(rect.height * dpr)
    const ctx = c.getContext('2d')
    ctx.scale(dpr, dpr)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 2.6
  }, [canvasRef])

  useEffect(() => {
    recolor(canvasRef.current, color)
  }, [color, canvasRef])

  const pos = (e) => {
    const r = canvasRef.current.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const down = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = true
    const p = pos(e)
    points.current = [p]
    const ctx = canvasRef.current.getContext('2d')
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(p.x, p.y, 1.3, 0, Math.PI * 2)
    ctx.fill()
    onInk(true)
  }

  const move = (e) => {
    if (!drawing.current) return
    const pts = points.current
    pts.push(pos(e))
    const ctx = canvasRef.current.getContext('2d')
    ctx.strokeStyle = color
    const n = pts.length
    if (n < 3) {
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      ctx.lineTo(pts[n - 1].x, pts[n - 1].y)
      ctx.stroke()
      return
    }
    const [a, b, c] = pts.slice(-3)
    ctx.beginPath()
    ctx.moveTo((a.x + b.x) / 2, (a.y + b.y) / 2)
    ctx.quadraticCurveTo(b.x, b.y, (b.x + c.x) / 2, (b.y + c.y) / 2)
    ctx.stroke()
  }

  const up = () => {
    drawing.current = false
  }

  return (
    <canvas
      ref={canvasRef}
      className="sig-pad"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    />
  )
}

async function renderTyped(text, family, color) {
  await document.fonts.load(`120px "${family}"`)
  const probe = makeCanvas(10, 10).getContext('2d')
  probe.font = `120px "${family}"`
  const width = Math.ceil(probe.measureText(text).width) + 120
  const c = makeCanvas(Math.max(width, 200), 320)
  const ctx = c.getContext('2d')
  ctx.font = `120px "${family}"`
  ctx.fillStyle = color
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 60, 160)
  return c
}

async function renderUpload(file, removeBg) {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, 1400 / Math.max(bmp.width, bmp.height))
  const c = makeCanvas(Math.round(bmp.width * scale), Math.round(bmp.height * scale))
  const ctx = c.getContext('2d')
  ctx.drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close?.()
  if (removeBg) {
    const img = ctx.getImageData(0, 0, c.width, c.height)
    const d = img.data
    for (let i = 0; i < d.length; i += 4) {
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
      if (lum > 235) d[i + 3] = 0
      else if (lum > 195) d[i + 3] = Math.round(d[i + 3] * ((235 - lum) / 40))
    }
    ctx.putImageData(img, 0, 0)
  }
  return c
}

export default function SignatureModal({ onSave, onClose, canClose }) {
  const [tab, setTab] = useState('draw')
  const [color, setColor] = useState(COLORS[0])
  const [hasInk, setHasInk] = useState(false)
  const [name, setName] = useState('')
  const [family, setFamily] = useState(FONTS[0].family)
  const [upload, setUpload] = useState(null)
  const [uploadUrl, setUploadUrl] = useState(null)
  const [removeBg, setRemoveBg] = useState(true)
  const [busy, setBusy] = useState(false)
  const padRef = useRef(null)
  const fileInput = useRef(null)

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && canClose && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, canClose])

  useEffect(() => {
    if (!upload) return
    const u = URL.createObjectURL(upload)
    setUploadUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [upload])

  const clearPad = () => {
    const c = padRef.current
    c.getContext('2d').clearRect(0, 0, c.width, c.height)
    setHasInk(false)
  }

  const ready = tab === 'draw' ? hasInk : tab === 'type' ? name.trim().length > 0 : !!upload

  const save = async () => {
    setBusy(true)
    try {
      let canvas
      if (tab === 'draw') canvas = padRef.current
      else if (tab === 'type') canvas = await renderTyped(name.trim(), family, color)
      else canvas = await renderUpload(upload, removeBg)
      const trimmed = trimCanvas(canvas)
      if (trimmed) onSave({ url: trimmed.toDataURL('image/png'), ratio: trimmed.width / trimmed.height })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && canClose && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="sig-title">
        <header className="modal-head">
          <h2 id="sig-title">Create your signature</h2>
          {canClose && (
            <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
              <X />
            </button>
          )}
        </header>

        <Segmented
          label="Signature type"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'draw', label: 'Draw' },
            { value: 'type', label: 'Type' },
            { value: 'upload', label: 'Upload' },
          ]}
        />

        <div className="modal-body">
          {tab === 'draw' && (
            <div className="pad-wrap">
              <DrawPad color={color} canvasRef={padRef} onInk={setHasInk} />
              {!hasInk && <span className="pad-placeholder">Sign here with your mouse, finger or stylus</span>}
              {hasInk && (
                <button type="button" className="btn btn-ghost pad-clear" onClick={clearPad}>
                  <Eraser size={16} /> Clear
                </button>
              )}
            </div>
          )}

          {tab === 'type' && (
            <div className="type-wrap">
              <input
                className="text-input"
                placeholder="Type your full name"
                value={name}
                autoFocus
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
              />
              <div className="font-options">
                {FONTS.map((f) => (
                  <button
                    key={f.family}
                    type="button"
                    className={`font-option ${family === f.family ? 'is-active' : ''}`}
                    style={{ fontFamily: `"${f.family}", cursive`, color }}
                    onClick={() => setFamily(f.family)}
                  >
                    {name.trim() || 'Your Name'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {tab === 'upload' && (
            <div className="upload-wrap">
              {uploadUrl ? (
                <img src={uploadUrl} alt="Uploaded signature" className="upload-preview" />
              ) : (
                <button type="button" className="upload-drop" onClick={() => fileInput.current.click()}>
                  <ImagePlus size={28} />
                  <span>Choose an image of your signature</span>
                </button>
              )}
              <input
                ref={fileInput}
                type="file"
                hidden
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => e.target.files[0] && setUpload(e.target.files[0])}
              />
              {uploadUrl && (
                <div className="btn-row">
                  <button type="button" className="btn btn-ghost" onClick={() => fileInput.current.click()}>
                    Choose another
                  </button>
                </div>
              )}
              <Checkbox checked={removeBg} onChange={setRemoveBg}>
                Make the white background transparent
              </Checkbox>
            </div>
          )}
        </div>

        <footer className="modal-foot">
          {tab !== 'upload' ? (
            <div className="swatches" role="radiogroup" aria-label="Ink color">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={color === c}
                  aria-label={`Ink ${c}`}
                  className={`swatch ${color === c ? 'is-active' : ''}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          ) : (
            <span />
          )}
          <button type="button" className="btn btn-primary" disabled={!ready || busy} onClick={save}>
            Use this signature
          </button>
        </footer>
      </div>
    </div>
  )
}
