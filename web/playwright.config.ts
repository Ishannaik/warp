import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 3 * 60 * 1000,
  expect: {
    timeout: 10 * 1000
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    actionTimeout: 0,
    trace: 'on-first-retry',
    baseURL: 'http://localhost:4173',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @warp/server dev',
      port: 8787,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'pnpm --filter @warp/web preview',
      port: 4173,
      reuseExistingServer: !process.env.CI,
      env: {
        VITE_SIGNALING_URL: 'ws://127.0.0.1:8787'
      }
    }
  ],
});
