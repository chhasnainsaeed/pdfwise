import { useState } from 'react'
import FileCard from '../components/FileCard.jsx'
import ToolLayout from '../components/ToolLayout.jsx'
import { RadioCards } from '../components/controls.jsx'
import { baseName } from '../lib/files.js'
import { useSession } from '../lib/hooks.js'
import { usePdfInfo } from '../lib/pdfjs.js'
import { DOCX_TYPE, pdfToDocx } from '../lib/word.js'

const MODES = [
  {
    value: 'layout',
    label: 'Keep the layout',
    text: 'Pages look like the PDF: text stays where it was and is editable, with graphics behind it.',
  },
  {
    value: 'flow',
    label: 'Flowing text',
    text: 'Clean paragraphs and headings that are easy to edit and restyle; layout and images are dropped.',
  },
]

export default function PdfToWord() {
  const { files, setFiles, run } = useSession()
  const info = usePdfInfo(files)
  const [mode, setMode] = useState('layout')
  const broken = files.filter((f) => info[f.id]?.error)

  const convert = () =>
    run(async ({ progress }) => {
      const out = []
      for (let i = 0; i < files.length; i++) {
        const { file } = files[i]
        out.push({
          name: `${baseName(file.name)}.docx`,
          type: DOCX_TYPE,
          data: await pdfToDocx(file, { layout: mode === 'layout' }, (d, t) =>
            progress(i * 100 + (d / t) * 100, files.length * 100),
          ),
        })
      }
      return { files: out, zipName: 'word-documents.zip' }
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
          <RadioCards label="Conversion mode" value={mode} onChange={setMode} options={MODES} />
          <p className="side-text small">
            Scanned PDFs have no text to extract — run <strong>OCR PDF</strong> on them first.
          </p>
        </>
      }
      hint={broken.length ? `Remove “${broken[0].file.name}” — it can’t be opened.` : null}
      disabled={broken.length > 0}
      onAction={convert}
    />
  )
}
