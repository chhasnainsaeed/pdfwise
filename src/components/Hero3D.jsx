import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { createHeroScene } from './hero/scene.js'

/** The 3D home-page scene (three.js, loaded on demand). Clicking a page opens its tool. */
export default function Hero3D() {
  const host = useRef(null)
  const navigate = useNavigate()
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate

  useEffect(() => createHeroScene(host.current, (tool) => navigateRef.current(`/${tool.id}`)), [])

  return <div ref={host} className="hero3d-stage" aria-hidden="true" />
}
