import { Globe, ServerOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import ToolLayout from '../components/ToolLayout.jsx'
import { Checkbox, Field, Segmented } from '../components/controls.jsx'
import { PDF_TYPE } from '../lib/files.js'
import { useSession } from '../lib/hooks.js'
import { convertUrlOnServer, normalizeUrl, serverStatus } from '../lib/server.js'

export default function HtmlToPdf() {
  const { run } = useSession()
  const [url, setUrl] = useState('')
  const [format, setFormat] = useState('A4')
  const [orientation, setOrientation] = useState('portrait')
  const [margin, setMargin] = useState('small')
  const [background, setBackground] = useState(true)
  const [screen, setScreen] = useState(false)
  const [status, setStatus] = useState(null)

  useEffect(() => {
    serverStatus().then(setStatus)
  }, [])

  const target = normalizeUrl(url)
  const ready = status?.ok && status.browser && target

  const convert = () => {
    if (!ready) return
    run(async () => {
      const data = await convertUrlOnServer(target, { format, landscape: orientation === 'landscape', margin, background, screen })
      const host = new URL(target).hostname.replace(/^www\./, '')
      return { files: [{ name: `${host}.pdf`, type: PDF_TYPE, data }] }
    })
  }

  let hint = null
  if (!status) hint = 'Checking the conversion server…'
  else if (!status.ok) hint = 'The conversion server isn’t running.'
  else if (!status.browser) hint = 'No Chrome or Edge browser was found on the server.'
  else if (!url.trim()) hint = 'Paste the address of a web page.'
  else if (!target) hint = 'That doesn’t look like a web address.'

  return (
    <ToolLayout
      main={
        <div className="url-stage">
          <div className="url-card">
            <span className="url-icon">
              <Globe size={30} />
            </span>
            <h2>Which page should become a PDF?</h2>
            <form
              className="url-form"
              onSubmit={(e) => {
                e.preventDefault()
                convert()
              }}
            >
              <input
                className="text-input url-input"
                type="text"
                inputMode="url"
                placeholder="https://example.com/article"
                value={url}
                autoFocus
                spellCheck={false}
                onChange={(e) => setUrl(e.target.value)}
                aria-label="Web page address"
              />
            </form>
            {target && <p className="url-preview">Will convert {target}</p>}
            {status && !status.ok && (
              <div className="status-note is-unknown">
                <ServerOff size={18} />
                <span>
                  Start the conversion server with <code>npm run server</code>, then reload this page.
                </span>
              </div>
            )}
          </div>
        </div>
      }
      sidebar={
        <>
          <Field label="Page size">
            <Segmented
              label="Page size"
              value={format}
              onChange={setFormat}
              options={[
                { value: 'A4', label: 'A4' },
                { value: 'Letter', label: 'Letter' },
              ]}
            />
          </Field>
          <Field label="Orientation">
            <Segmented
              label="Orientation"
              value={orientation}
              onChange={setOrientation}
              options={[
                { value: 'portrait', label: 'Portrait' },
                { value: 'landscape', label: 'Landscape' },
              ]}
            />
          </Field>
          <Field label="Margins">
            <Segmented
              label="Margins"
              value={margin}
              onChange={setMargin}
              options={[
                { value: 'none', label: 'None' },
                { value: 'small', label: 'Small' },
                { value: 'normal', label: 'Normal' },
              ]}
            />
          </Field>
          <div className="check-list">
            <Checkbox checked={background} onChange={setBackground}>
              Include background colors and images
            </Checkbox>
            <Checkbox checked={screen} onChange={setScreen}>
              Keep the on-screen look (ignore print styles)
            </Checkbox>
          </div>
          <p className="side-text small">
            Your PDFwise server opens the page in a headless browser and prints it. Pages behind a login can’t be
            converted, and addresses on local or private networks are blocked.
          </p>
        </>
      }
      hint={hint}
      disabled={!ready}
      onAction={convert}
    />
  )
}
