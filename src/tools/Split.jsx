import { Plus, TriangleAlert, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import PageThumb from '../components/PageThumb.jsx'
import ToolLayout from '../components/ToolLayout.jsx'
import { Checkbox, Field, NumberInput, Segmented, Summary } from '../components/controls.jsx'
import { PDF_TYPE, baseName, range, uid } from '../lib/files.js'
import { useSession } from '../lib/hooks.js'
import { buildFromPages, splitIntoGroups } from '../lib/ops.js'
import { usePdfInfo } from '../lib/pdfjs.js'
import { groupLabel } from '../lib/ranges.js'

const GROUP_COLORS = ['#5b4bff', '#ef5b3b', '#12a150', '#e2a300', '#d6409f', '#0f9fb8', '#8a5a44']

function computeGroups(mode, ranges, every, count) {
  if (!count) return { groups: [] }
  if (mode === 'all') return { groups: range(count).map((i) => [i]) }
  if (mode === 'every') {
    const n = Number(every)
    if (!Number.isInteger(n) || n < 1) return { groups: [], error: 'Enter how many pages each file should have.' }
    const groups = []
    for (let i = 0; i < count; i += n) groups.push(range(Math.min(n, count - i)).map((k) => i + k))
    return { groups }
  }
  const groups = []
  for (const r of ranges) {
    if (r.from === '' || r.to === '') return { groups, error: 'Fill in both ends of every range.' }
    let a = Number(r.from)
    let b = Number(r.to)
    if (a > b) [a, b] = [b, a]
    if (a < 1 || b > count) return { groups, error: `Ranges must be between 1 and ${count}.` }
    groups.push(range(b - a + 1).map((k) => a - 1 + k))
  }
  return { groups }
}

export default function Split() {
  const { files, run } = useSession()
  const item = files[0]
  const info = usePdfInfo(files)[item.id]
  const count = info?.pages ?? 0
  const [mode, setMode] = useState('ranges')
  const [ranges, setRanges] = useState([])
  const [every, setEvery] = useState(1)
  const [merge, setMerge] = useState(false)

  useEffect(() => {
    if (count && ranges.length === 0) setRanges([{ id: uid(), from: 1, to: Math.max(1, Math.ceil(count / 2)) }])
  }, [count, ranges.length])

  const { groups, error } = useMemo(() => computeGroups(mode, ranges, every, count), [mode, ranges, every, count])

  const pageGroup = useMemo(() => {
    const m = new Map()
    groups.forEach((g, gi) => g.forEach((p) => !m.has(p) && m.set(p, gi)))
    return m
  }, [groups])

  const setRange = (id, key, value) => setRanges((list) => list.map((r) => (r.id === id ? { ...r, [key]: value } : r)))
  const addRange = () => {
    const last = ranges[ranges.length - 1]
    const from = Math.min(count, (Number(last?.to) || 0) + 1)
    setRanges((list) => [...list, { id: uid(), from, to: count }])
  }

  const merging = mode === 'ranges' && merge && groups.length > 1

  const split = () =>
    run(async ({ progress }) => {
      const base = baseName(item.file.name)
      if (merging) {
        const entries = groups.flat().map((index) => ({ file: item.file, index }))
        return { files: [{ name: `${base}-ranges.pdf`, type: PDF_TYPE, data: await buildFromPages(entries) }] }
      }
      const outputs = await splitIntoGroups(item.file, groups, progress)
      return {
        files: outputs.map((data, i) => ({ name: `${base}_${groupLabel(groups[i])}.pdf`, type: PDF_TYPE, data })),
        zipName: `${base}-split.zip`,
      }
    })

  const outputCount = merging ? 1 : groups.length

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
              const g = pageGroup.get(i)
              const color = g === undefined ? null : GROUP_COLORS[g % GROUP_COLORS.length]
              const first = g !== undefined && groups[g][0] === i
              return (
                <div
                  key={i}
                  className={`page-tile ${g === undefined ? 'is-dim' : 'is-grouped'}`}
                  style={color ? { '--g': color } : undefined}
                >
                  {first && mode !== 'all' && <span className="group-tag">{mode === 'ranges' ? `Range ${g + 1}` : `File ${g + 1}`}</span>}
                  <div className="page-frame">
                    <PageThumb file={item.file} page={i + 1} size={150} />
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
          <Segmented
            label="Split mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'ranges', label: 'Ranges' },
              { value: 'every', label: 'Fixed size' },
              { value: 'all', label: 'Every page' },
            ]}
          />

          {mode === 'ranges' && (
            <>
              <div className="range-list">
                {ranges.map((r, i) => (
                  <div key={r.id} className="range-row" style={{ '--g': GROUP_COLORS[i % GROUP_COLORS.length] }}>
                    <span className="range-name">Range {i + 1}</span>
                    <label>
                      from
                      <NumberInput value={r.from} min={1} max={count} onChange={(v) => setRange(r.id, 'from', v)} aria-label={`Range ${i + 1} first page`} />
                    </label>
                    <label>
                      to
                      <NumberInput value={r.to} min={1} max={count} onChange={(v) => setRange(r.id, 'to', v)} aria-label={`Range ${i + 1} last page`} />
                    </label>
                    {ranges.length > 1 && (
                      <button type="button" className="mini-btn" title="Remove range" onClick={() => setRanges((l) => l.filter((x) => x.id !== r.id))}>
                        <X size={15} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button type="button" className="btn btn-outline" onClick={addRange}>
                <Plus size={18} /> Add range
              </button>
              {ranges.length > 1 && (
                <Checkbox checked={merge} onChange={setMerge}>
                  Merge all ranges into one PDF
                </Checkbox>
              )}
            </>
          )}

          {mode === 'every' && (
            <Field label="Pages per file">
              <NumberInput value={every} min={1} max={count || 1} onChange={setEvery} suffix="pages" />
            </Field>
          )}

          {mode === 'all' && <p className="side-text">Every page becomes its own PDF file.</p>}

          <Summary
            rows={[
              ['Pages in file', count || '…'],
              ['Files to create', outputCount],
            ]}
          />
        </>
      }
      hint={info?.error ? 'This file can’t be opened.' : error}
      disabled={!!error || !!info?.error || groups.length === 0}
      onAction={split}
    />
  )
}
