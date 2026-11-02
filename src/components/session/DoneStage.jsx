import { ArrowLeft, Download, FileText, RotateCcw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { bucket, track } from '../../lib/analytics.js'
import { PDF_TYPE, formatBytes, uid } from '../../lib/files.js'
import { handOff } from '../../lib/handoff.js'
import { TOOLS_BY_ID } from '../../tools.js'
import ToolIcon from '../ToolIcon.jsx'

/** The result: download button, size stats, and "Continue with this file" into related tools. */
export default function DoneStage({ tool, result, onBack, onRestart }) {
  const navigate = useNavigate()
  const isPdf = result.type === PDF_TYPE
  const ext = result.name.split('.').pop().toLowerCase()
  const label =
    result.count > 1
      ? `ZIP (${result.count} files)`
      : ({ pdf: 'PDF', png: 'PNG', jpg: 'JPG', docx: 'Word file', txt: 'text file' }[ext] ?? 'file')
  const related = isPdf ? tool.related.map((id) => TOOLS_BY_ID[id]).filter(Boolean) : []

  const continueWith = (id) => {
    handOff(id, [{ id: uid(), file: new File([result.blob], result.name, { type: PDF_TYPE }) }], { source: 'continue' })
    navigate(`/${id}`)
  }

  return (
    <div className="stage-center done-stage">
      <h1 className="stage-title">{tool.done}</h1>
      {result.stats && <CompressStats stats={result.stats} />}
      {result.note && <p className="stage-lead">{result.note}</p>}

      <div className="done-card">
        <div className="done-file">
          <FileText size={20} />
          <span className="done-file-name">{result.name}</span>
          <span className="muted">{formatBytes(result.blob.size)}</span>
        </div>
        <a
          className="btn btn-primary btn-xl"
          href={result.url}
          download={result.name}
          onClick={() => track('Download', { tool: tool.id, outputs: bucket(result.count) })}
        >
          <Download size={22} />
          Download {label}
        </a>
      </div>

      <div className="done-links">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          <ArrowLeft size={18} /> Back to editing
        </button>
        <button type="button" className="btn btn-ghost" onClick={onRestart}>
          <RotateCcw size={18} /> Start over
        </button>
      </div>

      {related.length > 0 && (
        <section className="continue">
          <h2>Continue with this file</h2>
          <div className="continue-grid">
            {related.map((t) => (
              <button key={t.id} type="button" className="continue-item" onClick={() => continueWith(t.id)}>
                <ToolIcon tool={t} size="sm" />
                <span>{t.name}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function CompressStats({ stats }) {
  const saved = stats.before > 0 ? Math.round((1 - stats.after / stats.before) * 100) : 0
  return (
    <div className="compress-stats">
      <div className="ring" style={{ '--p': Math.max(saved, 0) }}>
        <span>{saved > 0 ? `-${saved}%` : '0%'}</span>
      </div>
      <div>
        <strong>{saved > 0 ? `Your PDF is ${saved}% smaller` : 'This PDF was already well optimized'}</strong>
        <p className="muted">
          {formatBytes(stats.before)} → {formatBytes(stats.after)}
        </p>
      </div>
    </div>
  )
}
