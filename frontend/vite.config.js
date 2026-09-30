import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The backend's default CORS_ORIGINS allows http://localhost:5173,
// so we pin the dev server to that port (strictPort = fail instead of silently picking 5174).
export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves the app under /StudyForge/ (set by the deploy workflow); locally it is /.
  base: process.env.VITE_BASE || '/',
  server: { port: 5173, strictPort: true },
  // The only chunks over 500 kB are mermaid's diagram engines, which are lazy-loaded
  // the first time a mind map is shown, so they don't slow down the first page load.
  build: { chunkSizeWarningLimit: 1600 },
  test: { environment: 'node' },
})
