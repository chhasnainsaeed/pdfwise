import FileCard from '../components/FileCard.jsx'
import ToolLayout from '../components/ToolLayout.jsx'
import { PDF_TYPE, baseName } from '../lib/files.js'
import { useSession } from '../lib/hooks.js'
import { usePdfInfo } from '../lib/pdfjs.js'
import { repairPdf } from '../lib/qpdf.js'

export default function Repair() {
  const { files, setFiles, run } = useSession()
  const info = usePdfInfo(files)

  const repair = () =>
    run(async ({ progress }) => {
      const out = []
      let repaired = 0
      for (let i = 0; i < files.length; i++) {
        const { file } = files[i]
        const r = await repairPdf(file)
        if (r.repaired) repaired++
        out.push({ name: `${baseName(file.name)}-repaired.pdf`, type: PDF_TYPE, data: r.bytes })
        progress(i + 1, files.length)
      }
      return {
        files: out,
        zipName: 'repaired-pdfs.zip',
        note: repaired
          ? `Problems in the file structure were found and fixed${files.length > 1 ? ` in ${repaired} of ${files.length} files` : ''}.`
          : 'No structural problems were found — the file was rebuilt cleanly anyway.',
      }
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
              onRemove={() => setFiles((list) => list.filter((f) => f.id !== item.id))}
            />
          ))}
        </div>
      }
      sidebar={
        <>
          <p className="side-text">
            Repair rebuilds a PDF’s internal structure: broken cross-reference tables, wrong offsets, truncated
            streams and other damage that stops files from opening.
          </p>
          <p className="side-text small">
            Files that show “Could not read file” here are exactly what this tool is for. Content that is truly
            missing from a file can’t be brought back.
          </p>
        </>
      }
      onAction={repair}
    />
  )
}
