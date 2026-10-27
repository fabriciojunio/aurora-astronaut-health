import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/domain/**', 'src/security/**', 'src/storage/**', 'src/sync/**', 'src/sim/**', 'src/ai/**', 'src/data/**', 'src/ui/**', 'src/*.ts', 'src/*.tsx'],
      // main.tsx and zodConfig.ts only wire the app together; the end-to-end tests run them.
      exclude: ['**/*.test.*', '**/index.ts', 'src/main.tsx', 'src/zodConfig.ts'],
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
})
