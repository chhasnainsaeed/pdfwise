import { useEffect, useState } from 'react'
import { uid } from '../../lib/files.js'
import { encodeWorkflow, savedWorkflows, saveWorkflows } from '../../lib/workflow.js'

/** Workflows saved in this browser, plus share links. `flash` is a short confirmation message. */
export function useLibrary() {
  const [saved, setSaved] = useState(savedWorkflows)
  const [flash, setFlash] = useState('')

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(''), 2600)
    return () => clearTimeout(t)
  }, [flash])

  const save = (name, steps) => {
    const label = name.trim() || 'My workflow'
    const next = [{ id: uid(), name: label, steps }, ...saved.filter((w) => w.name !== label)].slice(0, 12)
    if (!saveWorkflows(next)) return setFlash('Your browser blocked saving.')
    setSaved(savedWorkflows())
    setFlash('Saved in this browser — passwords are never stored.')
  }

  const remove = (id) => {
    saveWorkflows(saved.filter((w) => w.id !== id))
    setSaved(savedWorkflows())
  }

  const share = async (name, steps) => {
    const url = `${location.origin}/pdf-workflows?w=${encodeWorkflow(name.trim() || 'Shared workflow', steps)}`
    try {
      await navigator.clipboard.writeText(url)
      setFlash('Link copied — anyone can open it and run the same steps. Passwords are never included.')
    } catch {
      window.prompt('Copy this link:', url)
    }
  }

  return { saved, save, remove, share, flash }
}
