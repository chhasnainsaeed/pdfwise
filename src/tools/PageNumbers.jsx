import { TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import PageThumb from '../components/PageThumb.jsx'
import ToolLayout from '../components/ToolLayout.jsx'
import { Field, NumberInput, Segmented, clampNum } from '../components/controls.jsx'
import { PDF_TYPE, baseName, range } from '../lib/files.js'
import { useSession } from '../lib/hooks.js'
import { addPageNumbers } from '../lib/ops.js'
import { usePdfInfo } from '../lib/pdfjs.js'

const POSITIONS = ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right']
const MARGINS = { small: 18, recommended: 30, big: 48 }
const FORMATS = [
  { value: '{n}', label: '1' },
  { value: 'Page {n}', label: 'Page 1' },
  { value: '{n} / {total}', label: '1 / 12' },
  { value: 'Page {n} of {total}', label: 'Page 1 of 12' },
  { value: '- {n} -', label: '- 1 -' },
  { value: 'custom', label: 'Custom…' },
]
export const CSS_FONTS = {
  helvetica: 'Helvetica, Arial, sans-serif',
  times: '"Times New Roman", Times, serif',
  courier: '"Courier New", Courier, monospace',
}

export function PositionPicker({ value, onChange }) {
  return (
    <div className="pos-picker" role="radiogroup" aria-label="Position">
      {POSITIONS.map((p) => (
        <button
          key={p}
          type="button"
          role="radio"
          aria-checked={value === p}
          aria-label={p.replace('-', ' ')}
          className={`pos-spot pos-${p} ${value === p ? 'is-active' : ''}`}
          onClick={() => onChange(p)}
        >
          <span />
        </button>
      ))}
    </div>
  )
}

export default function PageNumbers() {
  const { files, run } = useSession()
  const item = files[0]
  const info = usePdfInfo(files)[item.id]
  const count = info?.pages ?? 0

  const [position, setPosition] = useState('bottom-center')
  const [marginId, setMarginId] = useState('recommended')
  const [format, setFormat] = useState('{n}')
  const [custom, setCustom] = useState('Page {n}')
  const [start, setStart] = useState(1)
  const [from, setFrom] = useState(1)
  const [to, setTo] = useState('')
  const [fontSize, setFontSize] = useState(11)
  const [font, setFont] = useState('helvetica')
  const [color, setColor] = useState('#222222')

  useEffect(() => {
    if (count && to === '') setTo(count)
  }, [count, to])

  const opts = {
    position,
    margin: MARGINS[marginId],
    format: format === 'custom' ? custom : format,
    start: clampNum(start, 0, 99999, 1),
    from: clampNum(from, 1, count || 1, 1),
    to: clampNum(to, 1, count || 1, count || 1),
    fontSize: clampNum(fontSize, 4, 96, 11),
    font,
    color,
  }
  if (opts.from > opts.to) [opts.from, opts.to] = [opts.to, opts.from]
  const total = opts.start + (opts.to - opts.from)
  const label = (i) =>
    opts.format.replace(/\{n\}/g, String(opts.start + i - (opts.from - 1))).replace(/\{total\}/g, String(total))

  const [vert, horiz] = position.split('-')

  const save = () =>
    run(async () => ({
      files: [
        {
          name: `${baseName(item.file.name)}-numbered.pdf`,
          type: PDF_TYPE,
          data: await addPageNumbers(item.file, opts),
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
          <div className="page-grid">
            {range(count).map((i) => {
              const numbered = i >= opts.from - 1 && i < opts.to
              return (
                <div key={i} className="page-tile">
                  <div className="page-frame">
                    <PageThumb file={item.file} page={i + 1} size={150}>
                      {(d) =>
                        numbered && (
                          <span
                            className={`stamp-text h-${horiz}`}
                            style={{
                              fontSize: `${(opts.fontSize / d.width) * 100}cqw`,
                              fontFamily: CSS_FONTS[font],
                              color,
                              [vert]: `${(opts.margin / d.height) * 100}%`,
                              ...(horiz === 'left' && { left: `${(opts.margin / d.width) * 100}%` }),
                              ...(horiz === 'right' && { right: `${(opts.margin / d.width) * 100}%` }),
                            }}
                          >
                            {label(i)}
                          </span>
                        )
                      }
                    </PageThumb>
                  </div>
                  <div className="page-label">{i + 1}</div>
                </div>
              )
            })}
          </div>
        )
      }
      sidebar={
        <>
          <Field label="Position">
            <PositionPicker value={position} onChange={setPosition} />
          </Field>
          <Field label="Margin">
            <Segmented
              label="Margin"
              value={marginId}
              onChange={setMarginId}
              options={[
                { value: 'small', label: 'Small' },
                { value: 'recommended', label: 'Normal' },
                { value: 'big', label: 'Big' },
              ]}
            />
          </Field>
          <Field label="Text">
            <select className="text-input" value={format} onChange={(e) => setFormat(e.target.value)}>
              {FORMATS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </Field>
          {format === 'custom' && (
            <Field hint="Use {n} for the page number and {total} for the last number.">
              <input className="text-input" value={custom} onChange={(e) => setCustom(e.target.value)} />
            </Field>
          )}
          <div className="field-grid">
            <Field label="Pages from">
              <NumberInput value={from} min={1} max={count} onChange={setFrom} />
            </Field>
            <Field label="to">
              <NumberInput value={to} min={1} max={count} onChange={setTo} />
            </Field>
            <Field label="First number">
              <NumberInput value={start} min={0} onChange={setStart} />
            </Field>
          </div>
          <div className="field-grid">
            <Field label="Font">
              <select className="text-input" value={font} onChange={(e) => setFont(e.target.value)}>
                <option value="helvetica">Helvetica</option>
                <option value="times">Times</option>
                <option value="courier">Courier</option>
              </select>
            </Field>
            <Field label="Size">
              <NumberInput value={fontSize} min={4} max={96} onChange={setFontSize} suffix="pt" />
            </Field>
            <Field label="Color">
              <input type="color" className="color-input" value={color} onChange={(e) => setColor(e.target.value)} />
            </Field>
          </div>
        </>
      }
      hint={info?.error ? 'This file can’t be opened.' : null}
      disabled={!count || !opts.format.trim()}
      onAction={save}
    />
  )
}
