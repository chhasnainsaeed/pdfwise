import { RotateCcw, RotateCw } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import FileCard from '../components/FileCard.jsx'
import ToolLayout from '../components/ToolLayout.jsx'
import { PDF_TYPE, baseName } from '../lib/files.js'
import { useSession } from '../lib/hooks.js'
import { rotateAll } from '../lib/ops.js'
import { usePdfInfo } from '../lib/pdfjs.js'

const norm = (d) => ((d % 360) + 360) % 360

export default function Rotate() {
  const { files, setFiles, run } = useSession()
  const info = usePdfInfo(files)
  const [rot, setRot] = useState({})
  const broken = files.filter((f) => info[f.id]?.error)
  const anyRotated = files.some((f) => norm(rot[f.id] ?? 0) !== 0)

  const turn = (id, d) => setRot((r) => ({ ...r, [id]: (r[id] ?? 0) + d }))
  const turnAll = (d) => setRot((r) => Object.fromEntries(files.map((f) => [f.id, (r[f.id] ?? 0) + d])))

  const rotate = () =>
    run(async ({ progress }) => {
      const out = []
      const targets = files.filter((f) => norm(rot[f.id] ?? 0) !== 0)
      for (let i = 0; i < targets.length; i++) {
        const { id, file } = targets[i]
        out.push({
          name: `${baseName(file.name)}-rotated.pdf`,
          type: PDF_TYPE,
          data: await rotateAll(file, norm(rot[id])),
        })
        progress(i + 1, targets.length)
      }
      return { files: out, zipName: 'rotated-pdfs.zip' }
    })

  return (
    <ToolLayout
      main={
        <div className="file-grid">
          {files.map((item) => (
            <FileCard
              key={item.id}
              item={item}
              info={info[item.id]}
              rotation={rot[item.id] ?? 0}
              onRotate={() => turn(item.id, 90)}
              onRemove={() => setFiles((list) => list.filter((f) => f.id !== item.id))}
            />
          ))}
        </div>
      }
      sidebar={
        <>
          <p className="side-text">
            Hover a file and click <RotateCw size={14} className="inline-icon" /> to turn it, or rotate everything at
            once. Every page in a file is turned together.
          </p>
          <div className="btn-row">
            <button type="button" className="btn btn-outline" onClick={() => turnAll(-90)}>
              <RotateCcw size={18} /> Left
            </button>
            <button type="button" className="btn btn-outline" onClick={() => turnAll(90)}>
              <RotateCw size={18} /> Right
            </button>
          </div>
          {anyRotated && (
            <button type="button" className="btn btn-ghost" onClick={() => setRot({})}>
              Reset rotation
            </button>
          )}
          <p className="side-text small">
            Need to turn individual pages instead? Use <Link to="/organize-pdf">Organize PDF</Link>.
          </p>
        </>
      }
      hint={
        broken.length
          ? `Remove “${broken[0].file.name}” — it can’t be opened.`
          : !anyRotated
            ? 'Rotate at least one file to continue.'
            : null
      }
      disabled={!anyRotated || broken.length > 0}
      onAction={rotate}
    />
  )
}
