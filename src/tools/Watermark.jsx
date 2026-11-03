import { ImagePlus, TriangleAlert } from 'lucide-react'
import { useRef, useState } from 'react'
import PageThumb from '../components/PageThumb.jsx'
import ToolLayout from '../components/ToolLayout.jsx'
import { Field, NumberInput, Segmented, clampNum } from '../components/controls.jsx'
import { PDF_TYPE, baseName, canvasToBlob, range } from '../lib/files.js'
import { tileCenters } from '../lib/geometry.js'
import { useSession } from '../lib/hooks.js'
import { addWatermark } from '../lib/ops.js'
import { usePdfInfo } from '../lib/pdfjs.js'
import { CSS_FONTS } from './PageNumbers.jsx'

async function readWatermarkImage(file) {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close?.()
  // PNG keeps transparency, which most logos rely on.
  const blob = await canvasToBlob(canvas, file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', 0.92)
  const src = await new Promise((resolve) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.readAsDataURL(blob)
  })
  return { src, ratio: canvas.width / canvas.height }
}

function Preview({ dims, opts }) {
  const { mode, angle, layout, opacity } = opts
  let w
  let h
  if (mode === 'image') {
    w = (dims.width * opts.scale) / 100
    h = w / opts.image.ratio
  } else {
    // Approximate text metrics for the preview; the PDF uses exact font widths.
    w = opts.text.length * opts.fontSize * (opts.font === 'courier' ? 0.6 : 0.62)
    h = opts.fontSize * 0.72
  }
  const centers =
    layout === 'tile' ? tileCenters(dims.width, dims.height, w, h, angle) : [[dims.width / 2, dims.height / 2]]
  return centers.map(([cx, cy], i) => {
    const pos = {
      left: `${(cx / dims.width) * 100}%`,
      top: `${(1 - cy / dims.height) * 100}%`,
      transform: `translate(-50%, -50%) rotate(${-angle}deg)`,
      opacity,
    }
    return mode === 'image' ? (
      <img
        key={i}
        className="wm-image"
        src={opts.image.src}
        alt=""
        style={{ ...pos, width: `${(w / dims.width) * 100}%` }}
      />
    ) : (
      <span
        key={i}
        className="wm-text"
        style={{
          ...pos,
          fontSize: `${(opts.fontSize / dims.width) * 100}cqw`,
          fontFamily: CSS_FONTS[opts.font],
          color: opts.color,
        }}
      >
        {opts.text}
      </span>
    )
  })
}

export default function Watermark() {
  const { files, run, setError } = useSession()
  const item = files[0]
  const info = usePdfInfo(files)[item.id]
  const count = info?.pages ?? 0
  const imageInput = useRef(null)

  const [mode, setMode] = useState('text')
  const [text, setText] = useState('CONFIDENTIAL')
  const [font, setFont] = useState('helvetica')
  const [fontSize, setFontSize] = useState(64)
  const [color, setColor] = useState('#e5484d')
  const [image, setImage] = useState(null)
  const [scale, setScale] = useState(40)
  const [opacity, setOpacity] = useState(0.3)
  const [angle, setAngle] = useState(45)
  const [layout, setLayout] = useState('center')

  const opts = {
    mode,
    text,
    font,
    fontSize: clampNum(fontSize, 6, 300, 64),
    color,
    image,
    scale,
    opacity,
    angle: Number(angle),
    layout,
  }
  const ready = mode === 'image' ? !!image : !!text.trim()

  const pickImage = async (file) => {
    try {
      setImage(await readWatermarkImage(file))
    } catch {
      setError('That image couldn’t be read. Try a PNG or JPG.')
    }
  }

  const save = () =>
    run(async () => ({
      files: [
        {
          name: `${baseName(item.file.name)}-watermarked.pdf`,
          type: PDF_TYPE,
          data: await addWatermark(item.file, { ...opts, image: image?.src }),
        },
      ],
    }))

  return (
    <ToolLayout
      main={
        info?.error ? (
          <div className="alert inline-alert">
            <TriangleAlert size={18} /> “{item.file.name}” can’t be opened ({info.error}).
          </div>
        ) : (
          <div className="page-grid is-large">
            {range(count).map((i) => (
              <div key={i} className="page-tile">
                <div className="page-frame">
                  <PageThumb file={item.file} page={i + 1} size={210}>
                    {(d) => ready && <Preview dims={d} opts={opts} />}
                  </PageThumb>
                </div>
                <div className="page-label">{i + 1}</div>
              </div>
            ))}
          </div>
        )
      }
      sidebar={
        <>
          <Segmented
            label="Watermark type"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'text', label: 'Text' },
              { value: 'image', label: 'Image' },
            ]}
          />

          {mode === 'text' ? (
            <>
              <Field label="Watermark text">
                <input className="text-input" value={text} onChange={(e) => setText(e.target.value)} maxLength={80} />
              </Field>
              <div className="field-grid">
                <Field label="Font">
                  <select className="text-input" value={font} onChange={(e) => setFont(e.target.value)}>
                    <option value="helvetica">Helvetica</option>
                    <option value="times">Times</option>
                    <option value="courier">Courier</option>
                  </select>
                </Field>
                <Field label="Size">
                  <NumberInput value={fontSize} min={6} max={300} onChange={setFontSize} suffix="pt" />
                </Field>
                <Field label="Color">
                  <input
                    type="color"
                    className="color-input"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                  />
                </Field>
              </div>
            </>
          ) : (
            <>
              <button type="button" className="wm-pick" onClick={() => imageInput.current.click()}>
                {image ? <img src={image.src} alt="Watermark" /> : <ImagePlus size={26} />}
                <span>{image ? 'Choose a different image' : 'Choose a logo or image'}</span>
              </button>
              <input
                ref={imageInput}
                type="file"
                hidden
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(e) => {
                  if (e.target.files[0]) pickImage(e.target.files[0])
                  e.target.value = ''
                }}
              />
              <Field label={`Size — ${scale}% of page width`}>
                <input
                  type="range"
                  className="range-input"
                  min={5}
                  max={100}
                  step={1}
                  value={scale}
                  onChange={(e) => setScale(Number(e.target.value))}
                />
              </Field>
            </>
          )}

          <Field label="Layout">
            <Segmented
              label="Layout"
              value={layout}
              onChange={setLayout}
              options={[
                { value: 'center', label: 'Single, centered' },
                { value: 'tile', label: 'Tiled' },
              ]}
            />
          </Field>
          <Field label="Angle">
            <Segmented
              label="Angle"
              value={Number(angle)}
              onChange={setAngle}
              options={[
                { value: 0, label: '0°' },
                { value: 30, label: '30°' },
                { value: 45, label: '45°' },
                { value: -45, label: '−45°' },
                { value: 90, label: '90°' },
              ]}
            />
          </Field>
          <Field label={`Opacity — ${Math.round(opacity * 100)}%`}>
            <input
              type="range"
              className="range-input"
              min={0.05}
              max={1}
              step={0.05}
              value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
            />
          </Field>
        </>
      }
      hint={
        info?.error
          ? 'This file can’t be opened.'
          : !ready
            ? mode === 'image'
              ? 'Choose an image for your watermark.'
              : 'Type the text for your watermark.'
            : null
      }
      disabled={!count || !ready}
      onAction={save}
    />
  )
}
