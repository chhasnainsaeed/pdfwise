/** Full-screen progress while a tool runs. `progress` is { done, total, label? } or null. */
export default function ProcessingOverlay({ tool, progress }) {
  const pct = progress?.total ? Math.round((progress.done / progress.total) * 100) : null
  return (
    <div className="processing" role="status" aria-live="polite">
      <div className="processing-card">
        <span className="spinner spinner-lg" />
        <h2>{tool.processing}</h2>
        {progress?.label && <p className="processing-step">{progress.label}</p>}
        {pct !== null ? (
          <>
            <div className="progress">
              <div className="progress-bar" style={{ width: `${pct}%` }} />
            </div>
            {!progress.label && (
              <p className="muted">
                {progress.done} of {progress.total}
              </p>
            )}
          </>
        ) : (
          <p className="muted">This happens on your device, so it won’t take long.</p>
        )}
      </div>
    </div>
  )
}
