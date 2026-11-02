import { TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import PageThumb from '../components/PageThumb.jsx'
import ToolLayout from '../components/ToolLayout.jsx'
import { Checkbox, Field, Segmented } from '../components/controls.jsx'
import { PDF_TYPE, baseName, pluralize, range } from '../lib/files.js'
import { useSession } from '../lib/hooks.js'
import { OCR_LANGUAGES, ocrPdf } from '../lib/ocr.js'
import { usePdfInfo } from '../lib/pdfjs.js'

export default function Ocr() {
  const { files, run } = useSession()
  const item = files[0]
  const info = usePdfInfo(files)[item.id]
  const count = info?.pages ?? 0
  const [lang, setLang] = useState('eng')
  const [output, setOutput] = useState('pdf')
  const [skipText, setSkipText] = useState(true)

  const recognize = () =>
    run(async ({ progress }) => {
      const base = baseName(item.file.name)
      const r = await ocrPdf(item.file, { lang, skipText, output }, progress)
      const note = `Recognized ${pluralize(r.words, 'word')}.`
      if (output === 'txt') {
        return {
          files: [
            { name: `${base}.txt`, type: 'text/plain', data: new Blob([r.text], { type: 'text/plain;charset=utf-8' }) },
          ],
          note,
        }
      }
      return { files: [{ name: `${base}-ocr.pdf`, type: PDF_TYPE, data: r.bytes }], note }
    })

  return (
    <ToolLayout
      main={
        info?.error ? (
          <div className="alert inline-alert">
            <TriangleAlert size={18} /> “{item.file.name}” can’t be opened ({info.error}).
          </div>
        ) : (
          <div className="page-grid">
            {range(count).map((i) => (
              <div key={i} className="page-tile">
                <div className="page-frame">
                  <PageThumb file={item.file} page={i + 1} size={150} />
                </div>
                <div className="page-label">{i + 1}</div>
              </div>
            ))}
          </div>
        )
      }
      sidebar={
        <>
          <Field label="Document language">
            <select className="text-input" value={lang} onChange={(e) => setLang(e.target.value)}>
              {OCR_LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Output">
            <Segmented
              label="Output"
              value={output}
              onChange={setOutput}
              options={[
                { value: 'pdf', label: 'Searchable PDF' },
                { value: 'txt', label: 'Text file' },
              ]}
            />
          </Field>
          <Checkbox checked={skipText} onChange={setSkipText}>
            Skip pages that already have selectable text
          </Checkbox>
          <p className="side-text small">
            OCR reads scanned pages and adds an invisible text layer, so you can search, select and copy the text. The
            first run downloads the language model (a few MB). Your PDF never leaves your device.
          </p>
        </>
      }
      hint={
        info?.error
          ? 'This file can’t be opened.'
          : count > 20
            ? `About ${Math.ceil((count * 3) / 60)} min for ${count} pages.`
            : null
      }
      disabled={!count}
      onAction={recognize}
    />
  )
}
