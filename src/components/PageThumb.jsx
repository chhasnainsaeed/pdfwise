import { useEffect, useRef, useState } from 'react'
import { getPageSize, getThumb } from '../lib/pdfjs.js'

/**
 * A rendered PDF page, sized to fit `size`×`size` (or `fitW`×`fitH`) while keeping
 * its aspect ratio. `rotation` turns the image visually (multiples of 90°).
 * `children` may be a function receiving { width, height, boxW, boxH } so overlays
 * can be positioned in page points.
 */
export default function PageThumb({ file, page, size = 150, fitW, fitH, rotation = 0, className = '', children }) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)
  const [dims, setDims] = useState(null)
  const [thumb, setThumb] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    getPageSize(file, page).then(
      (d) => alive && setDims(d),
      () => alive && setFailed(true),
    )
    return () => {
      alive = false
    }
  }, [file, page])

  useEffect(() => {
    const el = ref.current
    if (!el || visible) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          io.disconnect()
        }
      },
      { rootMargin: '600px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [visible])

  const W = fitW ?? size
  const H = fitH ?? size
  const ratio = dims ? dims.width / dims.height : 1 / Math.SQRT2
  const quarter = ((rotation % 360) + 360) % 180 === 90
  const vr = quarter ? 1 / ratio : ratio
  const boxW = Math.max(1, Math.min(W, H * vr))
  const boxH = Math.max(1, boxW / vr)
  const imgW = quarter ? boxH : boxW
  const imgH = quarter ? boxW : boxH

  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const want = Math.ceil(Math.max(imgW, imgH) * Math.max(dpr, 1.5))

  useEffect(() => {
    if (!visible) return
    let alive = true
    getThumb(file, page, want).then(
      (t) => alive && setThumb(t),
      () => alive && setFailed(true),
    )
    return () => {
      alive = false
    }
  }, [visible, file, page, want])

  return (
    <div ref={ref} className={`thumb ${className}`} style={{ width: boxW, height: boxH }}>
      {thumb ? (
        <img
          src={thumb.url}
          alt={`Page ${page}`}
          draggable={false}
          style={{ width: imgW, height: imgH, transform: `translate(-50%, -50%) rotate(${rotation}deg)` }}
        />
      ) : (
        <div className={`thumb-skeleton ${failed ? 'is-failed' : ''}`} />
      )}
      {dims && (typeof children === 'function' ? children({ ...dims, boxW, boxH }) : children)}
    </div>
  )
}
