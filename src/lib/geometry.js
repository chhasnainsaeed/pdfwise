/**
 * Describes a pdf-lib page as the reader sees it: width/height after the page's
 * /Rotate is applied, plus a mapping from visual coordinates (origin bottom-left,
 * in points) to the page's own user space. Anything drawn at the mapped point with
 * `rotate: degrees(frame.rotation + angle)` appears upright (or at `angle`) on screen.
 */
export function visualFrame(page) {
  const { x, y, width: W, height: H } = page.getCropBox()
  const raw = page.getRotation().angle
  const rotation = (((Math.round(raw / 90) * 90) % 360) + 360) % 360
  const quarter = rotation === 90 || rotation === 270
  return {
    rotation,
    width: quarter ? H : W,
    height: quarter ? W : H,
    toUser(vx, vy) {
      switch (rotation) {
        case 90:
          return { x: x + W - vy, y: y + vx }
        case 180:
          return { x: x + W - vx, y: y + H - vy }
        case 270:
          return { x: x + vy, y: y + H - vx }
        default:
          return { x: x + vx, y: y + vy }
      }
    },
    /** Converts visual margins (top/right/bottom/left) to user-space margins. */
    toUserMargins({ top, right, bottom, left }) {
      switch (rotation) {
        case 90:
          return { left: top, right: bottom, bottom: left, top: right }
        case 180:
          return { left: right, right: left, top: bottom, bottom: top }
        case 270:
          return { right: top, left: bottom, top: left, bottom: right }
        default:
          return { top, right, bottom, left }
      }
    },
  }
}

export function hexToRgb01(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  const n = m ? parseInt(m[1], 16) : 0
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

/** Centers for a tiled watermark across a visual page. */
export function tileCenters(pageW, pageH, textW, textH, angleDeg) {
  const a = (angleDeg * Math.PI) / 180
  const boxW = Math.abs(textW * Math.cos(a)) + Math.abs(textH * Math.sin(a))
  const boxH = Math.abs(textW * Math.sin(a)) + Math.abs(textH * Math.cos(a))
  const stepX = Math.max(boxW * 0.85, textW * 0.5) + textH * 2.5
  const stepY = Math.max(boxH * 0.6, textH * 2) + textH * 2.5
  const centers = []
  let row = 0
  for (let cy = pageH - stepY / 2; cy > -stepY; cy -= stepY, row++) {
    const offset = row % 2 ? stepX / 2 : 0
    for (let cx = -stepX + offset; cx < pageW + stepX; cx += stepX) centers.push([cx, cy])
  }
  return centers
}
