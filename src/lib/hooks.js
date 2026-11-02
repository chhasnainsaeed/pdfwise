import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'

/** Shared state for one tool session: files, the run() helper, errors. */
export const SessionContext = createContext(null)
export const useSession = () => useContext(SessionContext)

export function moveItem(list, from, to) {
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/** HTML5 drag-to-reorder for a list held in state. */
export function useReorder(setItems) {
  const from = useRef(null)
  const [over, setOver] = useState(null)
  const [dragging, setDragging] = useState(null)
  const end = () => {
    from.current = null
    setOver(null)
    setDragging(null)
  }
  const bind = (index) => ({
    draggable: true,
    onDragStart: (e) => {
      from.current = index
      setDragging(index)
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', String(index))
    },
    onDragOver: (e) => {
      if (from.current === null) return
      e.preventDefault()
      if (over !== index) setOver(index)
    },
    onDrop: (e) => {
      e.preventDefault()
      const src = from.current
      if (src !== null && src !== index) setItems((list) => moveItem(list, src, index))
      end()
    },
    onDragEnd: end,
  })
  return { bind, over, dragging }
}

/** Tracks an element's content-box size. */
export function useElementSize() {
  const ref = useRef(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    // Measure right away; ResizeObserver only reports on the next rendered frame.
    const rect = el.getBoundingClientRect()
    setSize({ width: rect.width, height: rect.height })
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize((s) => (Math.abs(s.width - width) < 1 && Math.abs(s.height - height) < 1 ? s : { width, height }))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, size]
}

/** Object URL for a File, revoked when the file changes or the component unmounts. */
export function useObjectUrl(file) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    if (!file) return
    const u = URL.createObjectURL(file)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [file])
  return url
}

const hasFiles = (e) => Array.from(e.dataTransfer?.types ?? []).includes('Files')
const isEditable = (el) => Boolean(el?.closest?.('input, textarea, select, [contenteditable="true"]'))

/** Keeps the latest value in a ref, so window listeners can call fresh callbacks without re-binding. */
function useLatest(value) {
  const ref = useRef(value)
  ref.current = value
  return ref
}

/**
 * Page-wide file drag & drop. File drags are always captured so the browser never navigates
 * away to the dropped file; `enabled` decides whether a drop is accepted.
 * onActive(true/false) fires when a file drag enters and leaves the window.
 */
export function useWindowFileDrop({ enabled = true, onDrop, onActive }) {
  const latest = useLatest({ enabled, onDrop, onActive })
  useEffect(() => {
    let depth = 0
    const enter = (e) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      if (depth++ === 0 && latest.current.enabled) latest.current.onActive?.(true)
    }
    const over = (e) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = latest.current.enabled ? 'copy' : 'none'
    }
    const leave = (e) => {
      if (!hasFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (!depth) latest.current.onActive?.(false)
    }
    const drop = (e) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      latest.current.onActive?.(false)
      if (latest.current.enabled) latest.current.onDrop(Array.from(e.dataTransfer.files))
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [latest])
}

/**
 * Ctrl+V anywhere on the page (except while typing in a field). Pasted files go to onFiles;
 * otherwise the clipboard text goes to onText, which returns true when it used it.
 */
export function usePaste({ enabled = true, onFiles, onText }) {
  const latest = useLatest({ enabled, onFiles, onText })
  useEffect(() => {
    const paste = (e) => {
      const { enabled, onFiles, onText } = latest.current
      if (!enabled || isEditable(e.target)) return
      const files = Array.from(e.clipboardData?.files ?? [])
      if (files.length) {
        if (onFiles) {
          e.preventDefault()
          onFiles(files)
        }
      } else if (onText?.(e.clipboardData?.getData('text') ?? '')) {
        e.preventDefault()
      }
    }
    window.addEventListener('paste', paste)
    return () => window.removeEventListener('paste', paste)
  }, [latest])
}

/**
 * Pointer handlers that tilt an element toward the pointer, up to `maxDeg` degrees. They set the CSS
 * variables --rx/--ry (angles) and --gx/--gy (pointer position, for a glare); the CSS applies them.
 */
export function tiltHandlers(maxDeg) {
  return {
    onPointerMove(e) {
      if (e.pointerType === 'touch') return
      const el = e.currentTarget
      const r = el.getBoundingClientRect()
      const x = (e.clientX - r.left) / r.width
      const y = (e.clientY - r.top) / r.height
      el.style.setProperty('--ry', `${(x - 0.5) * maxDeg}deg`)
      el.style.setProperty('--rx', `${-(y - 0.5) * maxDeg}deg`)
      el.style.setProperty('--gx', `${x * 100}%`)
      el.style.setProperty('--gy', `${y * 100}%`)
    },
    onPointerLeave(e) {
      e.currentTarget.style.setProperty('--rx', '0deg')
      e.currentTarget.style.setProperty('--ry', '0deg')
    },
  }
}
