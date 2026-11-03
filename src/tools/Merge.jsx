import { ArrowDownAZ } from 'lucide-react'
import FileCard from '../components/FileCard.jsx'
import ToolLayout from '../components/ToolLayout.jsx'
import { Summary } from '../components/controls.jsx'
import { PDF_TYPE } from '../lib/files.js'
import { moveItem, useReorder, useSession } from '../lib/hooks.js'
import { mergePdfs } from '../lib/ops.js'
import { usePdfInfo } from '../lib/pdfjs.js'

export default function Merge() {
  const { files, setFiles, run } = useSession()
  const info = usePdfInfo(files)
  const { bind, over, dragging } = useReorder(setFiles)

  const totalPages = files.reduce((n, f) => n + (info[f.id]?.pages ?? 0), 0)
  const broken = files.filter((f) => info[f.id]?.error)

  const sortByName = () =>
    setFiles((list) => [...list].sort((a, b) => a.file.name.localeCompare(b.file.name, undefined, { numeric: true })))

  const merge = () =>
    run(async ({ progress }) => ({
      files: [
        {
          name: 'merged.pdf',
          type: PDF_TYPE,
          data: await mergePdfs(
            files.map((f) => f.file),
            progress,
          ),
        },
      ],
    }))

  return (
    <ToolLayout
      main={
        <div className="file-grid">
          {files.map((item, i) => (
            <FileCard
              key={item.id}
              item={item}
              info={info[item.id]}
              index={i}
              total={files.length}
              onMove={(d) => setFiles((list) => moveItem(list, i, i + d))}
              onRemove={() => setFiles((list) => list.filter((f) => f.id !== item.id))}
              dragProps={bind(i)}
              isOver={over === i && dragging !== i}
              isDragging={dragging === i}
            />
          ))}
        </div>
      }
      sidebar={
        <>
          <p className="side-text">
            Drag the files into the order you want. Pages are joined from left to right, top to bottom.
          </p>
          <button type="button" className="btn btn-outline" onClick={sortByName} disabled={files.length < 2}>
            <ArrowDownAZ size={18} /> Sort by file name
          </button>
          <Summary
            rows={[
              ['Files', files.length],
              ['Total pages', totalPages || '…'],
            ]}
          />
        </>
      }
      hint={
        broken.length
          ? `Remove “${broken[0].file.name}” — it can’t be opened.`
          : files.length < 2
            ? 'Add at least one more PDF to merge.'
            : null
      }
      disabled={files.length < 2 || broken.length > 0}
      onAction={merge}
    />
  )
}
