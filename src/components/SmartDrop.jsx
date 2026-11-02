import { ArrowRight, ClipboardPaste, Command, Sparkles, Upload, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { analyzeFiles, findUrl } from '../lib/analyze.js'
import { pluralize, uid } from '../lib/files.js'
import { EXCITE, openPalette } from '../lib/events.js'
import { bucket, track } from '../lib/analytics.js'
import { handOff } from '../lib/handoff.js'
import { tiltHandlers, usePaste, useWindowFileDrop } from '../lib/hooks.js'
import { PWA_EVENT, takeIncoming } from '../lib/pwa.js'
import { TOOLS_BY_ID } from '../tools.js'
import ToolIcon from './ToolIcon.jsx'

const ACCEPT = '.pdf,application/pdf,image/*,.doc,.docx,.odt,.rtf,.txt,.xls,.xlsx,.ods,.csv,.ppt,.pptx,.odp'
const excite = (on) => window.dispatchEvent(new CustomEvent(EXCITE, { detail: on }))

/**
 * Drop (or paste) any file on the home page: PDFwise looks at it and suggests the tools
 * that fit — a scan gets OCR, a big file gets Compress, a locked one gets Unlock.
 */
const dropTilt = tiltHandlers(8)

export default function SmartDrop() {
  const navigate = useNavigate()
  const input = useRef(null)
  const [state, setState] = useState({ phase: 'idle' })
  const [over, setOver] = useState(false)

  const analyze = useCallback(async (list) => {
    if (!list?.length) return
    setState({ phase: 'busy' })
    excite(true)
    try {
      const result = await analyzeFiles(list)
      track('Smart drop', { kind: result.kind ?? 'unsupported', files: bucket(Array.from(list).length), best: result.picks[0]?.id })
      setState(result.kind ? { phase: 'done', ...result } : { phase: 'error', message: 'PDFwise can’t work with that file type. Try a PDF, image or Office document.' })
    } catch (e) {
      console.error(e)
      setState({ phase: 'error', message: 'Couldn’t read that file.' })
    } finally {
      excite(false)
    }
  }, [])

  // Files shared from another app, or opened with PDFwise from the desktop.
  useEffect(() => {
    const pickUp = () => {
      const got = takeIncoming()
      if (!got) return
      if (got.files.length) analyze(got.files)
      else {
        const url = findUrl(got.text)
        if (url) {
          handOff('html-to-pdf', [], { url })
          navigate('/html-to-pdf')
        }
      }
    }
    pickUp()
    const on = (e) => e.detail.type === 'incoming' && pickUp()
    window.addEventListener(PWA_EVENT, on)
    return () => window.removeEventListener(PWA_EVENT, on)
  }, [analyze, navigate])

  // Drop anywhere on the home page; paste files, or a link for HTML to PDF.
  useWindowFileDrop({
    onDrop: analyze,
    onActive: (on) => {
      setOver(on)
      excite(on)
    },
  })
  usePaste({
    onFiles: analyze,
    onText: (text) => {
      const url = findUrl(text)
      if (!url) return false
      handOff('html-to-pdf', [], { url })
      navigate('/html-to-pdf')
      return true
    },
  })

  const open = (id) => {
    const tool = TOOLS_BY_ID[id]
    const files = tool.multiple ? state.files : state.files.slice(0, 1)
    track('Smart drop pick', { tool: id, rank: state.picks.findIndex((p) => p.id === id) + 1 })
    handOff(id, files.map((file) => ({ id: uid(), file })), { source: 'smart-drop' })
    navigate(`/${id}`)
  }

  return (
    <div className={`smart-drop ${over ? 'is-over' : ''} is-${state.phase}`} {...dropTilt}>
      {state.phase === 'done' ? (
        <div className="sd-result">
          <div className="sd-head">
            <Sparkles size={18} />
            <span>
              {state.facts.join(' · ')}
              {state.skipped > 0 && ` · ${pluralize(state.skipped, 'other file')} skipped`}
            </span>
            <button type="button" className="icon-btn sd-close" aria-label="Clear" onClick={() => setState({ phase: 'idle' })}>
              <X size={18} />
            </button>
          </div>
          <h2 className="sd-title">Here’s what you can do</h2>
          <div className="sd-picks">
            {state.picks.map((p, i) => {
              const t = TOOLS_BY_ID[p.id]
              return (
                <button key={p.id} type="button" className={`sd-pick ${i === 0 ? 'is-best' : ''}`} style={{ '--c': t.color, '--i': i }} onClick={() => open(p.id)}>
                  <ToolIcon tool={t} size="sm" />
                  <span className="sd-pick-text">
                    <strong>
                      {t.name}
                      {i === 0 && <em>Best match</em>}
                    </strong>
                    <small>{p.reason}</small>
                  </span>
                  <ArrowRight size={18} className="sd-go" />
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="sd-idle">
          <div className="sd-orb" aria-hidden="true">
            {state.phase === 'busy' ? <span className="spinner" /> : <Upload size={28} />}
          </div>
          <h2 className="sd-title">{over ? 'Let go — we’ll take it from here' : state.phase === 'busy' ? 'Looking at your file…' : 'Drop any file. We’ll pick the right tool.'}</h2>
          <p className="sd-sub">PDF, images, Word, Excel or PowerPoint — checked on your device, never uploaded.</p>
          <div className="sd-actions">
            <button type="button" className="btn btn-primary btn-lg" onClick={() => input.current.click()}>
              <Upload size={18} /> Choose files
            </button>
            <button type="button" className="btn btn-ghost btn-lg" onClick={openPalette}>
              <Command size={18} /> Search tools
            </button>
          </div>
          <p className="sd-keys">
            <ClipboardPaste size={14} /> Paste a file or link with <kbd>Ctrl</kbd>+<kbd>V</kbd> · Search with <kbd>Ctrl</kbd>+<kbd>K</kbd>
          </p>
          {state.phase === 'error' && (
            <p className="sd-error" role="alert">
              {state.message}
            </p>
          )}
        </div>
      )}
      <input
        ref={input}
        type="file"
        hidden
        multiple
        accept={ACCEPT}
        onChange={(e) => {
          analyze(Array.from(e.target.files))
          e.target.value = ''
        }}
      />
    </div>
  )
}
