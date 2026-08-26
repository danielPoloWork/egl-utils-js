import { test, expect } from '@playwright/test';

// Three-engine assertion for the reduced-motion helper (roadmap 20.6, spec 07
// F111, ADR-0075).
//
// One test, matching the F108 precedent: the unit suite over a `matchMedia` fake
// owns the current-value read, the subscribe API and teardown. The one claim
// only an engine can make is that `reducedMotion()` reaches a real
// `prefers-reduced-motion` media feature and reacts to a real emulated change —
// Playwright's `emulateMedia({ reducedMotion })`, not a stub.

const FIXTURE = '/src/test/browser/fixture.html';
const DOM_ENTRY = '/dist/esm/dom.js';

test.beforeEach(async ({ page }) => {
  await page.goto(FIXTURE);
  const ready = await page.evaluate(() => window.__eglReady);
  expect(ready.ok, `fixture failed to load the built bundles: ${ready.message ?? ''}`).toBe(true);
});

test('reads and reacts to a real prefers-reduced-motion, with no peer needed', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(async (entry) => {
    const { reducedMotion } = await import(entry);
    window.eglMotion = reducedMotion();
    window.eglSeen = [];
    window.eglMotion.on((value) => window.eglSeen.push(value));
  }, DOM_ENTRY);

  expect(await page.evaluate(() => window.eglMotion.prefersReduced())).toBe(false);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => page.evaluate(() => window.eglMotion.prefersReduced())).toBe(true);
  await expect.poll(() => page.evaluate(() => window.eglSeen)).toEqual([true]);

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect.poll(() => page.evaluate(() => window.eglSeen)).toEqual([true, false]);

  const hadPeer = await page.evaluate(() => typeof window.bootstrap);
  expect(hadPeer).toBe('undefined');

  await page.evaluate(() => window.eglMotion.destroy());
});
