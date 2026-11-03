import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The Office → PDF conversion server (npm run server).
const api = { '/api': 'http://127.0.0.1:3001' }

// OCR engine files served from this site instead of a public CDN, so no third-party code ever runs
// on users' documents. Only the LSTM cores are used (OEM 1), with and without SIMD.
const require = createRequire(import.meta.url)
const OCR_FILES = {
  'ocr/worker.min.js': require.resolve('tesseract.js/dist/worker.min.js'),
  'ocr/tesseract-core-simd-lstm.wasm.js': require.resolve('tesseract.js-core/tesseract-core-simd-lstm.wasm.js'),
  'ocr/tesseract-core-lstm.wasm.js': require.resolve('tesseract.js-core/tesseract-core-lstm.wasm.js'),
}

function selfHostedOcr() {
  return {
    name: 'self-hosted-ocr',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const file = OCR_FILES[req.url?.split('?')[0].slice(1)]
        if (!file) return next()
        res.setHeader('Content-Type', 'text/javascript')
        res.end(readFileSync(file))
      })
    },
    generateBundle() {
      for (const [fileName, file] of Object.entries(OCR_FILES))
        this.emitFile({ type: 'asset', fileName, source: readFileSync(file) })
    },
  }
}

// pdfjs-dist ships modern syntax (top-level await), so target esnext everywhere.
// BASE_PATH lets the GitHub Pages build live under /<repo>/.
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react(), selfHostedOcr()],
  server: { port: 5173, proxy: api },
  preview: { proxy: api },
  build: { target: 'esnext', chunkSizeWarningLimit: 1500 },
  optimizeDeps: { esbuildOptions: { target: 'esnext' } },
})
