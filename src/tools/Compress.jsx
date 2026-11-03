import { useState } from 'react'
import FileCard from '../components/FileCard.jsx'
import ToolLayout from '../components/ToolLayout.jsx'
import { Field, NumberInput, RadioCards, Segmented } from '../components/controls.jsx'
import { compressPdf, compressToTarget } from '../lib/compress.js'
import { PDF_TYPE, baseName, formatBytes } from '../lib/files.js'
import { useSession } from '../lib/hooks.js'
import { usePdfInfo } from '../lib/pdfjs.js'
import { SIZE_TARGETS } from '../seo.js'

const LEVELS = [
  { value: 'extreme', label: 'Extreme compression', text: 'Smallest file. Photos get noticeably softer.' },
  { value: 'recommended', label: 'Recommended', text: 'Good quality with a solid size reduction.' },
  { value: 'low', label: 'Less compression', text: 'Keeps images crisp, with smaller savings.' },
]

const MODES = [
  { value: 'level', label: 'Quality level' },
  { value: 'target', label: 'Target size' },
]

const UNITS = [
  { value: 'KB', label: 'KB' },
  { value: 'MB', label: 'MB' },
]

function initialTarget(bytes) {
  if (!bytes) return { amount: 1, unit: 'MB' }
  return bytes >= 1024 * 1024
    ? { amount: +(bytes / 1024 / 1024).toFixed(2), unit: 'MB' }
    : { amount: Math.round(bytes / 1024), unit: 'KB' }
}

export default function Compress() {
  const { files, setFiles, run, preset } = useSession()
  const info = usePdfInfo(files)
  const [mode, setMode] = useState(preset?.target ? 'target' : 'level')
  const [level, setLevel] = useState(preset?.level ?? 'recommended')
  const [target, setTarget] = useState(() => initialTarget(preset?.target))
  const broken = files.filter((f) => info[f.id]?.error)

  const targetBytes = Math.round((Number(target.amount) || 0) * (target.unit === 'MB' ? 1024 * 1024 : 1024))
  const targetOk = mode === 'level' || targetBytes >= 10 * 1024

  const compress = () =>
    run(async ({ progress }) => {
      const out = []
      const missed = []
      let before = 0
      let after = 0
      let replaced = 0
      let untouched = 0
      for (let i = 0; i < files.length; i++) {
        const { file } = files[i]
        const step = (d, t) => progress((i + d / Math.max(t, 1)) * 100, files.length * 100)
        const r =
          mode === 'target' ? await compressToTarget(file, targetBytes, step) : await compressPdf(file, level, step)
        before += r.before
        after += r.after
        replaced += r.replaced
        if (r.untouched) untouched++
        if (r.reached === false) missed.push(`${file.name} (${formatBytes(r.after)})`)
        out.push({ name: `${baseName(file.name)}-compressed.pdf`, type: PDF_TYPE, data: r.bytes })
        progress((i + 1) * 100, files.length * 100)
      }
      let note = null
      if (mode === 'target' && missed.length) {
        note = `Couldn’t get ${missed.join(', ')} under ${formatBytes(targetBytes)} — most of the size is text, fonts or vector graphics, which compression keeps intact. This is the smallest version possible.`
      } else if (mode === 'target' && untouched === files.length) {
        note = `Already under ${formatBytes(targetBytes)}, so your file is unchanged.`
      } else if (mode === 'target') {
        note = `Every file is now under ${formatBytes(targetBytes)}, at the best quality that fits.`
      } else if (after >= before) {
        note = replaced
          ? 'Re-encoding the images didn’t make the file smaller, so your original is kept as-is.'
          : 'There were no large images to shrink — text and vector graphics are already compact.'
      }
      return {
        files: out,
        zipName: 'compressed-pdfs.zip',
        stats: { before, after },
        note,
        analytics: { mode, setting: mode === 'target' ? formatBytes(targetBytes) : level },
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
          <Segmented label="Compression mode" value={mode} onChange={setMode} options={MODES} />
          {mode === 'level' ? (
            <RadioCards label="Compression level" value={level} onChange={setLevel} options={LEVELS} />
          ) : (
            <>
              <div className="size-chips" role="group" aria-label="Common sizes">
                {SIZE_TARGETS.map((s) => (
                  <button
                    key={s.slug}
                    type="button"
                    className={`chip ${targetBytes === s.bytes ? 'is-active' : ''}`}
                    onClick={() => setTarget(initialTarget(s.bytes))}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <Field label="Make each file smaller than" error={targetOk ? null : 'Pick at least 10 KB.'}>
                <div className="target-row">
                  <NumberInput
                    value={target.amount}
                    min={0}
                    step={target.unit === 'MB' ? 0.1 : 10}
                    onChange={(amount) => setTarget((t) => ({ ...t, amount }))}
                    aria-label="Target size"
                  />
                  <Segmented
                    label="Unit"
                    value={target.unit}
                    onChange={(unit) => setTarget((t) => ({ ...t, unit }))}
                    options={UNITS}
                  />
                </div>
              </Field>
              <p className="side-text small">
                PDFwise tries several quality settings and keeps the sharpest one that fits — handy for job portals,
                admission forms and email limits.
              </p>
            </>
          )}
          {mode === 'level' && (
            <p className="side-text small">
              Compression re-encodes the photos and scans inside your PDF. Text and vector graphics stay sharp and
              selectable.
            </p>
          )}
        </>
      }
      hint={broken.length ? `Remove “${broken[0].file.name}” — it can’t be opened.` : null}
      disabled={broken.length > 0 || !targetOk}
      onAction={compress}
    />
  )
}
