// Office → PDF with LibreOffice running headless: the best fidelity, used when installed.

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { HttpError } from '../util.js'

const TIMEOUT_MS = (Number(process.env.CONVERT_TIMEOUT_S) || 120) * 1000
const CONCURRENCY = Math.max(1, Number(process.env.CONVERT_CONCURRENCY) || 2)

export const LIBREOFFICE_FORMATS = ['doc', 'docx', 'odt', 'rtf', 'txt', 'xls', 'xlsx', 'ods', 'csv', 'ppt', 'pptx', 'odp']

/** Locates LibreOffice. Checked per request, so installing it doesn't need a server restart. */
export function findSoffice() {
  if (process.env.SOFFICE_PATH) return existsSync(process.env.SOFFICE_PATH) ? process.env.SOFFICE_PATH : null
  const candidates =
    process.platform === 'win32'
      ? [
          // soffice.com waits for the conversion to finish; soffice.exe may return early.
          'C:\\Program Files\\LibreOffice\\program\\soffice.com',
          'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
          'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.com',
          'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
        ]
      : process.platform === 'darwin'
        ? ['/Applications/LibreOffice.app/Contents/MacOS/soffice']
        : ['/usr/bin/soffice', '/usr/local/bin/soffice', '/usr/bin/libreoffice', '/snap/bin/libreoffice', '/opt/libreoffice/program/soffice']
  return candidates.find((p) => existsSync(p)) ?? null
}

// Each slot has its own LibreOffice profile, so conversions can run side by side and
// only the first conversion per slot pays the profile-creation cost.
const freeSlots = Array.from({ length: CONCURRENCY }, (_, i) => i)
const waiting = []

async function withSlot(fn) {
  if (!freeSlots.length) await new Promise((resolve) => waiting.push(resolve))
  const slot = freeSlots.shift()
  try {
    return await fn(slot)
  } finally {
    freeSlots.push(slot)
    waiting.shift()?.()
  }
}

function killTree(child) {
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
  else child.kill('SIGKILL')
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (d) => {
      stderr += d
    })
    const timer = setTimeout(() => {
      killTree(child)
      reject(new HttpError(504, 'The conversion took too long and was stopped.'))
    }, TIMEOUT_MS)
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(new HttpError(500, `Couldn’t start LibreOffice: ${e.message}`))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stderr })
    })
  })
}

export function libreofficeToPdf(bytes, ext) {
  return withSlot(async (slot) => {
    const soffice = findSoffice()
    if (!soffice) throw new HttpError(503, 'LibreOffice isn’t installed on the server.')
    const dir = await mkdtemp(path.join(os.tmpdir(), 'pdfwise-'))
    try {
      // A fixed input name keeps user-supplied file names out of the command line.
      const input = path.join(dir, `input.${ext}`)
      await writeFile(input, bytes)
      const profile = pathToFileURL(path.join(os.tmpdir(), `pdfwise-lo-profile-${slot}`)).href
      const { code, stderr } = await run(soffice, [
        `-env:UserInstallation=${profile}`,
        '--headless',
        '--norestore',
        '--nolockcheck',
        '--nodefault',
        '--nofirststartwizard',
        '--convert-to',
        'pdf',
        '--outdir',
        dir,
        input,
      ])
      const output = path.join(dir, 'input.pdf')
      if (!existsSync(output)) {
        console.warn(`[libreoffice] .${ext} failed (exit ${code}): ${stderr.trim().slice(0, 300)}`)
        throw new HttpError(422, 'LibreOffice couldn’t convert this file. It may be damaged or password-protected.')
      }
      return await readFile(output)
    } finally {
      await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {})
    }
  })
}
