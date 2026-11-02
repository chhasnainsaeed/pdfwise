import { CanvasTexture, SRGBColorSpace } from 'three'

const W = 300
const H = 400
const KIND_TAG = { any: 'AUTO', pdf: 'PDF', image: 'JPG', word: 'DOC', excel: 'XLS', powerpoint: 'PPT', url: 'URL' }
const LINE_WIDTHS = [0.86, 0.72, 0.8, 0.6, 0.78, 0.5]

/** Splits `text` into lines that fit `maxWidth` with the context's current font. */
function wrap(g, text, maxWidth) {
  const lines = []
  let line = ''
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word
    if (line && g.measureText(next).width > maxWidth) {
      lines.push(line)
      line = word
    } else line = next
  }
  return [...lines, line]
}

/** A little document for a tool: colored title band with its name, a file-type chip and text lines. */
export function pageTexture(tool) {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const g = canvas.getContext('2d')

  // Paper, title band and a soft highlight, clipped to rounded corners.
  g.beginPath()
  g.roundRect(0, 0, W, H, 22)
  g.fillStyle = '#ffffff'
  g.fill()
  g.save()
  g.clip()
  g.fillStyle = tool.color
  g.fillRect(0, 0, W, 118)
  g.fillStyle = 'rgba(255,255,255,0.18)'
  g.beginPath()
  g.arc(W - 30, 10, 80, 0, Math.PI * 2)
  g.fill()
  g.restore()

  // Tool name: up to two lines.
  g.fillStyle = '#ffffff'
  g.font = '800 30px Inter, system-ui, sans-serif'
  const lines = wrap(g, tool.name, W - 48)
  lines.slice(0, 2).forEach((l, i) => g.fillText(l, 24, (lines.length > 1 ? 50 : 70) + i * 36))

  // File-type chip.
  const tag = KIND_TAG[tool.kind] ?? 'PDF'
  g.font = '800 20px Inter, system-ui, sans-serif'
  g.beginPath()
  g.roundRect(24, 144, g.measureText(tag).width + 24, 34, 10)
  g.fillStyle = `${tool.color}22`
  g.fill()
  g.fillStyle = tool.color
  g.fillText(tag, 36, 168)

  // Text lines.
  g.fillStyle = '#e7e6f1'
  LINE_WIDTHS.forEach((f, i) => {
    g.beginPath()
    g.roundRect(24, 206 + i * 28, (W - 48) * f, 12, 6)
    g.fill()
  })

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 4
  return texture
}
