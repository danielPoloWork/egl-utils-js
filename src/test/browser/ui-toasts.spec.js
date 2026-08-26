import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

// Three-engine assertions for the toast manager (roadmap 20.2, spec 07 F104–F105,
// ADR-0072).
//
// Deliberately two tests, not ten. The Node suite proves every admission rule,
// every option and the cap invariant against a Bootstrap double, which is the
// right instrument for policy. Exactly two claims need a real engine, and both
// are load-bearing rather than decorative:
//
//  - **`hidden.bs.toast` really bubbles to the container, and a real auto-hide
//    timer really fires it.** The whole queue turns on that one event reaching one
//    listener; the double dispatches it because we told it to, and an engine
//    dispatches the one Bootstrap decided on. If this were wrong, every queued
//    toast past the cap would wait forever — the exact failure the property test
//    cannot see, because it drives the double.
//  - **The promise transition survives real transitions.** Hiding and re-showing
//    across an animation is where a swap either lands in the vacated slot or
//    races.
//
// Assets are read once here and injected as content rather than fetched per test,
// and the timeout is doubled — both for the reasons `ui-dialogs.spec.js` records
// and ROADMAP 20.7 exists to fix properly.

const FIXTURE = '/src/test/browser/fixture.html';
const BOOTSTRAP_BUNDLE = readFileSync(
  'node_modules/bootstrap/dist/js/bootstrap.bundle.min.js',
  'utf8',
);
const BOOTSTRAP_CSS = readFileSync('node_modules/bootstrap/dist/css/bootstrap.min.css', 'utf8');

test.beforeEach(async ({ page }) => {
  test.setTimeout(60_000);

  /** @type {string[]} */
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  await page.goto(FIXTURE);
  const ready = await page.evaluate(() => window.__eglReady);
  expect(ready.ok, `fixture failed to load the built bundles: ${ready.message ?? ''}`).toBe(true);
  await page.addStyleTag({ content: BOOTSTRAP_CSS });
  await page.addScriptTag({ content: BOOTSTRAP_BUNDLE });
  await page.waitForFunction(() => typeof window.bootstrap === 'object');
  expect(pageErrors, 'the fixture must load without page errors').toEqual([]);
});

test('a real auto-hide frees a slot, and the queued toast is promoted', async ({ page }) => {
  await page.evaluate(() => {
    window.eglToasts = window.egl.ui.createToasts({ maxVisible: 1, autoHideMs: 400 });
    window.eglToasts.add('first');
    window.eglToasts.add('second');
  });

  // One up, one waiting — the cap, applied by a real Bootstrap.
  await expect(page.locator('.toast-container .toast')).toHaveCount(1);
  await expect(page.locator('.toast-body')).toHaveText('first');
  expect(await page.evaluate(() => window.eglToasts.state().queued.length)).toBe(1);

  // Nothing is clicked and no event is synthesised: Bootstrap's own 400 ms timer
  // hides the first toast, its `hidden` bubbles to the container, and the manager
  // promotes. If any link in that chain were assumed rather than real, this would
  // hang here.
  await expect(page.locator('.toast-body')).toHaveText('second', { timeout: 10_000 });
  expect(await page.evaluate(() => window.eglToasts.state())).toEqual({
    visible: expect.any(Array),
    queued: [],
  });

  // And the second one leaves on its own too, taking its markup with it (F69's
  // dispose-and-remove contract, which the manager never has to repeat).
  await expect(page.locator('.toast-container .toast')).toHaveCount(0, { timeout: 10_000 });
  await page.evaluate(() => window.eglToasts.destroy());
  await expect(page.locator('.toast-container')).toHaveCount(0);
});

test('the promise helper transitions one toast, across real animations', async ({ page }) => {
  await page.evaluate(() => {
    window.eglToasts = window.egl.ui.createToasts({ maxVisible: 2 });
    let settle;
    const work = new Promise((resolve) => {
      settle = resolve;
    });
    window.eglSettle = () => settle(['a', 'b', 'c']);
    window.eglReturned = window.eglToasts.promise(work, {
      pending: 'Saving…',
      success: (rows) => `Saved ${rows.length} rows.`,
      error: 'Failed.',
    });
  });

  await expect(page.locator('.toast-body')).toHaveText('Saving…');
  // A toast with no auto-hide stays up: the pending state has no honest timer.
  await expect(page.locator('.toast-container .toast')).toHaveCount(1);

  await page.evaluate(() => window.eglSettle());

  // ONE toast throughout — the old node hides, the replacement takes its slot,
  // and at no point are there two telling the story out of order.
  await expect(page.locator('.toast-body')).toHaveText('Saved 3 rows.', { timeout: 10_000 });
  await expect(page.locator('.toast-container .toast')).toHaveCount(1);
  expect(await page.evaluate(() => window.eglReturned)).toEqual(['a', 'b', 'c']);
  await expect(page.locator('.toast.text-bg-success')).toHaveCount(1);

  await page.evaluate(() => window.eglToasts.destroy());
});
