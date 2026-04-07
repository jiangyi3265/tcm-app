import { defineConfig } from '@playwright/test'

const frontendHost = process.env.PLAYWRIGHT_FRONTEND_HOST || '127.0.0.1'
const frontendPort = process.env.PLAYWRIGHT_FRONTEND_PORT || '4173'
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://${frontendHost}:${frontendPort}`

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL,
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  webServer: {
    command: `npm run dev -- --host ${frontendHost} --port ${frontendPort}`,
    url: `${baseURL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
