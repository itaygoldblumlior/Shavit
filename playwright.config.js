// Playwright end-to-end tests: a real browser clicks through Shavit
// the way a user would. Each test starts with an empty browser profile,
// so its IndexedDB starts empty, just like a first-time visitor.
import { defineConfig, devices } from '@playwright/test';

const port = 4173;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI, // a stray test.only must never pass CI
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    serviceWorkers: 'block', // test the app itself, not a cached copy
    trace: 'retain-on-failure', // a step-by-step replay when a test fails
  },
  // Test the real production build, served the way the website serves it.
  webServer: {
    command: `npm run build && npx vite preview --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    // Chromium = Chrome and Android. WebKit = Safari, which is what iPhones use.
    { name: 'chromium', use: { ...devices['Pixel 7'] } },
    { name: 'webkit', use: { ...devices['iPhone 13'] } },
  ],
});
