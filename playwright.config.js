import os from 'node:os';
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

// Concurrency is DECIDED here, not inherited (roadmap 20.7, ADR-0076).
//
// Playwright's default is half the machine's cores, and that rule scales the
// wrong way: the more capable the machine, the more concurrent engines it
// starts. On the 20-core developer box this was measured on it means ten
// Chromium instances, each driving real Bootstrap transitions against the real
// stylesheet, and the machine is oversubscribed badly enough that the first
// tests scheduled exhaust their whole budget inside `beforeEach` — a different
// handful every run, every one of them passing alone.
//
// Measured, same box, same suite, `--project=chromium`:
//
//   default (10 workers)             4 failed / 156 passed   2m27
//   default (10 workers)             3 failed / 157 passed   2m26
//   bounded (4 workers)                160 passed            2m12
//   bounded + cached static server     160 passed            1m44
//
// Fewer workers is not a trade of speed for stability here — it is faster. Four
// is the ceiling because past it the contention costs more than the parallelism
// buys; the half-the-cores rule is kept underneath it so a 4-core CI runner
// still resolves to 2 and a 2-core one to 1. `--workers=N` still overrides this
// for a deliberate experiment.
const WORKERS = Math.max(1, Math.min(4, Math.floor(os.cpus().length / 2)));

export default defineConfig({
  testDir: './src/test/browser',
  // Vitest owns `**/*.test.js` under src/test/javascript; Playwright owns
  // `*.spec.js` here. The two runners never see each other's files.
  testMatch: '**/*.spec.js',
  fullyParallel: true,
  workers: WORKERS,
  // Pinned once here rather than per file (roadmap 20.7, ADR-0076). Five specs
  // had grown their own `test.setTimeout(60_000)`, each written for the same
  // reason and each covering only itself; the sixth spec then failed on the 30 s
  // default. With the worker count bounded the slowest test in the suite measures
  // ~15 s, so 60 s is four times the real high-water mark: wide enough that
  // scheduling noise cannot fail a healthy test, tight enough to still catch a
  // hang rather than let CI sit for its full 30-minute job budget.
  timeout: 60_000,
  forbidOnly: !!process.env.CI,
  // Deliberately no retries. A retry would turn the contention this item removed
  // into a slower green run rather than a signal, and a suite people re-run until
  // it passes is worse than no gate at all. If this suite goes red, something is
  // red.
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
