import { ChevronLeft, ChevronRight, RotateCw, TriangleAlert, X } from 'lucide-react'
import { pluralize, formatBytes } from '../lib/files.js'
import PageThumb from './PageThumb.jsx'

/** A file tile used by the multi-file tools: thumbnail, name, size, and actions. */
export default function FileCard({
  item,
  info,
  thumb,
  rotation = 0,
  meta,
  onRemove,
  onRotate,
  index,
  total,
  onMove,
  dragProps,
  isOver,
  isDragging,
}) {
  const { file } = item
  const pages = info?.pages
  return (
    <div
      className={`file-card ${isOver ? 'is-over' : ''} ${isDragging ? 'is-dragging' : ''} ${dragProps ? 'is-draggable' : ''}`}
      {...dragProps}
    >
      <div className="card-actions">
        {onRotate && (
          <button type="button" className="mini-btn" title="Rotate" onClick={onRotate}>
            <RotateCw size={15} />
          </button>
        )}
        {onRemove && (
          <button type="button" className="mini-btn" title="Remove" onClick={onRemove}>
            <X size={15} />
          </button>
        )}
      </div>
      <div className="file-card-thumb">
        {info?.error ? (
          <div className="thumb-error">
            <TriangleAlert size={22} />
            <span>{info.error}</span>
          </div>
        ) : (
          (thumb ?? <PageThumb file={file} page={1} size={140} rotation={rotation} />)
        )}
      </div>
      <div className="file-card-name" title={file.name}>
        {file.name}
      </div>
      <div className="file-card-meta">
        {meta ?? (pages ? `${pluralize(pages, 'page')} · ` : '')}
        {formatBytes(file.size)}
      </div>
      {onMove && total > 1 && (
        <div className="file-card-order">
          <button type="button" className="mini-btn" title="Move left" disabled={index === 0} onClick={() => onMove(-1)}>
            <ChevronLeft size={15} />
          </button>
          <span>{index + 1}</span>
          <button
            type="button"
            className="mini-btn"
            title="Move right"
            disabled={index === total - 1}
            onClick={() => onMove(1)}
          >
            <ChevronRight size={15} />
          </button>
        </div>
      )}
    </div>
  )
}
