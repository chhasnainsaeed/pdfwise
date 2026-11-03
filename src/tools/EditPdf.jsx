import {
  Bold,
  Eraser,
  Highlighter,
  ImagePlus,
  MousePointer2,
  Pencil,
  Square,
  Trash2,
  TriangleAlert,
  Type,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import PageThumb from '../components/PageThumb.jsx'
import ToolLayout from '../components/ToolLayout.jsx'
import { Checkbox, Field, NumberInput, Summary, clampNum } from '../components/controls.jsx'
import { LINE_HEIGHT, applyEdits } from '../lib/edit.js'
import { PDF_TYPE, baseName, canvasToBlob, range, uid } from '../lib/files.js'
import { useElementSize, useSession } from '../lib/hooks.js'
import { usePdfInfo } from '../lib/pdfjs.js'
import { CSS_FONTS } from './PageNumbers.jsx'

const MODES = [
  { id: 'select', label: 'Select', icon: MousePointer2 },
  { id: 'text', label: 'Text', icon: Type },
  { id: 'image', label: 'Image', icon: ImagePlus },
  { id: 'rect', label: 'Shape', icon: Square },
  { id: 'whiteout', label: 'Whiteout', icon: Eraser },
  { id: 'highlight', label: 'Highlight', icon: Highlighter },
  { id: 'draw', label: 'Draw', icon: Pencil },
]

const HINTS = {
  select: 'Click an item to select it, drag to move it, and press Delete to remove it. Double-click text to edit.',
  text: 'Click on a page where your text should start.',
  image: 'Click on a page to place the image.',
  rect: 'Drag on a page to draw a box.',
  whiteout: 'Drag over anything you want to cover with white.',
  highlight: 'Drag across the text you want to highlight.',
  draw: 'Draw freehand on any page.',
}

const DEFAULT_STYLE = {
  text: { size: 16, color: '#111111', font: 'helvetica', bold: false },
  rect: { fill: '', stroke: '#e03131', strokeWidth: 2, opacity: 1 },
  highlight: { color: '#ffd43b' },
  draw: { color: '#1c7ed6', width: 2.5 },
  image: { opacity: 1 },
}

const HIGHLIGHTS = ['#ffd43b', '#8ce99a', '#faa2c1', '#74c0fc']

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const styleGroup = (el) => (el.type === 'rect' ? (el.whiteout ? null : 'rect') : el.type)
const pathOf = (points) => points.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ')

async function loadImage(file) {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height))
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close?.()
  const isJpeg = file.type === 'image/jpeg'
  const blob = await canvasToBlob(canvas, isJpeg ? 'image/jpeg' : 'image/png', 0.92)
  const src = await new Promise((resolve) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.readAsDataURL(blob)
  })
  return { src, ratio: canvas.width / canvas.height }
}

function TextEditor({ el, css, onChange, onDone }) {
  const ref = useRef(null)
  useEffect(() => {
    // Deferred so the pointerdown that created the box can't steal focus back.
    const t = setTimeout(() => ref.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [])
  return (
    <div className="edit-text-wrap">
      <div className="edit-text is-mirror" style={css} aria-hidden="true">
        {(el.text || 'Type here') + '​'}
      </div>
      <textarea
        ref={ref}
        className="edit-textarea"
        style={css}
        value={el.text}
        placeholder="Type here"
        spellCheck={false}
        onChange={(e) => onChange({ text: e.target.value })}
        onBlur={onDone}
        onKeyDown={(e) => e.key === 'Escape' && e.currentTarget.blur()}
        onPointerDown={(e) => e.stopPropagation()}
      />
    </div>
  )
}

function EditItem({ el, scale, dims, selected, editing, onSelect, onChange, onEdit, onRemove, onEditDone }) {
  const drag = useRef(null)

  const down = (e, kind) => {
    if (editing) return
    e.stopPropagation()
    e.preventDefault()
    onSelect()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { kind, x: e.clientX, y: e.clientY, el }
  }

  const move = (e) => {
    const d = drag.current
    if (!d) return
    const dx = (e.clientX - d.x) / scale
    const dy = (e.clientY - d.y) / scale
    if (d.kind === 'move') {
      onChange({ x: clamp(d.el.x + dx, 0, dims.width - 8), y: clamp(d.el.y + dy, 0, dims.height - 8) })
    } else {
      let w = clamp(d.el.w + dx, 8, dims.width - d.el.x)
      let h = clamp(d.el.h + dy, 4, dims.height - d.el.y)
      if (el.type === 'image') {
        h = (w * d.el.h) / d.el.w
        if (d.el.y + h > dims.height) {
          h = dims.height - d.el.y
          w = (h * d.el.w) / d.el.h
        }
      }
      onChange({ w, h })
    }
  }

  const up = () => {
    drag.current = null
  }

  const box = { left: el.x * scale, top: el.y * scale }
  let body
  if (el.type === 'text') {
    const css = {
      fontSize: el.size * scale,
      color: el.color,
      fontFamily: CSS_FONTS[el.font],
      fontWeight: el.bold ? 700 : 400,
      lineHeight: LINE_HEIGHT,
    }
    body = editing ? (
      <TextEditor el={el} css={css} onChange={onChange} onDone={onEditDone} />
    ) : (
      <div className="edit-text" style={css}>
        {el.text}
      </div>
    )
  } else {
    box.width = el.w * scale
    box.height = el.h * scale
    if (el.type === 'image') body = <img src={el.src} alt="" draggable={false} style={{ opacity: el.opacity ?? 1 }} />
    if (el.type === 'rect') {
      body = (
        <div
          className="edit-fill"
          style={{
            background: el.fill || 'transparent',
            border:
              el.stroke && el.strokeWidth > 0 ? `${Math.max(1, el.strokeWidth * scale)}px solid ${el.stroke}` : 'none',
            opacity: el.opacity ?? 1,
          }}
        />
      )
    }
    if (el.type === 'highlight') body = <div className="edit-fill is-highlight" style={{ background: el.color }} />
  }

  return (
    <div
      className={`edit-item type-${el.type} ${selected ? 'is-selected' : ''} ${editing ? 'is-editing' : ''}`}
      style={box}
      onPointerDown={(e) => down(e, 'move')}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onDoubleClick={() => el.type === 'text' && onEdit()}
    >
      {body}
      {selected && !editing && (
        <>
          <button
            type="button"
            className="placement-remove"
            aria-label="Delete item"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onRemove}
          >
            <X size={13} strokeWidth={3} />
          </button>
          {el.type !== 'text' && <span className="placement-resize" onPointerDown={(e) => down(e, 'resize')} />}
        </>
      )}
    </div>
  )
}

function DrawItem({ el, scale, dims, selected, onSelect, onChange }) {
  const drag = useRef(null)
  const down = (e) => {
    e.stopPropagation()
    e.preventDefault()
    onSelect()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, points: el.points }
  }
  const move = (e) => {
    const d = drag.current
    if (!d) return
    const xs = d.points.map((p) => p[0])
    const ys = d.points.map((p) => p[1])
    const dx = clamp((e.clientX - d.x) / scale, -Math.min(...xs), dims.width - Math.max(...xs))
    const dy = clamp((e.clientY - d.y) / scale, -Math.min(...ys), dims.height - Math.max(...ys))
    onChange({ points: d.points.map(([x, y]) => [x + dx, y + dy]) })
  }
  const up = () => {
    drag.current = null
  }
  const d = pathOf(el.points)
  return (
    <g className={selected ? 'is-selected' : ''}>
      {selected && <path d={d} className="draw-outline" strokeWidth={el.width + 6 / scale} />}
      <path d={d} stroke={el.color} strokeWidth={el.width} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d={d}
        className="draw-hit"
        strokeWidth={Math.max(el.width, 12 / scale)}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      />
    </g>
  )
}

function EditLayer({ page, dims, mode, style, pendingImage, elements, selected, editing, actions }) {
  const scale = dims.boxW / dims.width
  const draft = useRef(null)
  const [preview, setPreview] = useState(null)
  const base = { page, pageW: dims.width, pageH: dims.height }

  const toPt = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    return [clamp((e.clientX - r.left) / scale, 0, dims.width), clamp((e.clientY - r.top) / scale, 0, dims.height)]
  }

  const boxFrom = (d) => ({
    x: Math.min(d.x0, d.x1),
    y: Math.min(d.y0, d.y1),
    w: Math.abs(d.x1 - d.x0),
    h: Math.abs(d.y1 - d.y0),
  })

  const shapeFor = (kind, box) => {
    if (kind === 'highlight') return { type: 'highlight', ...box, color: style.highlight.color }
    if (kind === 'whiteout')
      return { type: 'rect', whiteout: true, ...box, fill: '#ffffff', stroke: '', strokeWidth: 0, opacity: 1 }
    return { type: 'rect', ...box, ...style.rect }
  }

  const down = (e) => {
    if (editing) return
    const [x, y] = toPt(e)
    if (mode === 'select') {
      actions.select(null)
      return
    }
    if (mode === 'text') {
      const size = style.text.size
      actions.add(
        { id: uid(), type: 'text', ...base, ...style.text, x, y: Math.max(0, y - size * 0.6), text: '' },
        { edit: true },
      )
      return
    }
    if (mode === 'image') {
      if (!pendingImage) return
      let w = Math.min(200, dims.width * 0.4)
      let h = w / pendingImage.ratio
      if (h > dims.height * 0.5) {
        h = dims.height * 0.5
        w = h * pendingImage.ratio
      }
      actions.add({
        id: uid(),
        type: 'image',
        ...base,
        src: pendingImage.src,
        opacity: style.image.opacity,
        x: clamp(x - w / 2, 0, dims.width - w),
        y: clamp(y - h / 2, 0, dims.height - h),
        w,
        h,
      })
      return
    }
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    if (mode === 'draw') {
      draft.current = { kind: 'draw', points: [[x, y]] }
      setPreview({ type: 'draw', points: [[x, y]], ...style.draw })
    } else {
      draft.current = { kind: mode, x0: x, y0: y, x1: x, y1: y }
      setPreview(shapeFor(mode, boxFrom(draft.current)))
    }
  }

  const move = (e) => {
    const d = draft.current
    if (!d) return
    const [x, y] = toPt(e)
    if (d.kind === 'draw') {
      const last = d.points[d.points.length - 1]
      if (Math.hypot(x - last[0], y - last[1]) < 1.2 / scale) return
      d.points.push([x, y])
      setPreview({ type: 'draw', points: [...d.points], ...style.draw })
    } else {
      d.x1 = x
      d.y1 = y
      setPreview(shapeFor(d.kind, boxFrom(d)))
    }
  }

  const up = () => {
    const d = draft.current
    draft.current = null
    setPreview(null)
    if (!d) return
    if (d.kind === 'draw') {
      if (d.points.length > 1)
        actions.add({ id: uid(), type: 'draw', ...base, ...style.draw, points: d.points }, { keepMode: true })
      return
    }
    let box = boxFrom(d)
    if (box.w < 4 && box.h < 4) {
      const [w, h] = d.kind === 'highlight' ? [140, 16] : [140, 70]
      box = { x: clamp(d.x0 - w / 2, 0, dims.width - w), y: clamp(d.y0 - h / 2, 0, dims.height - h), w, h }
    }
    actions.add({ id: uid(), ...base, ...shapeFor(d.kind, box) }, { keepMode: true })
  }

  const draws = elements.filter((el) => el.type === 'draw')
  const boxes = elements.filter((el) => el.type !== 'draw')

  return (
    <div
      className={`edit-layer mode-${mode}`}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      {boxes.map((el) => (
        <EditItem
          key={el.id}
          el={el}
          scale={scale}
          dims={dims}
          selected={selected === el.id}
          editing={editing === el.id}
          onSelect={() => actions.select(el.id)}
          onChange={(patch) => actions.update(el.id, patch)}
          onEdit={() => actions.edit(el.id)}
          onEditDone={() => actions.editDone(el.id)}
          onRemove={() => actions.remove(el.id)}
        />
      ))}
      {preview && preview.type !== 'draw' && (
        <div
          className="edit-item is-preview"
          style={{
            left: preview.x * scale,
            top: preview.y * scale,
            width: preview.w * scale,
            height: preview.h * scale,
          }}
        >
          <div
            className={`edit-fill ${preview.type === 'highlight' ? 'is-highlight' : ''}`}
            style={{
              background: preview.type === 'highlight' ? preview.color : preview.fill || 'transparent',
              border:
                preview.stroke && preview.strokeWidth
                  ? `${Math.max(1, preview.strokeWidth * scale)}px solid ${preview.stroke}`
                  : preview.whiteout
                    ? '1px dashed #adb5bd'
                    : 'none',
            }}
          />
        </div>
      )}
      <svg className="edit-svg" viewBox={`0 0 ${dims.width} ${dims.height}`} preserveAspectRatio="none">
        {draws.map((el) => (
          <DrawItem
            key={el.id}
            el={el}
            scale={scale}
            dims={dims}
            selected={selected === el.id}
            onSelect={() => actions.select(el.id)}
            onChange={(patch) => actions.update(el.id, patch)}
          />
        ))}
        {preview?.type === 'draw' && (
          <path
            d={pathOf(preview.points)}
            stroke={preview.color}
            strokeWidth={preview.width}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
    </div>
  )
}

export default function EditPdf() {
  const { files, run, setError } = useSession()
  const item = files[0]
  const info = usePdfInfo(files)[item.id]
  const count = info?.pages ?? 0
  const [elements, setElements] = useState([])
  const [mode, setMode] = useState('select')
  const [selected, setSelected] = useState(null)
  const [editing, setEditing] = useState(null)
  const [style, setStyle] = useState(DEFAULT_STYLE)
  const [pendingImage, setPendingImage] = useState(null)
  const imageInput = useRef(null)
  const [docRef, doc] = useElementSize()
  const pageWidth = Math.min(doc.width, 860)

  const sel = elements.find((e) => e.id === selected)

  const actions = {
    select: (id) => setSelected(id),
    update: (id, patch) => setElements((list) => list.map((e) => (e.id === id ? { ...e, ...patch } : e))),
    remove: (id) => {
      setElements((list) => list.filter((e) => e.id !== id))
      setSelected((s) => (s === id ? null : s))
      setEditing((s) => (s === id ? null : s))
    },
    add: (el, { edit, keepMode } = {}) => {
      setElements((list) => [...list, el])
      setSelected(el.id)
      if (edit) setEditing(el.id)
      if (!keepMode) setMode('select')
    },
    edit: (id) => {
      setSelected(id)
      setEditing(id)
    },
    editDone: (id) => {
      setEditing(null)
      setElements((list) => list.filter((e) => e.id !== id || e.type !== 'text' || e.text.trim()))
    },
  }

  useEffect(() => {
    if (!selected || editing) return
    const onKey = (e) => {
      if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        actions.remove(selected)
      } else if (e.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const chooseMode = (id) => {
    if (id === 'image') {
      imageInput.current.click()
      return
    }
    setMode(id)
    setSelected(null)
  }

  const onImage = async (file) => {
    try {
      setPendingImage(await loadImage(file))
      setMode('image')
      setSelected(null)
    } catch {
      setError('That image couldn’t be read. Try a JPG or PNG.')
    }
  }

  const group = sel ? styleGroup(sel) : mode === 'whiteout' || mode === 'select' ? null : mode
  const values = sel && group ? { ...style[group], ...sel } : group ? style[group] : null
  const setProp = (patch) => {
    if (!group) return
    setStyle((s) => ({ ...s, [group]: { ...s[group], ...patch } }))
    if (sel) actions.update(sel.id, patch)
  }

  const save = () =>
    run(async () => ({
      files: [
        {
          name: `${baseName(item.file.name)}-edited.pdf`,
          type: PDF_TYPE,
          data: await applyEdits(
            item.file,
            elements.filter((e) => e.type !== 'text' || e.text.trim()),
          ),
        },
      ],
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
            <div className="edit-toolbar" role="toolbar" aria-label="Editing tools">
              {MODES.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  className={`tool-btn ${mode === id ? 'is-active' : ''}`}
                  aria-pressed={mode === id}
                  onClick={() => chooseMode(id)}
                >
                  <Icon size={18} />
                  <span>{label}</span>
                </button>
              ))}
              <input
                ref={imageInput}
                type="file"
                hidden
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(e) => {
                  if (e.target.files[0]) onImage(e.target.files[0])
                  e.target.value = ''
                }}
              />
            </div>
            <p className="edit-hint">{HINTS[mode]}</p>
            <div className="sign-doc" ref={docRef}>
              {pageWidth > 0 &&
                range(count).map((i) => (
                  <div key={i} className="sign-page">
                    <PageThumb file={item.file} page={i + 1} fitW={pageWidth} fitH={100000}>
                      {(dims) => (
                        <EditLayer
                          page={i + 1}
                          dims={dims}
                          mode={mode}
                          style={style}
                          pendingImage={pendingImage}
                          elements={elements.filter((e) => e.page === i + 1)}
                          selected={selected}
                          editing={editing}
                          actions={actions}
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
          {group === 'text' && (
            <>
              <h3 className="side-title">Text</h3>
              {sel && (
                <button type="button" className="btn btn-outline" onClick={() => actions.edit(sel.id)}>
                  <Type size={18} /> Edit text
                </button>
              )}
              <div className="field-grid">
                <Field label="Font">
                  <select
                    className="text-input"
                    value={values.font}
                    onChange={(e) => setProp({ font: e.target.value })}
                  >
                    <option value="helvetica">Helvetica</option>
                    <option value="times">Times</option>
                    <option value="courier">Courier</option>
                  </select>
                </Field>
                <Field label="Size">
                  <NumberInput
                    value={values.size}
                    min={4}
                    max={144}
                    suffix="pt"
                    onChange={(v) => setProp({ size: clampNum(v, 4, 144, 16) })}
                  />
                </Field>
                <Field label="Color">
                  <input
                    type="color"
                    className="color-input"
                    value={values.color}
                    onChange={(e) => setProp({ color: e.target.value })}
                  />
                </Field>
              </div>
              <button
                type="button"
                className={`btn btn-outline ${values.bold ? 'is-on' : ''}`}
                aria-pressed={values.bold}
                onClick={() => setProp({ bold: !values.bold })}
              >
                <Bold size={18} /> Bold
              </button>
            </>
          )}
          {group === 'rect' && (
            <>
              <h3 className="side-title">Shape</h3>
              <div className="field-grid two">
                <Field label="Border">
                  <input
                    type="color"
                    className="color-input"
                    value={values.stroke || '#000000'}
                    onChange={(e) => setProp({ stroke: e.target.value })}
                  />
                </Field>
                <Field label="Border width">
                  <NumberInput
                    value={values.strokeWidth}
                    min={0}
                    max={20}
                    step={0.5}
                    suffix="pt"
                    onChange={(v) => setProp({ strokeWidth: clampNum(v, 0, 20, 0) })}
                  />
                </Field>
              </div>
              <Checkbox checked={!!values.fill} onChange={(on) => setProp({ fill: on ? '#ffe066' : '' })}>
                Fill the shape
              </Checkbox>
              {values.fill && (
                <Field label="Fill color">
                  <input
                    type="color"
                    className="color-input"
                    value={values.fill}
                    onChange={(e) => setProp({ fill: e.target.value })}
                  />
                </Field>
              )}
              <Field label={`Opacity — ${Math.round(values.opacity * 100)}%`}>
                <input
                  type="range"
                  className="range-input"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={values.opacity}
                  onChange={(e) => setProp({ opacity: Number(e.target.value) })}
                />
              </Field>
            </>
          )}
          {group === 'highlight' && (
            <>
              <h3 className="side-title">Highlight</h3>
              <div className="swatches" role="radiogroup" aria-label="Highlight color">
                {HIGHLIGHTS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={values.color === c}
                    aria-label={c}
                    className={`swatch ${values.color === c ? 'is-active' : ''}`}
                    style={{ background: c }}
                    onClick={() => setProp({ color: c })}
                  />
                ))}
              </div>
            </>
          )}
          {group === 'draw' && (
            <>
              <h3 className="side-title">Pen</h3>
              <div className="field-grid two">
                <Field label="Color">
                  <input
                    type="color"
                    className="color-input"
                    value={values.color}
                    onChange={(e) => setProp({ color: e.target.value })}
                  />
                </Field>
                <Field label="Width">
                  <NumberInput
                    value={values.width}
                    min={0.5}
                    max={20}
                    step={0.5}
                    suffix="pt"
                    onChange={(v) => setProp({ width: clampNum(v, 0.5, 20, 2.5) })}
                  />
                </Field>
              </div>
            </>
          )}
          {group === 'image' && (
            <>
              <h3 className="side-title">Image</h3>
              {pendingImage && !sel && (
                <img className="edit-image-preview" src={pendingImage.src} alt="Image to place" />
              )}
              <Field label={`Opacity — ${Math.round(values.opacity * 100)}%`}>
                <input
                  type="range"
                  className="range-input"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={values.opacity}
                  onChange={(e) => setProp({ opacity: Number(e.target.value) })}
                />
              </Field>
            </>
          )}
          {(mode === 'whiteout' || sel?.whiteout) && (
            <p className="side-text small">
              Whiteout hides content visually. The original text is still inside the file, so don’t rely on it to redact
              sensitive information.
            </p>
          )}
          {!group && mode === 'select' && !sel && (
            <p className="side-text">
              Pick a tool above the document: add text, images, shapes and highlights, cover things up with whiteout, or
              draw freehand.
            </p>
          )}
          {sel && (
            <button type="button" className="btn btn-ghost" onClick={() => actions.remove(sel.id)}>
              <Trash2 size={18} /> Delete selected item
            </button>
          )}
          <Summary rows={[['Edits', elements.length]]} />
        </>
      }
      hint={elements.length === 0 ? 'Add at least one edit to save.' : null}
      disabled={elements.length === 0 || !!editing}
      onAction={save}
    />
  )
}
