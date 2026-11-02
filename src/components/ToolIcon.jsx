import {
  Archive,
  Crop,
  EyeOff,
  FileImage,
  FileMinus,
  FileOutput,
  FilePen,
  FileSpreadsheet,
  FileText,
  FileType,
  Globe,
  Hash,
  ImagePlus,
  LayoutGrid,
  Lock,
  LockOpen,
  Merge,
  Minimize2,
  PenLine,
  Presentation,
  RotateCw,
  ScanText,
  Scissors,
  Stamp,
  Workflow,
  Wrench,
} from 'lucide-react'

const ICONS = {
  'pdf-workflows': Workflow,
  'merge-pdf': Merge,
  'split-pdf': Scissors,
  'remove-pages': FileMinus,
  'extract-pages': FileOutput,
  'organize-pdf': LayoutGrid,
  'compress-pdf': Minimize2,
  'images-to-pdf': ImagePlus,
  'pdf-to-jpg': FileImage,
  'rotate-pdf': RotateCw,
  'add-page-numbers': Hash,
  'add-watermark': Stamp,
  'crop-pdf': Crop,
  'sign-pdf': PenLine,
  'edit-pdf': FilePen,
  'protect-pdf': Lock,
  'unlock-pdf': LockOpen,
  'repair-pdf': Wrench,
  'ocr-pdf': ScanText,
  'pdf-to-word': FileText,
  'word-to-pdf': FileType,
  'excel-to-pdf': FileSpreadsheet,
  'powerpoint-to-pdf': Presentation,
  'html-to-pdf': Globe,
  'redact-pdf': EyeOff,
  'pdf-to-pdfa': Archive,
}

export default function ToolIcon({ tool, size = 'md' }) {
  const Icon = ICONS[tool.id]
  return (
    <span className={`tool-icon tool-icon-${size}`} style={{ '--c': tool.color }} aria-hidden="true">
      <Icon strokeWidth={2.1} />
    </span>
  )
}
