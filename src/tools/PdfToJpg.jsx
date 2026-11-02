import { useState } from 'react'
import FileCard from '../components/FileCard.jsx'
import ToolLayout from '../components/ToolLayout.jsx'
import { Field, RadioCards, Segmented, Summary } from '../components/controls.jsx'
import { pdfsToImages } from '../lib/convert.js'
import { useSession } from '../lib/hooks.js'
import { usePdfInfo } from '../lib/pdfjs.js'

export default function PdfToJpg() {
  const { files, setFiles, run } = useSession()
  const info = usePdfInfo(files)
  const [dpi, setDpi] = useState(150)
  const [format, setFormat] = useState('jpg')
  const broken = files.filter((f) => info[f.id]?.error)
  const totalPages = files.reduce((n, f) => n + (info[f.id]?.pages ?? 0), 0)

  const convert = () =>
    run(async ({ progress }) => ({
      files: await pdfsToImages(
        files.map((f) => f.file),
        { dpi, format },
        progress,
      ),
      zipName: 'pdf-images.zip',
    }))

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
          <Field label="Image quality">
            <RadioCards
              label="Image quality"
              value={dpi}
              onChange={setDpi}
              options={[
                { value: 96, label: 'Screen', text: '96 DPI — small files for sharing on screen.' },
                { value: 150, label: 'Standard', text: '150 DPI — a good all-round choice.' },
                { value: 300, label: 'High', text: '300 DPI — print quality, larger files.' },
              ]}
            />
          </Field>
          <Field label="Format">
            <Segmented
              label="Format"
              value={format}
              onChange={setFormat}
              options={[
                { value: 'jpg', label: 'JPG' },
                { value: 'png', label: 'PNG' },
              ]}
            />
          </Field>
          <Summary rows={[['Images to create', totalPages || '…']]} />
        </>
      }
      hint={broken.length ? `Remove “${broken[0].file.name}” — it can’t be opened.` : null}
      disabled={broken.length > 0 || !totalPages}
      onAction={convert}
    />
  )
}
