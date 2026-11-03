import { useState } from 'react'
import FileCard from '../components/FileCard.jsx'
import ToolLayout from '../components/ToolLayout.jsx'
import { Checkbox } from '../components/controls.jsx'
import { PDF_TYPE, baseName } from '../lib/files.js'
import { useSession } from '../lib/hooks.js'
import { convertToPdfA } from '../lib/pdfa.js'
import { usePdfInfo } from '../lib/pdfjs.js'

export default function PdfA() {
  const { files, setFiles, run } = useSession()
  const item = files[0]
  const info = usePdfInfo(files)[item.id]
  const [flatten, setFlatten] = useState(true)

  const convert = () =>
    run(async ({ progress }) => {
      const r = await convertToPdfA(item.file, { flatten }, progress)
      return {
        files: [{ name: `${baseName(item.file.name)}-pdfa.pdf`, type: PDF_TYPE, data: r.bytes }],
        note: r.report.join(' '),
      }
    })

  return (
    <ToolLayout
      main={
        <div className="file-grid">
          <FileCard item={item} info={info} onRemove={() => setFiles([])} />
        </div>
      }
      sidebar={
        <>
          <p className="side-text">
            PDF/A is the ISO format for long-term archiving: everything needed to display the file is inside it, and
            nothing depends on scripts or outside resources.
          </p>
          <Checkbox checked={flatten} onChange={setFlatten}>
            Convert pages that can’t comply (missing fonts, CMYK color) to images
          </Checkbox>
          <p className="side-text small">
            This produces PDF/A-2b: embedded fonts, an sRGB output intent, matching XMP metadata, and no scripts,
            attachments or encryption. The checks are built in; for certified compliance, verify the result with a
            validator such as veraPDF.
          </p>
        </>
      }
      hint={info?.error ? 'This file can’t be opened.' : null}
      disabled={!!info?.error}
      onAction={convert}
    />
  )
}
