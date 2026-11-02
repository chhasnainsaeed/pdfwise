import { ClipboardPaste, Server, ShieldCheck, Upload } from 'lucide-react'
import { useRef } from 'react'
import { KINDS, acceptFor } from '../../lib/files.js'
import { useOnline } from '../AppStatus.jsx'
import ToolIcon from '../ToolIcon.jsx'

/** The first screen of a tool: pick, drop or paste files. */
export default function UploadStage({ tool, title, lead, onFiles, error }) {
  const input = useRef(null)
  const online = useOnline()
  const noun = KINDS[tool.kind].label
  const plural = tool.multiple ? `${noun} files` : `${noun} file`
  return (
    <div className="stage-center upload-stage" style={{ '--c': tool.color }}>
      <div className="icon-orbit" aria-hidden="true">
        <span className="orbit-ring" />
        <span className="orbit-ring orbit-ring-2" />
        <ToolIcon tool={tool} size="lg" />
      </div>
      <h1 className="stage-title">{title ?? tool.name}</h1>
      <p className="stage-lead">{lead ?? tool.description}</p>
      <button type="button" className="btn btn-primary btn-xl" onClick={() => input.current.click()}>
        <Upload size={22} />
        Select {plural}
      </button>
      <p className="upload-hint">
        or drop {plural} anywhere on this page · <ClipboardPaste size={14} /> paste with <kbd>Ctrl</kbd>+<kbd>V</kbd>
      </p>
      <input
        ref={input}
        type="file"
        hidden
        multiple={tool.multiple}
        accept={acceptFor(tool.kind)}
        onChange={(e) => {
          onFiles(e.target.files)
          e.target.value = ''
        }}
      />
      {error && (
        <div className="alert upload-alert" role="alert">
          {error}
        </div>
      )}
      {tool.server && !online && (
        <div className="alert upload-alert" role="status">
          You’re offline. {tool.name} needs a connection to the conversion server.
        </div>
      )}
      <p className="privacy-note">
        {tool.server ? <Server size={16} /> : <ShieldCheck size={16} />}
        {tool.server
          ? 'Converted on your PDFwise server — files are deleted as soon as the PDF is ready.'
          : 'Processed on your device — your files never leave your browser.'}
      </p>
    </div>
  )
}
