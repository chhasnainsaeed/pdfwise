import { Check, Trash2, TriangleAlert } from 'lucide-react'
import { useRef, useState } from 'react'
import PageThumb from '../components/PageThumb.jsx'
import ToolLayout from '../components/ToolLayout.jsx'
import { Checkbox, Field, Summary } from '../components/controls.jsx'
import { PDF_TYPE, baseName, range } from '../lib/files.js'
import { useSession } from '../lib/hooks.js'
import { buildFromPages } from '../lib/ops.js'
import { usePdfInfo } from '../lib/pdfjs.js'
import { formatPageList, parsePageList } from '../lib/ranges.js'

/** Shared workspace for "Remove pages" (mode="remove") and "Extract pages" (mode="extract"). */
export default function PagePicker({ mode }) {
  const { files, run } = useSession()
  const item = files[0]
  const info = usePdfInfo(files)[item.id]
  const count = info?.pages ?? 0
  const [selected, setSelected] = useState(() => new Set())
  const [text, setText] = useState('')
  const [textError, setTextError] = useState('')
  const [separate, setSeparate] = useState(false)
  const anchor = useRef(null)
  const removing = mode === 'remove'

  const apply = (set) => {
    setSelected(set)
    setText(formatPageList(set))
    setTextError('')
  }

  const toggle = (i, e) => {
    const next = new Set(selected)
    if (e.shiftKey && anchor.current !== null) {
      const [a, b] = [anchor.current, i].sort((x, y) => x - y)
      for (let k = a; k <= b; k++) next.add(k)
    } else if (next.has(i)) next.delete(i)
    else next.add(i)
    anchor.current = i
    apply(next)
  }

  const onText = (value) => {
    setText(value)
    if (!value.trim()) {
      setSelected(new Set())
      setTextError('')
      return
    }
    const r = parsePageList(value, count)
    if (r.error) setTextError(r.error)
    else {
      setSelected(new Set(r.pages))
      setTextError('')
    }
  }

  const pick = (fn) => apply(new Set(range(count).filter(fn)))

  const keep = removing ? range(count).filter((i) => !selected.has(i)) : [...selected].sort((a, b) => a - b)

  const save = () =>
    run(async ({ progress }) => {
      const base = baseName(item.file.name)
      if (!removing && separate && keep.length > 1) {
        const out = []
        for (let k = 0; k < keep.length; k++) {
          out.push({
            name: `${base}-page-${keep[k] + 1}.pdf`,
            type: PDF_TYPE,
            data: await buildFromPages([{ file: item.file, index: keep[k] }]),
          })
          progress(k + 1, keep.length)
        }
        return { files: out, zipName: `${base}-pages.zip` }
      }
      return {
        files: [
          {
            name: `${base}-${removing ? 'edited' : 'extracted'}.pdf`,
            type: PDF_TYPE,
            data: await buildFromPages(keep.map((index) => ({ file: item.file, index }))),
          },
        ],
      }
    })

  let hint = null
  if (info?.error) hint = 'This file can’t be opened.'
  else if (selected.size === 0) hint = removing ? 'Click the pages you want to remove.' : 'Click the pages you want to keep.'
  else if (removing && keep.length === 0) hint = 'You can’t remove every page.'

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
              const on = selected.has(i)
              return (
                <button
                  key={i}
                  type="button"
                  aria-pressed={on}
                  className={`page-tile is-selectable ${on ? (removing ? 'is-removed' : 'is-picked') : ''}`}
                  onClick={(e) => toggle(i, e)}
                >
                  <div className="page-frame">
                    <PageThumb file={item.file} page={i + 1} size={150} />
                    {on && <span className="pick-badge">{removing ? <Trash2 size={16} /> : <Check size={16} strokeWidth={3} />}</span>}
                  </div>
                  <div className="page-label">{i + 1}</div>
                </button>
              )
            })}
          </div>
        )
      }
      sidebar={
        <>
          <Field
            label={removing ? 'Pages to remove' : 'Pages to extract'}
            error={textError}
            hint="Click pages, shift-click for a range, or type e.g. 1, 3-5, 9"
          >
            <input className="text-input" value={text} placeholder="e.g. 1, 3-5, 9" onChange={(e) => onText(e.target.value)} />
          </Field>
          <div className="chip-row">
            {!removing && (
              <button type="button" className="chip" onClick={() => pick(() => true)}>
                All
              </button>
            )}
            <button type="button" className="chip" onClick={() => pick((i) => i % 2 === 0)}>
              Odd
            </button>
            <button type="button" className="chip" onClick={() => pick((i) => i % 2 === 1)}>
              Even
            </button>
            <button type="button" className="chip" onClick={() => apply(new Set())}>
              Clear
            </button>
          </div>
          {!removing && (
            <Checkbox checked={separate} onChange={setSeparate}>
              Save each page as its own PDF
            </Checkbox>
          )}
          <Summary
            rows={[
              ['Pages in file', count || '…'],
              [removing ? 'Removing' : 'Extracting', selected.size],
              ['Pages in result', removing ? keep.length : selected.size],
            ]}
          />
        </>
      }
      hint={hint}
      disabled={!!hint || !!textError}
      onAction={save}
    />
  )
}
