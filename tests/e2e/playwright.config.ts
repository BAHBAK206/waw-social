import { defineConfig, devices } from '@playwright/test';

// Runs against a live stack. Start it with `pnpm dev` (or `docker compose up`), then `pnpm test:e2e`.
// E2E_BASE_URL defaults to the Vite dev server; set E2E_START=1 to let Playwright start the stack itself.
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';

export default defineConfig({
  testDir: './specs',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: { baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure', locale: 'en-US' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: process.env.E2E_START
    ? { command: 'node scripts/dev.mjs --no-ai', cwd: '../..', url: baseURL, reuseExistingServer: true, timeout: 180_000 }
    : undefined,
});
