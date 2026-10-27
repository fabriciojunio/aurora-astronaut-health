import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { serviceWorker } from './scripts/serviceWorkerPlugin.ts'

export default defineConfig({
  plugins: [react(), serviceWorker()],
  build: { sourcemap: false },
})
