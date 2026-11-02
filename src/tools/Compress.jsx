import { useState } from 'react'
import FileCard from '../components/FileCard.jsx'
import ToolLayout from '../components/ToolLayout.jsx'
import { RadioCards } from '../components/controls.jsx'
import { compressPdf } from '../lib/compress.js'
import { PDF_TYPE, baseName } from '../lib/files.js'
import { useSession } from '../lib/hooks.js'
import { usePdfInfo } from '../lib/pdfjs.js'

const LEVELS = [
  { value: 'extreme', label: 'Extreme compression', text: 'Smallest file. Photos get noticeably softer.' },
  { value: 'recommended', label: 'Recommended', text: 'Good quality with a solid size reduction.' },
  { value: 'low', label: 'Less compression', text: 'Keeps images crisp, with smaller savings.' },
]

export default function Compress() {
  const { files, setFiles, run } = useSession()
  const info = usePdfInfo(files)
  const [level, setLevel] = useState('recommended')
  const broken = files.filter((f) => info[f.id]?.error)

  const compress = () =>
    run(async ({ progress }) => {
      const out = []
      let before = 0
      let after = 0
      let replaced = 0
      for (let i = 0; i < files.length; i++) {
        const { file } = files[i]
        const r = await compressPdf(file, level, (d, t) => progress((i + d / Math.max(t, 1)) * 100, files.length * 100))
        before += r.before
        after += r.after
        replaced += r.replaced
        out.push({ name: `${baseName(file.name)}-compressed.pdf`, type: PDF_TYPE, data: r.bytes })
        progress((i + 1) * 100, files.length * 100)
      }
      return {
        files: out,
        zipName: 'compressed-pdfs.zip',
        stats: { before, after },
        note:
          after >= before
            ? replaced
              ? 'Re-encoding the images didn’t make the file smaller, so your original is kept as-is.'
              : 'There were no large images to shrink — text and vector graphics are already compact.'
            : null,
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
          <RadioCards label="Compression level" value={level} onChange={setLevel} options={LEVELS} />
          <p className="side-text small">
            Compression re-encodes the photos and scans inside your PDF. Text and vector graphics stay sharp
            and selectable.
          </p>
        </>
      }
      hint={broken.length ? `Remove “${broken[0].file.name}” — it can’t be opened.` : null}
      disabled={broken.length > 0}
      onAction={compress}
    />
  )
}
