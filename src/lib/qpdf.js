import createModule from '@neslinesli93/qpdf-wasm'
import wasmUrl from '@neslinesli93/qpdf-wasm/dist/qpdf.wasm?url'
import { PDFDocument } from 'pdf-lib'
import { UserError } from './files.js'

let compiled = null

function compile() {
  compiled ??= WebAssembly.compileStreaming(fetch(wasmUrl)).catch(async () =>
    WebAssembly.compile(await (await fetch(wasmUrl)).arrayBuffer()),
  )
  return compiled
}

/**
 * Runs the qpdf CLI once, in a fresh WebAssembly instance, against `input`
 * written to /in.pdf. `args` must reference /in.pdf and /out.pdf.
 *
 * This build never flushes qpdf's stdout/stderr (the runtime doesn't exit), so
 * results are judged by exit code — 0 ok, 3 ok with warnings, 2 failed — and by
 * whether /out.pdf was written.
 */
async function runQpdf(input, args) {
  const wasm = await compile()
  const qpdf = await createModule({
    noInitialRun: true,
    locateFile: () => wasmUrl,
    instantiateWasm: (imports, done) => {
      WebAssembly.instantiate(wasm, imports).then((instance) => done(instance, wasm))
      return {}
    },
    print: () => {},
    printErr: () => {},
  })
  qpdf.FS.writeFile('/in.pdf', input)
  let code
  try {
    code = qpdf.callMain(args)
  } catch (e) {
    code = typeof e?.status === 'number' ? e.status : 2
  }
  let output = null
  try {
    output = qpdf.FS.readFile('/out.pdf')
  } catch {
    // No output written.
  }
  const ok = (code === 0 || code === 3) && output?.length > 0
  return { ok, code, output }
}

async function readBytes(file) {
  return new Uint8Array(await file.arrayBuffer())
}

function randomPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(18))
  return btoa(String.fromCharCode(...bytes))
}

/** Encryption status: 'none', 'restricted' (opens without a password), 'locked', or 'unknown'. */
export async function encryptionStatus(file) {
  const bytes = await readBytes(file)
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false }).catch(() => null)
  if (!pdf) return 'unknown'
  if (!pdf.isEncrypted) return 'none'
  // If qpdf can decrypt it with no password, only permissions are restricted.
  const r = await runQpdf(bytes, ['--decrypt', '/in.pdf', '/out.pdf'])
  return r.ok ? 'restricted' : 'locked'
}

export async function protectPdf(file, { password, allowPrint, allowCopy, allowEdit }) {
  const restricted = !allowPrint || !allowCopy || !allowEdit
  // With restrictions, a random owner password keeps the user password from lifting them.
  const owner = restricted ? randomPassword() : password
  const flags = []
  if (!allowPrint) flags.push('--print=none')
  if (!allowCopy) flags.push('--extract=n')
  if (!allowEdit) flags.push('--modify=none')
  const r = await runQpdf(await readBytes(file), [
    '/in.pdf',
    '--encrypt',
    password,
    owner,
    '256',
    ...flags,
    '--',
    '/out.pdf',
  ])
  if (!r.ok) {
    throw new UserError(`Couldn’t protect “${file.name}”. If it already has a password, unlock it first.`)
  }
  return r.output
}

export async function unlockPdf(file, password) {
  const args = password
    ? [`--password=${password}`, '--decrypt', '/in.pdf', '/out.pdf']
    : ['--decrypt', '/in.pdf', '/out.pdf']
  const r = await runQpdf(await readBytes(file), args)
  if (!r.ok) {
    throw new UserError(
      password
        ? 'That password isn’t correct. Check it and try again.'
        : 'This PDF needs a password to open. Enter it and try again.',
    )
  }
  return r.output
}

/**
 * Rebuilds a damaged PDF. qpdf rewrites files it can read; its WebAssembly build
 * can't reconstruct a broken cross-reference table, so for those we fall back to
 * pdf-lib, which finds objects by scanning the file and writes a fresh xref.
 */
export async function repairPdf(file) {
  const bytes = await readBytes(file)
  // --check exits 0 only when qpdf finds nothing wrong.
  const healthy = (await runQpdf(bytes, ['--check', '/in.pdf'])).code === 0
  const q = await runQpdf(bytes, ['/in.pdf', '/out.pdf'])
  if (q.ok) return { bytes: q.output, repaired: !healthy || q.code === 3 }
  let pdf
  try {
    pdf = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: false })
  } catch (e) {
    if (/encrypt/i.test(String(e?.message))) {
      throw new UserError(`“${file.name}” is password-protected. Unlock it first, then repair it.`)
    }
    throw new UserError(`“${file.name}” is too badly damaged to repair.`)
  }
  if (pdf.getPageCount() === 0) throw new UserError(`No readable pages were found in “${file.name}”.`)
  return { bytes: await pdf.save(), repaired: true }
}
