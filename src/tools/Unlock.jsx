import { Lock, LockOpen } from 'lucide-react'
import { useEffect, useState } from 'react'
import FileCard from '../components/FileCard.jsx'
import PageThumb from '../components/PageThumb.jsx'
import ToolLayout from '../components/ToolLayout.jsx'
import { Field } from '../components/controls.jsx'
import { PDF_TYPE, baseName } from '../lib/files.js'
import { useSession } from '../lib/hooks.js'
import { encryptionStatus, unlockPdf } from '../lib/qpdf.js'
import { PasswordInput } from './Protect.jsx'

const STATUS_TEXT = {
  locked: 'This PDF needs a password to open. Enter it below to save an unlocked copy.',
  restricted:
    'This PDF opens without a password but restricts printing, copying or editing. Unlocking removes those limits.',
  none: 'This PDF isn’t protected, so there’s nothing to unlock.',
  unknown: 'This file couldn’t be read. If it’s damaged, try Repair PDF first.',
}

export default function Unlock() {
  const { files, run } = useSession()
  const item = files[0]
  const [status, setStatus] = useState(null)
  const [password, setPassword] = useState('')

  useEffect(() => {
    let alive = true
    setStatus(null)
    encryptionStatus(item.file).then(
      (s) => alive && setStatus(s),
      () => alive && setStatus('unknown'),
    )
    return () => {
      alive = false
    }
  }, [item])

  const unlock = () =>
    run(async () => ({
      files: [
        {
          name: `${baseName(item.file.name)}-unlocked.pdf`,
          type: PDF_TYPE,
          data: await unlockPdf(item.file, password),
        },
      ],
    }))

  const thumb =
    status === 'locked' ? (
      <div className="lock-thumb">
        <Lock size={34} />
      </div>
    ) : status === 'restricted' || status === 'none' ? (
      <PageThumb file={item.file} page={1} size={140} />
    ) : (
      <div className="lock-thumb is-muted">
        <span className="spinner" />
      </div>
    )

  let hint = null
  if (!status) hint = 'Checking the file…'
  else if (status === 'none' || status === 'unknown') hint = STATUS_TEXT[status]
  else if (status === 'locked' && !password) hint = 'Enter the password to continue.'

  return (
    <ToolLayout
      main={
        <div className="file-grid">
          <FileCard item={item} thumb={thumb} meta="" />
        </div>
      }
      sidebar={
        <>
          {status && (
            <div className={`status-note is-${status}`}>
              {status === 'locked' ? <Lock size={18} /> : <LockOpen size={18} />}
              <span>{STATUS_TEXT[status]}</span>
            </div>
          )}
          {status === 'locked' && (
            <Field label="Password">
              <PasswordInput value={password} onChange={setPassword} placeholder="Enter the PDF’s password" autoFocus />
            </Field>
          )}
        </>
      }
      hint={hint}
      disabled={!!hint}
      onAction={unlock}
    />
  )
}
