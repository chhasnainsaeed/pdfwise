import { CloudOff, Download, RefreshCw, Share, SquarePlus, WifiOff, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { PWA_EVENT, applyUpdate, canPromptInstall, isIos, isStandalone, promptInstall } from '../lib/pwa.js'

/** Re-renders whenever the service worker or install state changes. */
function usePwaEvents(handler) {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    const on = (e) => ref.current(e.detail.type)
    window.addEventListener(PWA_EVENT, on)
    return () => window.removeEventListener(PWA_EVENT, on)
  }, [])
}

export function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}

/** Bottom toasts: new version ready, ready to work offline, offline / back online. */
export function AppStatus() {
  const online = useOnline()
  const [update, setUpdate] = useState(false)
  const [toast, setToast] = useState(null)
  const first = useRef(true)

  usePwaEvents((type) => {
    if (type === 'update') setUpdate(true)
    if (type === 'offline-ready') setToast({ icon: CloudOff, text: 'PDFwise is ready to work offline.' })
    if (type === 'installed')
      setToast({ icon: SquarePlus, text: 'Installed — open PDFwise from your home screen or app list.' })
  })

  useEffect(() => {
    if (first.current) {
      first.current = false
      if (online) return
    }
    setToast(
      online
        ? { icon: RefreshCw, text: 'Back online.' }
        : {
            icon: WifiOff,
            text: 'You’re offline. Tools that run in your browser keep working; Office and web-page conversions need a connection.',
            sticky: true,
          },
    )
  }, [online])

  useEffect(() => {
    if (!toast || toast.sticky) return
    const t = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(t)
  }, [toast])

  return (
    <div className="app-toasts" aria-live="polite">
      {update && (
        <div className="app-toast is-update">
          <RefreshCw size={18} />
          <span>A new version of PDFwise is ready.</span>
          <button type="button" className="btn btn-primary" onClick={applyUpdate}>
            Reload
          </button>
          <button type="button" className="icon-btn" aria-label="Later" onClick={() => setUpdate(false)}>
            <X size={16} />
          </button>
        </div>
      )}
      {toast && (
        <div className="app-toast">
          <toast.icon size={18} />
          <span>{toast.text}</span>
          <button type="button" className="icon-btn" aria-label="Dismiss" onClick={() => setToast(null)}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  )
}

/** "Install app": the browser's prompt where there is one, step-by-step help on iPhone/iPad. */
export function InstallButton() {
  const [available, setAvailable] = useState(canPromptInstall)
  const [installed, setInstalled] = useState(isStandalone)
  const [help, setHelp] = useState(false)
  const ios = isIos()

  usePwaEvents((type) => {
    if (type === 'installable') setAvailable(true)
    if (type === 'installed') {
      setAvailable(false)
      setInstalled(true)
    }
  })

  if (installed || (!available && !ios)) return null

  return (
    <div className="install-wrap">
      <button type="button" className="install-btn" onClick={() => (available ? promptInstall() : setHelp((h) => !h))}>
        <Download size={16} />
        <span>Install app</span>
      </button>
      {help && (
        <div className="install-help" role="dialog" aria-label="Install on iPhone or iPad">
          <strong>Add PDFwise to your Home Screen</strong>
          <ol>
            <li>
              Tap <Share size={15} /> <b>Share</b> in Safari’s toolbar.
            </li>
            <li>
              Choose <SquarePlus size={15} /> <b>Add to Home Screen</b>.
            </li>
          </ol>
          <p>It opens full-screen and works offline.</p>
          <button type="button" className="icon-btn" aria-label="Close" onClick={() => setHelp(false)}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
