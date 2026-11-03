import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The Office → PDF conversion server (npm run server).
const api = { '/api': 'http://127.0.0.1:3001' }

// pdfjs-dist ships modern syntax (top-level await), so target esnext everywhere.
// BASE_PATH lets the GitHub Pages build live under /<repo>/.
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
  server: { port: 5173, proxy: api },
  preview: { proxy: api },
  build: { target: 'esnext', chunkSizeWarningLimit: 1500 },
  optimizeDeps: { esbuildOptions: { target: 'esnext' } },
})
