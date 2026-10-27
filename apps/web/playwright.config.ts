import { defineConfig, devices } from '@playwright/test'

// Runs against the production build served with the same security headers as vercel.json, or
// against a deployed site when E2E_BASE_URL is set (for example the live Vercel deployment).
const deployed = process.env.E2E_BASE_URL

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  // Each test derives a key with 600,000 PBKDF2 iterations and runs axe; in parallel they fight for
  // the CPU and time out on smaller machines. The whole suite takes under a minute in sequence.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: deployed ?? 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: deployed
    ? undefined
    : {
        command: 'npm run build && npx vite preview --port 4173 --strictPort',
        url: 'http://localhost:4173',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
})
