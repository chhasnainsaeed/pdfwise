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
