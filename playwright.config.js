import { defineConfig, devices } from '@playwright/test';

// Browser smoke suite (roadmap 6.4, spec §6): the storage, cookie, and
// sanitize entries are browser-leaning, so their contracts are verified in
// real engines — Chromium, Firefox, WebKit — not only in jsdom.
//
// The suite runs against the BUILT bundles served over HTTP: a real origin is
// required for `localStorage` and `document.cookie` to behave as in
// production, and loading `dist/` means the artifact consumers download is
// what gets checked.
const PORT = Number(process.env.PORT ?? 4173);

export default defineConfig({
  testDir: './src/test/browser',
  // Vitest owns `**/*.test.js` under src/test/javascript; Playwright owns
  // `*.spec.js` here. The two runners never see each other's files.
  testMatch: '**/*.spec.js',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'node tools/static-server.mjs',
    url: `http://localhost:${PORT}/src/test/browser/fixture.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
