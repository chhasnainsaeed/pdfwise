import { CircleCheck, Info, RefreshCw, ServerOff, TriangleAlert } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import FileCard from '../components/FileCard.jsx'
import ToolIcon from '../components/ToolIcon.jsx'
import ToolLayout from '../components/ToolLayout.jsx'
import { PDF_TYPE, baseName, extOf } from '../lib/files.js'
import { useSession } from '../lib/hooks.js'
import { convertOnServer, serverStatus } from '../lib/server.js'

function DocThumb({ tool, name }) {
  return (
    <div className="doc-thumb" style={{ '--c': tool.color }}>
      <ToolIcon tool={tool} size="md" />
      <span>{extOf(name).toUpperCase()}</span>
    </div>
  )
}

/** Shared workspace for Word, Excel and PowerPoint → PDF, which convert on the server. */
export default function OfficeToPdf() {
  const { tool, files, setFiles, run } = useSession()
  const [status, setStatus] = useState(null)

  const check = useCallback(() => {
    setStatus(null)
    serverStatus().then(setStatus)
  }, [])

  useEffect(() => {
    check()
  }, [check])

  const supported = (f) => status?.formats?.includes(extOf(f.file.name))
  const unsupported = status?.engine ? files.filter((f) => !supported(f)) : []
  const ready = status?.ok && status.engine && unsupported.length === 0

  const convert = () =>
    run(async ({ progress }) => {
      const out = []
      for (let i = 0; i < files.length; i++) {
        const { file } = files[i]
        out.push({ name: `${baseName(file.name)}.pdf`, type: PDF_TYPE, data: await convertOnServer(file, status) })
        progress(i + 1, files.length)
      }
      return { files: out, zipName: 'converted-pdfs.zip' }
    })

  let note
  if (!status) {
    note = (
      <div className="status-note">
        <span className="spinner spinner-sm" />
        <span>Checking the conversion server…</span>
      </div>
    )
  } else if (!status.ok) {
    note = (
      <div className="status-note is-unknown">
        <ServerOff size={18} />
        <span>
          {navigator.onLine ? (
            <>
              The conversion server isn’t running. Start it with <code>npm run server</code>, then check again.
            </>
          ) : (
            'You’re offline. Office conversion needs a connection — check again once you’re back online.'
          )}
        </span>
      </div>
    )
  } else if (!status.engine) {
    note = (
      <div className="status-note is-unknown">
        <TriangleAlert size={18} />
        <span>The server has no converter: it needs LibreOffice, or Chrome/Edge for the built-in converter.</span>
      </div>
    )
  } else if (status.engine === 'libreoffice') {
    note = (
      <div className="status-note is-ready">
        <CircleCheck size={18} />
        <span>Converting with LibreOffice — fonts, tables, images and page layout carry over.</span>
      </div>
    )
  } else {
    note = (
      <div className="status-note">
        <Info size={18} />
        <span>
          Using the built-in converter (LibreOffice isn’t installed on the server). Fonts, colors, tables, images,
          charts and cell styles carry over; complex layouts can differ slightly from Office. Supports{' '}
          {status.formats
            .map((f) => (status.notes?.[f] ? `${f.toUpperCase()} (${status.notes[f]})` : f.toUpperCase()))
            .join(', ')}
          .
        </span>
      </div>
    )
  }

  let hint = null
  if (!status) hint = 'Checking the server…'
  else if (!status.ok || !status.engine) hint = 'The conversion server isn’t ready.'
  else if (unsupported.length)
    hint = `“${unsupported[0].file.name}” needs LibreOffice on the server. Remove it to continue.`

  return (
    <ToolLayout
      main={
        <div className="file-grid">
          {files.map((item) => (
            <FileCard
              key={item.id}
              item={item}
              thumb={<DocThumb tool={tool} name={item.file.name} />}
              meta={status?.engine && !supported(item) ? 'Needs LibreOffice · ' : ''}
              onRemove={() => setFiles((list) => list.filter((f) => f.id !== item.id))}
            />
          ))}
        </div>
      }
      sidebar={
        <>
          {note}
          {status && !ready && !unsupported.length && (
            <button type="button" className="btn btn-outline" onClick={check}>
              <RefreshCw size={18} /> Check again
            </button>
          )}
          <p className="side-text small">
            Unlike most tools, this one sends your files to your PDFwise server. They’re converted in a temporary folder
            (or in memory) and discarded as soon as the PDF is sent back.
          </p>
        </>
      }
      hint={hint}
      disabled={!ready}
      onAction={convert}
    />
  )
}
