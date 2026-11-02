import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AmbientLight,
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  Fog,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  SRGBColorSpace,
  Scene,
  Vector2,
  WebGLRenderer,
} from 'three'
import { EXCITE } from '../lib/events.js'
import { TOOLS } from '../tools.js'

const PAGE_W = 1.5
const PAGE_H = 2.0
const FOG = '#f6f5ff'
const KIND_TAG = { any: 'AUTO', pdf: 'PDF', image: 'JPG', word: 'DOC', excel: 'XLS', powerpoint: 'PPT', url: 'URL' }

function roundRect(g, x, y, w, h, r) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

/** A little document: colored title band, the tool's name, a file-type chip and text lines. */
function pageTexture(tool) {
  const W = 300
  const H = 400
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')
  roundRect(g, 0, 0, W, H, 22)
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

  g.fillStyle = '#ffffff'
  g.font = '800 30px Inter, system-ui, sans-serif'
  const words = tool.name.split(' ')
  const lines = []
  let line = ''
  for (const w of words) {
    const next = line ? `${line} ${w}` : w
    if (g.measureText(next).width > W - 48 && line) {
      lines.push(line)
      line = w
    } else line = next
  }
  lines.push(line)
  lines.slice(0, 2).forEach((l, i) => g.fillText(l, 24, (lines.length > 1 ? 50 : 70) + i * 36))

  const tag = KIND_TAG[tool.kind] ?? 'PDF'
  g.font = '800 20px Inter, system-ui, sans-serif'
  const tw = g.measureText(tag).width + 24
  roundRect(g, 24, 144, tw, 34, 10)
  g.fillStyle = `${tool.color}22`
  g.fill()
  g.fillStyle = tool.color
  g.fillText(tag, 36, 168)

  g.fillStyle = '#e7e6f1'
  const widths = [0.86, 0.72, 0.8, 0.6, 0.78, 0.5]
  widths.forEach((f, i) => {
    roundRect(g, 24, 206 + i * 28, (W - 48) * f, 12, 6)
    g.fill()
  })
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

export default function Hero3D() {
  const host = useRef(null)
  const navigate = useNavigate()
  const navRef = useRef(navigate)
  navRef.current = navigate

  useEffect(() => {
    const el = host.current
    if (!el) return
    let renderer
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' })
    } catch {
      return // No WebGL: the CSS background alone still looks fine.
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
    renderer.domElement.className = 'hero3d-canvas'
    el.appendChild(renderer.domElement)

    const scene = new Scene()
    scene.fog = new Fog(new Color(FOG), 9, 22)
    const camera = new PerspectiveCamera(42, 1, 0.1, 60)
    camera.position.set(0, 0, 11)
    scene.add(new AmbientLight('#ffffff', 1.9))
    const sun = new DirectionalLight('#ffffff', 1.3)
    sun.position.set(4, 6, 9)
    scene.add(sun)

    const ring = new Group()
    scene.add(ring)
    const geo = new PlaneGeometry(PAGE_W, PAGE_H)
    const shadowGeo = new PlaneGeometry(PAGE_W * 1.04, PAGE_H * 1.04)
    const backMat = new MeshStandardMaterial({ color: '#efeefa', roughness: 0.9, transparent: true })
    const shadowMat = new MeshBasicMaterial({ color: '#2a2366', transparent: true, opacity: 0.1, depthWrite: false })
    const textures = []
    const fronts = []
    const pages = TOOLS.map((tool, i) => {
      const tex = pageTexture(tool)
      textures.push(tex)
      const card = new Group()
      const front = new Mesh(geo, new MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.02, transparent: true }))
      front.userData.tool = tool
      const back = new Mesh(geo, backMat.clone())
      back.rotation.y = Math.PI
      back.position.z = -0.005
      const shadow = new Mesh(shadowGeo, shadowMat.clone())
      shadow.position.set(0.1, -0.14, -0.06)
      card.add(shadow, back, front)
      fronts.push(front)
      // Spread around an ellipse, with depth, so the headline in the middle stays clear.
      const a = (i / TOOLS.length) * Math.PI * 2
      const p = {
        card,
        front,
        back,
        shadow,
        a,
        z: -1.5 - ((i * 7) % 11) * 0.55,
        lift: ((i * 5) % 7) / 7 - 0.5,
        phase: i * 1.7,
        spin: (((i * 3) % 5) - 2) * 0.12,
        hover: 0,
      }
      ring.add(card)
      return p
    })

    // --- Sizing ---
    let rx = 7
    let ry = 3.3
    const resize = () => {
      const w = el.clientWidth || 1
      const h = el.clientHeight || 1
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      const visH = 2 * camera.position.z * Math.tan((camera.fov * Math.PI) / 360)
      const visW = visH * camera.aspect
      rx = Math.max(2.6, Math.min(8.2, visW / 2 - 0.6))
      ry = Math.max(2.4, Math.min(3.8, visH / 2 - 0.9))
      if (reduced) frame(performance.now())
    }

    // --- Input ---
    const pointer = new Vector2(-10, -10)
    const look = { x: 0, y: 0 }
    const ray = new Raycaster()
    let hovered = null
    // Skip hits while the pointer is over real controls (the drop card, buttons, links).
    let interactiveUnderPointer = false
    const onMove = (e) => {
      const r = el.getBoundingClientRect()
      pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      look.x = pointer.x
      look.y = pointer.y
      if (reduced) frame(performance.now())
    }
    const onLeave = () => {
      pointer.set(-10, -10)
      look.x = look.y = 0
    }
    const interactive = (t) => t.closest?.('a, button, input, label, .smart-drop')
    const onClick = (e) => {
      if (interactive(e.target) || !hovered) return
      navRef.current(`/${hovered.userData.tool.id}`)
    }
    const section = el.parentElement
    section.addEventListener('pointermove', onMove)
    section.addEventListener('pointerleave', onLeave)
    section.addEventListener('click', onClick)

    let excite = 0
    let exciteTarget = 0
    const onExcite = (e) => {
      exciteTarget = e.detail ? 1 : 0
    }
    window.addEventListener(EXCITE, onExcite)

    // --- Loop ---
    let orbit = 0
    let last = performance.now()
    let scroll = 0
    const onScroll = () => {
      scroll = Math.min(1, window.scrollY / Math.max(1, el.clientHeight))
      if (reduced) frame(performance.now())
    }
    window.addEventListener('scroll', onScroll, { passive: true })

    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      excite += (exciteTarget - excite) * Math.min(1, dt * 4)
      if (!reduced) orbit += dt * (0.035 + excite * 0.5)

      camera.position.x += (look.x * 1.1 - camera.position.x) * Math.min(1, dt * 3)
      camera.position.y += (look.y * 0.7 - scroll * 1.5 - camera.position.y) * Math.min(1, dt * 3)
      camera.lookAt(0, -scroll * 1.2, 0)
      ring.rotation.x = scroll * 0.35

      ray.setFromCamera(pointer, camera)
      const hit = pointer.x > -2 && !interactiveUnderPointer ? ray.intersectObjects(fronts, false)[0]?.object ?? null : null
      if (hit !== hovered) {
        hovered = hit
        section.style.cursor = hovered ? 'pointer' : ''
      }

      const t = now / 1000
      const spread = 1 + excite * 0.18
      for (const p of pages) {
        const a = p.a + orbit
        const bob = reduced ? 0 : Math.sin(t * 0.8 + p.phase) * 0.18
        p.hover += ((p.front === hovered ? 1 : 0) - p.hover) * Math.min(1, dt * 8)
        p.card.position.set(Math.cos(a) * rx * spread, Math.sin(a) * ry * spread + p.lift + bob, p.z + p.hover * 1.6)
        const calm = 1 - p.hover
        p.card.rotation.set(
          (reduced ? 0 : Math.sin(t * 0.6 + p.phase) * 0.12) * calm,
          (-Math.cos(a) * 0.45 + p.spin + (reduced ? 0 : Math.sin(t * 0.4 + p.phase) * 0.15)) * calm,
          (p.spin * 0.6 + excite * Math.sin(t * 3 + p.phase) * 0.3) * calm,
        )
        p.card.scale.setScalar(1 + p.hover * 0.22)
        // Fade pages that drift behind the headline in the middle; keep the edges vivid.
        const clear = Math.min(1, Math.max(0, (Math.abs(p.card.position.x) - rx * 0.28) / (rx * 0.3)))
        const fade = Math.max(0.1, clear) + p.hover
        p.front.material.opacity = Math.min(1, fade)
        p.back.material.opacity = Math.min(1, fade)
        p.shadow.material.opacity = 0.1 * Math.min(1, fade)
      }
      renderer.render(scene, camera)
    }

    const onOver = (e) => {
      interactiveUnderPointer = Boolean(interactive(e.target))
    }
    section.addEventListener('pointerover', onOver)

    let raf = 0
    let visible = true
    const loop = (now) => {
      frame(now)
      raf = requestAnimationFrame(loop)
    }
    const start = () => {
      if (!raf && visible && !document.hidden && !reduced) {
        last = performance.now()
        raf = requestAnimationFrame(loop)
      }
    }
    const stop = () => {
      cancelAnimationFrame(raf)
      raf = 0
    }
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      visible ? start() : stop()
    })
    io.observe(el)
    const onVisibility = () => (document.hidden ? stop() : start())
    document.addEventListener('visibilitychange', onVisibility)
    const ro = new ResizeObserver(resize)
    ro.observe(el)
    resize()

    // Page textures use Inter: redraw them once the web font has arrived.
    document.fonts?.ready.then(() => {
      pages.forEach((p, i) => {
        const tex = pageTexture(TOOLS[i])
        p.front.material.map.dispose()
        p.front.material.map = tex
        textures[i] = tex
      })
      frame(performance.now())
    })
    start()
    if (reduced) frame(performance.now())

    return () => {
      stop()
      io.disconnect()
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener(EXCITE, onExcite)
      window.removeEventListener('scroll', onScroll)
      section.removeEventListener('pointermove', onMove)
      section.removeEventListener('pointerleave', onLeave)
      section.removeEventListener('click', onClick)
      section.removeEventListener('pointerover', onOver)
      section.style.cursor = ''
      geo.dispose()
      shadowGeo.dispose()
      backMat.dispose()
      shadowMat.dispose()
      pages.forEach((p) => [p.front, p.back, p.shadow].forEach((m) => m.material.dispose()))
      textures.forEach((tx) => tx.dispose())
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  return <div ref={host} className="hero3d-stage" aria-hidden="true" />
}
