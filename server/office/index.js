// Built-in Office → HTML conversion, used when LibreOffice isn't available. Each converter
// returns { html, prepare? }; the browser engine prints it to PDF (prepare runs in the page first).

import { HttpError } from '../util.js'
import { odpDocument, odtDocument } from './odf.js'
import { pptxDocument } from './pptx.js'
import { rtfDocument } from './rtf.js'
import { spreadsheetDocument } from './sheet.js'
import { docDocument, docxDocument, textDocument } from './word.js'

export const BUILTIN_FORMATS = ['docx', 'doc', 'odt', 'rtf', 'txt', 'xlsx', 'xls', 'ods', 'csv', 'pptx', 'odp']

/** Formats the built-in converter only partly supports, shown to users. */
export const BUILTIN_NOTES = { doc: 'text only' }

export async function officeDocument(buffer, ext) {
  switch (ext) {
    case 'docx':
      return docxDocument(buffer)
    case 'doc':
      return docDocument(buffer)
    case 'odt':
      return odtDocument(buffer)
    case 'rtf':
      return rtfDocument(buffer)
    case 'txt':
      return textDocument(buffer)
    case 'xlsx':
    case 'xls':
    case 'ods':
    case 'csv':
      return spreadsheetDocument(buffer, ext)
    case 'pptx':
      return pptxDocument(buffer)
    case 'odp':
      return odpDocument(buffer)
    default:
      throw new HttpError(415, `.${ext} files need LibreOffice on the server.`)
  }
}
