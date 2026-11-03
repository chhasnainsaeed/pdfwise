import { lazy } from 'react'
import { TOOLS } from '../tools.js'

// Every screen in this folder, as a lazy import. Each tool's code loads on demand, so heavy
// libraries (OCR, qpdf, docx) only download on their own pages.
const SCREENS = import.meta.glob('./*.jsx')

function screen(tool) {
  const load = SCREENS[`./${tool.component}.jsx`]
  if (!load) throw new Error(`Tool “${tool.id}”: src/tools/${tool.component}.jsx doesn't exist`)
  if (!tool.props) return lazy(load)
  return lazy(() => load().then((m) => ({ default: () => <m.default {...tool.props} /> })))
}

/** Tool id → lazy screen component, built from the `component` and `props` fields in src/tools.js. */
export const TOOL_COMPONENTS = Object.fromEntries(TOOLS.filter((t) => t.component).map((t) => [t.id, screen(t)]))
