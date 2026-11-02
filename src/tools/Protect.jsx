import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import FileCard from '../components/FileCard.jsx'
import ToolLayout from '../components/ToolLayout.jsx'
import { Checkbox, Field } from '../components/controls.jsx'
import { PDF_TYPE, baseName } from '../lib/files.js'
import { useSession } from '../lib/hooks.js'
import { usePdfInfo } from '../lib/pdfjs.js'
import { protectPdf } from '../lib/qpdf.js'

export function PasswordInput({ value, onChange, placeholder, autoFocus }) {
  const [show, setShow] = useState(false)
  return (
    <div className="num-input password-input">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="new-password"
        onChange={(e) => onChange(e.target.value)}
      />
      <button type="button" className="icon-btn" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow((s) => !s)}>
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  )
}

export default function Protect() {
  const { files, setFiles, run } = useSession()
  const info = usePdfInfo(files)
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [allowPrint, setAllowPrint] = useState(true)
  const [allowCopy, setAllowCopy] = useState(true)
  const [allowEdit, setAllowEdit] = useState(true)
  const locked = files.filter((f) => info[f.id]?.error === 'Password protected')

  const protect = () =>
    run(async ({ progress }) => {
      const out = []
      for (let i = 0; i < files.length; i++) {
        const { file } = files[i]
        out.push({
          name: `${baseName(file.name)}-protected.pdf`,
          type: PDF_TYPE,
          data: await protectPdf(file, { password, allowPrint, allowCopy, allowEdit }),
        })
        progress(i + 1, files.length)
      }
      return { files: out, zipName: 'protected-pdfs.zip' }
    })

  let hint = null
  if (locked.length) hint = `“${locked[0].file.name}” already has a password. Remove it first.`
  else if (!password) hint = 'Choose a password to protect your PDF.'
  else if (repeat !== password) hint = 'The two passwords don’t match yet.'

  return (
    <ToolLayout
      main={
        <div className="file-grid">
          {files.map((item) => (
            <FileCard
              key={item.id}
              item={item}
              info={info[item.id]}
              onRemove={() => setFiles((list) => list.filter((f) => f.id !== item.id))}
            />
          ))}
        </div>
      }
      sidebar={
        <>
          <Field label="Password">
            <PasswordInput value={password} onChange={setPassword} placeholder="Type a password" autoFocus />
          </Field>
          <Field label="Repeat password" error={repeat && repeat !== password ? 'Passwords don’t match.' : null}>
            <PasswordInput value={repeat} onChange={setRepeat} placeholder="Type it again" />
          </Field>
          {password && password.length < 6 && <p className="side-text small">Short passwords are easy to guess. Use at least 8 characters.</p>}
          <Field label="Permissions">
            <div className="check-list">
              <Checkbox checked={allowPrint} onChange={setAllowPrint}>
                Allow printing
              </Checkbox>
              <Checkbox checked={allowCopy} onChange={setAllowCopy}>
                Allow copying text and images
              </Checkbox>
              <Checkbox checked={allowEdit} onChange={setAllowEdit}>
                Allow editing and comments
              </Checkbox>
            </div>
          </Field>
          <p className="side-text small">
            Files are encrypted with AES-256. Keep the password somewhere safe — it can’t be recovered if you lose it.
          </p>
        </>
      }
      hint={hint}
      disabled={!!hint}
      onAction={protect}
    />
  )
}
