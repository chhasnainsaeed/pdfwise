import { useState } from 'react'
import FileCard from '../components/FileCard.jsx'
import ToolLayout from '../components/ToolLayout.jsx'
import { Checkbox, Field, Segmented } from '../components/controls.jsx'
import { imagesToPdf, imagesToSeparatePdfs } from '../lib/convert.js'
import { PDF_TYPE, baseName } from '../lib/files.js'
import { moveItem, useObjectUrl, useReorder, useSession } from '../lib/hooks.js'

function ImageThumb({ file, orientation, size }) {
  const url = useObjectUrl(file)
  const [ratio, setRatio] = useState(null)
  let pageRatio = null
  if (size !== 'fit' && ratio) {
    const portrait = size === 'letter' ? 612 / 792 : 595.28 / 841.89
    const landscape = orientation === 'landscape' || (orientation === 'auto' && ratio > 1)
    pageRatio = landscape ? 1 / portrait : portrait
  }
  const img = url && (
    <img
      src={url}
      alt=""
      draggable={false}
      className="image-thumb"
      onLoad={(e) => setRatio(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)}
    />
  )
  if (!pageRatio) return <div className="image-frame is-fit">{img}</div>
  const w = pageRatio < 1 ? 140 * pageRatio : 140
  const h = pageRatio < 1 ? 140 : 140 / pageRatio
  return (
    <div className="image-frame is-page" style={{ width: w, height: h }}>
      {img}
    </div>
  )
}

export default function ImagesToPdf() {
  const { files, setFiles, run } = useSession()
  const { bind, over, dragging } = useReorder(setFiles)
  const [size, setSize] = useState('a4')
  const [orientation, setOrientation] = useState('auto')
  const [margin, setMargin] = useState('none')
  const [single, setSingle] = useState(true)

  const convert = () =>
    run(async ({ progress }) => {
      const opts = { size, orientation, margin }
      const list = files.map((f) => f.file)
      if (single || list.length === 1) {
        const name = list.length === 1 ? `${baseName(list[0].name)}.pdf` : 'images.pdf'
        return { files: [{ name, type: PDF_TYPE, data: await imagesToPdf(list, opts, progress) }] }
      }
      const out = await imagesToSeparatePdfs(list, opts, progress)
      return { files: out.map((f) => ({ ...f, type: PDF_TYPE })), zipName: 'images-pdf.zip' }
    })

  return (
    <ToolLayout
      main={
        <div className="file-grid">
          {files.map((item, i) => (
            <FileCard
              key={item.id}
              item={item}
              thumb={<ImageThumb file={item.file} size={size} orientation={orientation} />}
              meta=""
              index={i}
              total={files.length}
              onMove={(d) => setFiles((list) => moveItem(list, i, i + d))}
              onRemove={() => setFiles((list) => list.filter((f) => f.id !== item.id))}
              dragProps={bind(i)}
              isOver={over === i && dragging !== i}
              isDragging={dragging === i}
            />
          ))}
        </div>
      }
      sidebar={
        <>
          <Field label="Page size">
            <Segmented
              label="Page size"
              value={size}
              onChange={setSize}
              options={[
                { value: 'a4', label: 'A4' },
                { value: 'letter', label: 'Letter' },
                { value: 'fit', label: 'Fit image' },
              ]}
            />
          </Field>
          {size !== 'fit' && (
            <Field label="Orientation">
              <Segmented
                label="Orientation"
                value={orientation}
                onChange={setOrientation}
                options={[
                  { value: 'auto', label: 'Auto' },
                  { value: 'portrait', label: 'Portrait' },
                  { value: 'landscape', label: 'Landscape' },
                ]}
              />
            </Field>
          )}
          <Field label="Margin">
            <Segmented
              label="Margin"
              value={margin}
              onChange={setMargin}
              options={[
                { value: 'none', label: 'None' },
                { value: 'small', label: 'Small' },
                { value: 'big', label: 'Big' },
              ]}
            />
          </Field>
          {files.length > 1 && (
            <Checkbox checked={single} onChange={setSingle}>
              Put all images in one PDF
            </Checkbox>
          )}
        </>
      }
      onAction={convert}
    />
  )
}
