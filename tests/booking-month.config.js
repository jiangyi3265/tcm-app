import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: ['public-booking-*.spec.js', 'mubu-october-update.spec.js'],
  timeout: 30000,
  expect: { timeout: 8000 },
  workers: 1,
  reporter: [['list'], ['json', { outputFile: fileURLToPath(new URL('../../.deployment/booking-month-e2e.json', import.meta.url)) }]],
  use: { baseURL: 'http://127.0.0.1:4192', headless: true, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    command: 'node node_modules/vite/bin/vite.js --config tests/booking-month.vite.config.js --host 127.0.0.1 --port 4192 --strictPort',
    url: 'http://127.0.0.1:4192/booking',
    reuseExistingServer: false,
    timeout: 30000,
  },
})
