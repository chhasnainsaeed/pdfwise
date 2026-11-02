import { lazy } from 'react'

// Each tool loads on demand so heavy libraries (OCR, qpdf, docx) only download when used.
const pagePicker = (mode) =>
  lazy(() => import('./PagePicker.jsx').then((m) => ({ default: () => <m.default mode={mode} /> })))

export const TOOL_COMPONENTS = {
  'merge-pdf': lazy(() => import('./Merge.jsx')),
  'split-pdf': lazy(() => import('./Split.jsx')),
  'remove-pages': pagePicker('remove'),
  'extract-pages': pagePicker('extract'),
  'organize-pdf': lazy(() => import('./Organize.jsx')),
  'compress-pdf': lazy(() => import('./Compress.jsx')),
  'repair-pdf': lazy(() => import('./Repair.jsx')),
  'ocr-pdf': lazy(() => import('./Ocr.jsx')),
  'images-to-pdf': lazy(() => import('./ImagesToPdf.jsx')),
  'pdf-to-jpg': lazy(() => import('./PdfToJpg.jsx')),
  'pdf-to-word': lazy(() => import('./PdfToWord.jsx')),
  'word-to-pdf': lazy(() => import('./OfficeToPdf.jsx')),
  'excel-to-pdf': lazy(() => import('./OfficeToPdf.jsx')),
  'powerpoint-to-pdf': lazy(() => import('./OfficeToPdf.jsx')),
  'html-to-pdf': lazy(() => import('./HtmlToPdf.jsx')),
  'rotate-pdf': lazy(() => import('./Rotate.jsx')),
  'add-page-numbers': lazy(() => import('./PageNumbers.jsx')),
  'add-watermark': lazy(() => import('./Watermark.jsx')),
  'crop-pdf': lazy(() => import('./Crop.jsx')),
  'edit-pdf': lazy(() => import('./EditPdf.jsx')),
  'sign-pdf': lazy(() => import('./Sign.jsx')),
  'protect-pdf': lazy(() => import('./Protect.jsx')),
  'unlock-pdf': lazy(() => import('./Unlock.jsx')),
  'redact-pdf': lazy(() => import('./Redact.jsx')),
  'pdf-to-pdfa': lazy(() => import('./PdfA.jsx')),
}
