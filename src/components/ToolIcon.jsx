import { FileText } from 'lucide-react'
import { ICONS } from './icons.js'

export default function ToolIcon({ tool, size = 'md' }) {
  const Icon = ICONS[tool.icon] ?? FileText
  return (
    <span className={`tool-icon tool-icon-${size}`} style={{ '--c': tool.color }} aria-hidden="true">
      <Icon strokeWidth={2.1} />
    </span>
  )
}
