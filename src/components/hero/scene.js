// The 3D home-page scene: every tool floats as a page on an ellipse around the headline. Pages
// follow the pointer, spread out while files are dragged, and open their tool when clicked.
// Framework-free: createHeroScene() builds everything and returns a function that tears it down.
import {
  AmbientLight,
  Color,
  DirectionalLight,
  Fog,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  Vector2,
  WebGLRenderer,
} from 'three'
import { EXCITE } from '../../lib/events.js'
import { TOOLS } from '../../tools.js'
import { pageTexture } from './pageTexture.js'

const PAGE_W = 1.5
const PAGE_H = 2.0
const FOG = '#f6f5ff'
const IDLE_FRAME_MS = 32 // ~30 fps while nobody interacts
const INTERACTIVE = 'a, button, input, label, .smart-drop' // pointer over these never picks a page

const ease = (dt, speed) => Math.min(1, dt * speed)

/** One card per tool: front (texture), back and a soft shadow, each with its own fading material. */
function buildPages(ring) {
  const geo = new PlaneGeometry(PAGE_W, PAGE_H)
  const shadowGeo = new PlaneGeometry(PAGE_W * 1.04, PAGE_H * 1.04)
  const pages = TOOLS.map((tool, i) => {
    const front = new Mesh(geo, new MeshStandardMaterial({ map: pageTexture(tool), roughness: 0.55, metalness: 0.02, transparent: true }))
    front.userData.tool = tool
    const back = new Mesh(geo, new MeshStandardMaterial({ color: '#efeefa', roughness: 0.9, transparent: true }))
    back.rotation.y = Math.PI
    back.position.z = -0.005
    const shadow = new Mesh(shadowGeo, new MeshBasicMaterial({ color: '#2a2366', transparent: true, opacity: 0.1, depthWrite: false }))
    shadow.position.set(0.1, -0.14, -0.06)
    const card = new Group()
    card.add(shadow, back, front)
    ring.add(card)
    // Spread around the ellipse, at varied depth, lift, phase and spin so the drift looks natural.
    return {
      card,
      front,
      meshes: [front, back, shadow],
      a: (i / TOOLS.length) * Math.PI * 2,
      z: -1.5 - ((i * 7) % 11) * 0.55,
      lift: ((i * 5) % 7) / 7 - 0.5,
      phase: i * 1.7,
      spin: (((i * 3) % 5) - 2) * 0.12,
      hover: 0,
    }
  })
  const redrawTextures = () =>
    pages.forEach((p, i) => {
      p.front.material.map.dispose()
      p.front.material.map = pageTexture(TOOLS[i])
    })
  const dispose = () => {
    geo.dispose()
    shadowGeo.dispose()
    for (const p of pages) {
      p.front.material.map.dispose()
      p.meshes.forEach((m) => m.material.dispose())
    }
  }
  return { pages, redrawTextures, dispose }
}

/**
 * Mounts the scene in `host` (its parent receives pointer input). `onPick(tool)` runs when a page
 * is clicked. Returns a cleanup function, or nothing when WebGL isn't available.
 */
export function createHeroScene(host, onPick) {
  let renderer
  try {
    renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' })
  } catch {
    return // No WebGL: the CSS background alone still looks fine.
  }
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const section = host.parentElement
  const cleanups = []
  const listen = (target, type, fn, opts) => {
    target.addEventListener(type, fn, opts)
    cleanups.push(() => target.removeEventListener(type, fn, opts))
  }

  // --- Scene ---
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
  renderer.domElement.className = 'hero3d-canvas'
  host.appendChild(renderer.domElement)
  const scene = new Scene()
  scene.fog = new Fog(new Color(FOG), 9, 22)
  const camera = new PerspectiveCamera(42, 1, 0.1, 60)
  camera.position.set(0, 0, 11)
  const sun = new DirectionalLight('#ffffff', 1.3)
  sun.position.set(4, 6, 9)
  const ring = new Group()
  scene.add(new AmbientLight('#ffffff', 1.9), sun, ring)
  const { pages, redrawTextures, dispose: disposePages } = buildPages(ring)
  const fronts = pages.map((p) => p.front)

  // --- State ---
  let rx = 7 // ellipse radii, fitted to the viewport
  let ry = 3.3
  const pointer = new Vector2(-10, -10) // off-screen until the pointer enters
  const ray = new Raycaster()
  let hovered = null
  let overControl = false
  let lastInput = 0
  let excite = 0 // eases toward exciteTarget while files are dragged or analyzed
  let exciteTarget = 0
  let orbit = 0
  let scroll = 0
  let last = performance.now()

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    excite += (exciteTarget - excite) * ease(dt, 4)
    if (!reduced) orbit += dt * (0.035 + excite * 0.5)

    const lookX = pointer.x > -2 ? pointer.x : 0
    const lookY = pointer.x > -2 ? pointer.y : 0
    camera.position.x += (lookX * 1.1 - camera.position.x) * ease(dt, 3)
    camera.position.y += (lookY * 0.7 - scroll * 1.5 - camera.position.y) * ease(dt, 3)
    camera.lookAt(0, -scroll * 1.2, 0)
    ring.rotation.x = scroll * 0.35

    ray.setFromCamera(pointer, camera)
    const hit = pointer.x > -2 && !overControl ? (ray.intersectObjects(fronts, false)[0]?.object ?? null) : null
    if (hit !== hovered) {
      hovered = hit
      section.style.cursor = hovered ? 'pointer' : ''
    }

    const t = now / 1000
    const wobble = (speed, phase, amount) => (reduced ? 0 : Math.sin(t * speed + phase) * amount)
    const spread = 1 + excite * 0.18
    for (const p of pages) {
      const a = p.a + orbit
      p.hover += ((p.front === hovered ? 1 : 0) - p.hover) * ease(dt, 8)
      const calm = 1 - p.hover // a hovered page turns to face the camera
      p.card.position.set(Math.cos(a) * rx * spread, Math.sin(a) * ry * spread + p.lift + wobble(0.8, p.phase, 0.18), p.z + p.hover * 1.6)
      p.card.rotation.set(
        wobble(0.6, p.phase, 0.12) * calm,
        (-Math.cos(a) * 0.45 + p.spin + wobble(0.4, p.phase, 0.15)) * calm,
        (p.spin * 0.6 + excite * Math.sin(t * 3 + p.phase) * 0.3) * calm,
      )
      p.card.scale.setScalar(1 + p.hover * 0.22)
      // Fade pages drifting behind the headline in the middle; keep the edges vivid.
      const clear = Math.min(1, Math.max(0, (Math.abs(p.card.position.x) - rx * 0.28) / (rx * 0.3)))
      const opacity = Math.min(1, Math.max(0.1, clear) + p.hover)
      p.meshes[0].material.opacity = opacity
      p.meshes[1].material.opacity = opacity
      p.meshes[2].material.opacity = 0.1 * opacity
    }
    renderer.render(scene, camera)
  }

  // With reduced motion there's no loop: draw a frame whenever something changes.
  const redraw = () => reduced && frame(performance.now())

  // --- Size ---
  const resize = () => {
    const w = host.clientWidth || 1
    const h = host.clientHeight || 1
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    const visH = 2 * camera.position.z * Math.tan((camera.fov * Math.PI) / 360)
    rx = Math.max(2.6, Math.min(8.2, (visH * camera.aspect) / 2 - 0.6))
    ry = Math.max(2.4, Math.min(3.8, visH / 2 - 0.9))
    redraw()
  }
  const sizeObserver = new ResizeObserver(resize)
  sizeObserver.observe(host)
  cleanups.push(() => sizeObserver.disconnect())

  // --- Input ---
  listen(section, 'pointermove', (e) => {
    lastInput = performance.now()
    const r = host.getBoundingClientRect()
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    redraw()
  })
  listen(section, 'pointerleave', () => pointer.set(-10, -10))
  listen(section, 'pointerover', (e) => (overControl = Boolean(e.target.closest?.(INTERACTIVE))))
  listen(section, 'click', (e) => {
    if (hovered && !e.target.closest?.(INTERACTIVE)) onPick(hovered.userData.tool)
  })
  listen(window, EXCITE, (e) => (exciteTarget = e.detail ? 1 : 0))
  listen(
    window,
    'scroll',
    () => {
      scroll = Math.min(1, window.scrollY / Math.max(1, host.clientHeight))
      redraw()
    },
    { passive: true },
  )

  // --- Loop: only while on screen and the tab is visible ---
  let raf = 0
  let onScreen = true
  let lastFrame = 0
  const loop = (now) => {
    raf = requestAnimationFrame(loop)
    // Full frame rate while someone interacts; 30 fps for the idle drift, which looks the same
    // and halves the GPU and battery cost while people read the page.
    if (now - lastInput > 1500 && excite < 0.01 && now - lastFrame < IDLE_FRAME_MS) return
    lastFrame = now
    frame(now)
  }
  const start = () => {
    if (raf || reduced || !onScreen || document.hidden) return
    last = performance.now()
    raf = requestAnimationFrame(loop)
  }
  const stop = () => {
    cancelAnimationFrame(raf)
    raf = 0
  }
  const visibility = new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting
    onScreen ? start() : stop()
  })
  visibility.observe(host)
  cleanups.push(() => visibility.disconnect())
  listen(document, 'visibilitychange', () => (document.hidden ? stop() : start()))

  resize()
  start()
  redraw()
  // Page textures use Inter: redraw them once the web font has arrived.
  document.fonts?.ready.then(() => {
    redrawTextures()
    frame(performance.now())
  })

  return () => {
    stop()
    cleanups.forEach((fn) => fn())
    section.style.cursor = ''
    disposePages()
    renderer.dispose()
    renderer.domElement.remove()
  }
}
