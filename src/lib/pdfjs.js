import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { useEffect, useState } from 'react'
import { canvasToBlob } from './files.js'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

const docs = new WeakMap()

/** Opens a File with PDF.js once and reuses the document afterwards. */
export function getPdf(file) {
  let p = docs.get(file)
  if (!p) {
    p = file.arrayBuffer().then((data) => pdfjsLib.getDocument({ data, isEvalSupported: false }).promise)
    docs.set(file, p)
  }
  return p
}

/** Visual page size in PDF points (rotation already applied). */
export async function getPageSize(file, pageNumber) {
  const pdf = await getPdf(file)
  const page = await pdf.getPage(pageNumber)
  const { width, height } = page.getViewport({ scale: 1 })
  return { width, height }
}

/**
 * Renders a page to a canvas. Pass either `scale` or `longSide` (pixels).
 * `intent: 'print'` is used for exports: PDF.js then skips requestAnimationFrame,
 * so conversion keeps going while the tab is in the background. `hideText` leaves out
 * text drawn with fonts (for page backgrounds behind editable text).
 */
export async function renderPage(file, pageNumber, { scale, longSide, intent = 'display', hideText = false }) {
  const pdf = await getPdf(file)
  const page = await pdf.getPage(pageNumber)
  const base = page.getViewport({ scale: 1 })
  const s = scale ?? longSide / Math.max(base.width, base.height)
  const viewport = page.getViewport({ scale: s })
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(viewport.width))
  canvas.height = Math.max(1, Math.round(viewport.height))
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  if (hideText) ctx.fillText = ctx.strokeText = () => {}
  await page.render({ canvasContext: ctx, viewport, intent }).promise
  return { canvas, width: base.width, height: base.height }
}

export function pdfErrorLabel(err) {
  if (err?.name === 'PasswordException') return 'Password protected'
  if (err?.name === 'InvalidPDFException') return 'Not a valid PDF'
  return 'Could not read file'
}

// --- Thumbnails: rendered lazily, a few at a time, and cached as object URLs ---

const thumbs = new Map()
const queue = []
let running = 0
const MAX_PARALLEL = 3

function enqueue(task) {
  return new Promise((resolve, reject) => {
    queue.push({ task, resolve, reject })
    pump()
  })
}

function pump() {
  while (running < MAX_PARALLEL && queue.length) {
    const { task, resolve, reject } = queue.shift()
    running++
    task()
      .then(resolve, reject)
      .finally(() => {
        running--
        pump()
      })
  }
}

const fileIds = new WeakMap()
let nextFileId = 0
const fileKey = (f) => {
  if (!fileIds.has(f)) fileIds.set(f, ++nextFileId)
  return fileIds.get(f)
}

const BUCKETS = [240, 480, 960, 1600, 2200]

export function getThumb(file, pageNumber, longSide = 240) {
  const size = BUCKETS.find((b) => b >= longSide) ?? BUCKETS[BUCKETS.length - 1]
  const key = `${fileKey(file)}:${pageNumber}:${size}`
  if (!thumbs.has(key)) {
    const p = enqueue(async () => {
      const { canvas, width, height } = await renderPage(file, pageNumber, { longSide: size })
      const blob = await canvasToBlob(canvas, 'image/jpeg', 0.86)
      canvas.width = canvas.height = 0
      return { url: URL.createObjectURL(blob), width, height }
    })
    p.catch(() => thumbs.delete(key))
    thumbs.set(key, p)
  }
  return thumbs.get(key)
}

/** Page count (or an error label) for each `{ id, file }` item, keyed by id. */
export function usePdfInfo(items) {
  const [info, setInfo] = useState({})
  useEffect(() => {
    let alive = true
    for (const { id, file } of items) {
      getPdf(file).then(
        (pdf) => alive && setInfo((s) => (s[id]?.pages ? s : { ...s, [id]: { pages: pdf.numPages } })),
        (err) => alive && setInfo((s) => (s[id]?.error ? s : { ...s, [id]: { error: pdfErrorLabel(err) } })),
      )
    }
    return () => {
      alive = false
    }
  }, [items])
  return info
}
