import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

// Three-engine assertions for theme management (roadmap 20.3, spec 07 F106–F107,
// ADR-0073).
//
// One claim in this item cannot be made anywhere else, and spec 07 §6 says so:
// *"the no-flash snippet is tested as documented, by loading a fixture page with
// a persisted theme and asserting the attribute is already correct at first
// paint. That is a browser assertion by construction: 'before first paint' has no
// meaning in jsdom."*
//
// So this suite loads a page that uses `themeSnippet()` exactly as the README
// documents it, and asks the engine — not a fake — whether the attribute was
// there before anything painted. The unit suite owns everything else, over an
// injected storage and an injected `matchMedia`.
//
// The page is built here rather than kept as a static fixture on purpose: the
// snippet under test is the **emitted** one, so a change to the emitter changes
// what this page runs. A checked-in copy would be the drift the emitter exists to
// prevent.

const BOOTSTRAP_CSS = readFileSync('node_modules/bootstrap/dist/css/bootstrap.min.css', 'utf8');

/** The built ESM entry, loaded the way the no-bundler routes do. */
const UI_ENTRY = '/dist/esm/ui.js';

/**
 * A page that applies its theme in `<head>`, as the README documents.
 *
 * `paintedTheme` is captured from the very first `requestAnimationFrame`
 * callback — the earliest moment script can observe after layout — and the
 * `<body>` background is read at the same instant, which is what makes this an
 * assertion about the *frame* rather than about the attribute alone.
 *
 * @param {string} snippet
 * @returns {string}
 */
const page = (snippet) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>theme snippet fixture</title>
    <script>${snippet}</script>
    <style>${BOOTSTRAP_CSS}</style>
    <script>
      window.__atFirstPaint = new Promise((resolve) => {
        requestAnimationFrame(() => {
          resolve({
            attribute: document.documentElement.getAttribute('data-bs-theme'),
            background: getComputedStyle(document.body).backgroundColor,
          });
        });
      });
    </script>
  </head>
  <body><p>themed</p></body>
</html>`;

/**
 * Serve the fixture from the repo's own origin, so `localStorage` is the same
 * store the test seeded.
 *
 * @param {import('@playwright/test').Page} target
 * @param {string} html
 */
async function serve(target, html) {
  await target.route('**/theme-fixture.html', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: html }),
  );
}

test.beforeEach(async ({ page: target }) => {
  // An origin first, so `localStorage` can be written before the fixture loads.
  await target.goto('/src/test/browser/fixture.html');
});

test('applies a persisted theme before first paint', async ({ page: target }) => {
  const snippet = await target.evaluate(
    async (entry) => (await import(entry)).themeSnippet(),
    UI_ENTRY,
  );

  // Seeded the way the manager writes it — through the F21 wrapper's JSON
  // encoding — because agreeing with the manager is the point.
  await target.evaluate(() => localStorage.setItem('egl-theme', JSON.stringify('dark')));
  await serve(target, page(snippet));
  await target.goto('/theme-fixture.html');

  const painted = await target.evaluate(() => window.__atFirstPaint);
  // The attribute was already right in the first frame: no flash of light.
  expect(painted.attribute).toBe('dark');
  // And it had already taken effect — Bootstrap's dark background, not its light
  // one, in that same frame. This is the half a jsdom test cannot reach.
  expect(painted.background).not.toBe('rgb(255, 255, 255)');

  const settled = await target.evaluate(() => ({
    attribute: document.documentElement.getAttribute('data-bs-theme'),
    background: getComputedStyle(document.body).backgroundColor,
  }));
  // Nothing changed it afterwards, which is what rules out "it flashed and then
  // corrected itself".
  expect(settled).toEqual(painted);
});

test('follows the real system preference when nothing is stored', async ({ page: target }) => {
  const snippet = await target.evaluate(
    async (entry) => (await import(entry)).themeSnippet(),
    UI_ENTRY,
  );
  await target.evaluate(() => localStorage.removeItem('egl-theme'));
  await serve(target, page(snippet));

  // The engine's own `prefers-color-scheme`, not a stub: this is the wiring only
  // a browser can prove.
  await target.emulateMedia({ colorScheme: 'dark' });
  await target.goto('/theme-fixture.html');
  expect((await target.evaluate(() => window.__atFirstPaint)).attribute).toBe('dark');

  await target.emulateMedia({ colorScheme: 'light' });
  await target.goto('/theme-fixture.html');
  expect((await target.evaluate(() => window.__atFirstPaint)).attribute).toBe('light');
});

test('a stored choice outranks the system, at first paint', async ({ page: target }) => {
  const snippet = await target.evaluate(
    async (entry) => (await import(entry)).themeSnippet(),
    UI_ENTRY,
  );
  await target.evaluate(() => localStorage.setItem('egl-theme', JSON.stringify('light')));
  await serve(target, page(snippet));

  await target.emulateMedia({ colorScheme: 'dark' });
  await target.goto('/theme-fixture.html');
  // The F106 clause, at the one moment it is hardest to get right: an expressed
  // choice wins even before the manager exists.
  expect((await target.evaluate(() => window.__atFirstPaint)).attribute).toBe('light');
  await target.evaluate(() => localStorage.removeItem('egl-theme'));
});

test('the manager tracks the real system preference, and stops when told', async ({
  page: target,
}) => {
  await target.emulateMedia({ colorScheme: 'light' });
  await target.evaluate(() => localStorage.removeItem('egl-theme'));

  await target.evaluate(async (entry) => {
    const { createTheme } = await import(entry);
    window.eglTheme = createTheme();
  }, UI_ENTRY);

  expect(await target.evaluate(() => window.eglTheme.resolved())).toBe('light');

  // A real MediaQueryList change event, from the engine.
  await target.emulateMedia({ colorScheme: 'dark' });
  await expect
    .poll(() => target.evaluate(() => document.documentElement.getAttribute('data-bs-theme')))
    .toBe('dark');

  // Expressing a choice stops the tracking — the half that gets forgotten.
  await target.evaluate(() => window.eglTheme.set('light'));
  await target.emulateMedia({ colorScheme: 'dark' });
  expect(await target.evaluate(() => document.documentElement.getAttribute('data-bs-theme'))).toBe(
    'light',
  );

  await target.evaluate(() => {
    window.eglTheme.destroy();
    localStorage.removeItem('egl-theme');
  });
});
