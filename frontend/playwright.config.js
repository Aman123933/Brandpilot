import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'e2e-report', open: 'never' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop-chrome',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
  webServer: [
    {
      command: 'node mock/server.mjs',
      url: 'http://127.0.0.1:8000/health',
      reuseExistingServer: true,
      timeout: 30000,
    },
    {
      command: 'npm run preview -- --port 4173 --host 127.0.0.1',
      url: 'http://127.0.0.1:4173/login',
      reuseExistingServer: true,
      timeout: 30000,
    },
  ],
})
