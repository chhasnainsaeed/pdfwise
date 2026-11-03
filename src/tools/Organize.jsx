import { ArrowUpDown, RotateCcw, RotateCw, Trash2, TriangleAlert, Undo2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import PageThumb from '../components/PageThumb.jsx'
import ToolLayout from '../components/ToolLayout.jsx'
import { Summary } from '../components/controls.jsx'
import { PDF_TYPE, baseName } from '../lib/files.js'
import { useReorder, useSession } from '../lib/hooks.js'
import { buildFromPages } from '../lib/ops.js'
import { usePdfInfo } from '../lib/pdfjs.js'

const FILE_COLORS = ['#5b4bff', '#ef5b3b', '#12a150', '#e2a300', '#d6409f', '#0f9fb8']

const pagesOf = (fileId, count) =>
  Array.from({ length: count }, (_, i) => ({ key: `${fileId}:${i}`, fileId, index: i, rotation: 0 }))

export default function Organize() {
  const { files, run } = useSession()
  const info = usePdfInfo(files)
  const [pages, setPages] = useState([])
  const added = useRef(new Set())
  const { bind, over, dragging } = useReorder(setPages)

  // Append each file's pages once its page count is known, keeping file order.
  useEffect(() => {
    const fresh = []
    for (const f of files) {
      if (added.current.has(f.id)) continue
      const i = info[f.id]
      if (!i) break
      added.current.add(f.id)
      if (i.pages) fresh.push(...pagesOf(f.id, i.pages))
    }
    if (fresh.length) setPages((p) => [...p, ...fresh])
  }, [files, info])

  const byId = useMemo(
    () => Object.fromEntries(files.map((f, i) => [f.id, { ...f, color: FILE_COLORS[i % FILE_COLORS.length], n: i }])),
    [files],
  )
  const broken = files.filter((f) => info[f.id]?.error)

  const update = (key, fn) => setPages((list) => list.map((p) => (p.key === key ? fn(p) : p)))
  const remove = (key) => setPages((list) => list.filter((p) => p.key !== key))
  const rotateAll = (d) => setPages((list) => list.map((p) => ({ ...p, rotation: p.rotation + d })))
  const reset = () => setPages(files.flatMap((f) => (info[f.id]?.pages ? pagesOf(f.id, info[f.id].pages) : [])))

  const save = () =>
    run(async () => ({
      files: [
        {
          name: `${baseName(files[0].file.name)}-organized.pdf`,
          type: PDF_TYPE,
          data: await buildFromPages(
            pages.map((p) => ({
              file: byId[p.fileId].file,
              index: p.index,
              rotation: ((p.rotation % 360) + 360) % 360,
            })),
          ),
        },
      ],
    }))

  return (
    <ToolLayout
      main={
        <>
          {broken.map((f) => (
            <div key={f.id} className="alert inline-alert">
              <TriangleAlert size={18} /> “{f.file.name}” can’t be opened ({info[f.id].error}) and was left out.
            </div>
          ))}
          <div className="page-grid">
            {pages.map((p, i) => {
              const src = byId[p.fileId]
              if (!src) return null
              return (
                <div
                  key={p.key}
                  className={`page-tile is-draggable ${over === i && dragging !== i ? 'is-over' : ''} ${dragging === i ? 'is-dragging' : ''}`}
                  {...bind(i)}
                >
                  <div className="card-actions">
                    <button
                      type="button"
                      className="mini-btn"
                      title="Rotate left"
                      onClick={() => update(p.key, (x) => ({ ...x, rotation: x.rotation - 90 }))}
                    >
                      <RotateCcw size={15} />
                    </button>
                    <button
                      type="button"
                      className="mini-btn"
                      title="Rotate right"
                      onClick={() => update(p.key, (x) => ({ ...x, rotation: x.rotation + 90 }))}
                    >
                      <RotateCw size={15} />
                    </button>
                    <button type="button" className="mini-btn danger" title="Delete page" onClick={() => remove(p.key)}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <div className="page-frame">
                    <PageThumb file={src.file} page={p.index + 1} size={150} rotation={p.rotation} />
                  </div>
                  <div className="page-label">
                    {files.length > 1 && (
                      <span className="file-dot" style={{ background: src.color }} title={src.file.name} />
                    )}
                    {i + 1}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      }
      sidebar={
        <>
          <p className="side-text">
            Drag pages to reorder them. Hover a page to rotate or delete it. Use <strong>+</strong> to bring in pages
            from more PDFs.
          </p>
          {files.length > 1 && (
            <ul className="file-legend">
              {files.map((f) => (
                <li key={f.id}>
                  <span className="file-dot" style={{ background: byId[f.id].color }} />
                  <span className="truncate">{f.file.name}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="btn-row">
            <button type="button" className="btn btn-outline" onClick={() => rotateAll(-90)}>
              <RotateCcw size={18} /> All left
            </button>
            <button type="button" className="btn btn-outline" onClick={() => rotateAll(90)}>
              <RotateCw size={18} /> All right
            </button>
          </div>
          <div className="btn-row">
            <button type="button" className="btn btn-outline" onClick={() => setPages((l) => [...l].reverse())}>
              <ArrowUpDown size={18} /> Reverse
            </button>
            <button type="button" className="btn btn-outline" onClick={reset}>
              <Undo2 size={18} /> Reset
            </button>
          </div>
          <Summary rows={[['Pages in output', pages.length]]} />
        </>
      }
      hint={pages.length === 0 ? 'There are no pages left. Reset or add a PDF.' : null}
      disabled={pages.length === 0}
      onAction={save}
    />
  )
}
