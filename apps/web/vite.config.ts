import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import { serviceWorker } from './scripts/serviceWorkerPlugin.ts'

// vercel.json is the single source of the security headers; `vite preview` serves the same ones, so
// the end-to-end tests run under the policy that production uses.
const vercel = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf-8')) as {
  headers: { source: string; headers: { key: string; value: string }[] }[]
}
const securityHeaders = Object.fromEntries(
  vercel.headers.find((h) => h.source === '/(.*)')!.headers.map((h) => [h.key, h.value]),
)

export default defineConfig({
  plugins: [react(), serviceWorker()],
  build: { sourcemap: false },
  preview: { headers: securityHeaders },
})
