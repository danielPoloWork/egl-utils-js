import { test, expect } from '@playwright/test';

// Three-engine assertions for breakpoint observation (roadmap 20.4, spec 07 F108,
// ADR-0074).
//
// Spec 07 §6 is precise about the division of labour here: *"unit tests over an
// injected `matchMedia` fake covering subscribe, current value and teardown; one
// browser test per helper that the real `MediaQueryList` is wired, since the fake
// proves the logic and only an engine proves the wiring."*
//
// So this file makes exactly the claims a fake cannot: that the queries the
// observer emits are ones a real engine understands, that a real viewport resize
// fires a real `change` event, and that the boundary it fires at is the pixel
// Bootstrap's own SCSS says it is. Everything else — the four predicates, the
// derivation, teardown, the property test — is the unit suite's.
//
// No Bootstrap asset is loaded: the observer needs no stylesheet and no peer, and
// asserting that here keeps it honest.

const FIXTURE = '/src/test/browser/fixture.html';
const UI_ENTRY = '/dist/esm/ui.js';

test.beforeEach(async ({ page }) => {
  await page.goto(FIXTURE);
  const ready = await page.evaluate(() => window.__eglReady);
  expect(ready.ok, `fixture failed to load the built bundles: ${ready.message ?? ''}`).toBe(true);
});

test('the queries reach a real matchMedia, and read the real viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 700 });
  const observed = await page.evaluate(async (entry) => {
    const { createBreakpoints } = await import(entry);
    const screen = createBreakpoints();
    const answer = {
      current: screen.current(),
      upMd: screen.up('md'),
      upXl: screen.up('xl'),
      downXl: screen.down('xl'),
      onlyLg: screen.only('lg'),
      betweenMdXl: screen.between('md', 'xl'),
    };
    screen.destroy();
    return answer;
  }, UI_ENTRY);

  // 1000 px is lg by Bootstrap's map (lg starts at 992, xl at 1200).
  expect(observed).toEqual({
    current: 'lg',
    upMd: true,
    upXl: false,
    downXl: true,
    onlyLg: true,
    betweenMdXl: true,
  });
});

test('a real resize fires a real change event, at Bootstrap’s own pixel', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 700 });
  await page.evaluate(async (entry) => {
    const { createBreakpoints } = await import(entry);
    window.eglScreen = createBreakpoints();
    window.eglCrossings = [];
    window.eglScreen.on((change) => window.eglCrossings.push(change));
  }, UI_ENTRY);

  expect(await page.evaluate(() => window.eglScreen.current())).toBe('sm');

  // 767 → still sm. The boundary is 768, and it is Bootstrap's number rather than
  // ours: getting this one pixel wrong is the whole reason the map is read from
  // `scss/_variables.scss` instead of remembered.
  await page.setViewportSize({ width: 767, height: 700 });
  await expect.poll(() => page.evaluate(() => window.eglCrossings.length)).toBe(0);

  await page.setViewportSize({ width: 768, height: 700 });
  await expect
    .poll(() => page.evaluate(() => window.eglCrossings))
    .toEqual([{ current: 'md', previous: 'sm' }]);

  // Four queries flip at once going wide, and the observer still reports one
  // crossing — the claim the fake makes about logic, confirmed here about an
  // engine's event batching.
  await page.setViewportSize({ width: 1500, height: 700 });
  await expect.poll(() => page.evaluate(() => window.eglCrossings.length)).toBe(2);
  expect(await page.evaluate(() => window.eglCrossings.at(-1))).toEqual({
    current: 'xxl',
    previous: 'md',
  });

  await page.evaluate(() => window.eglScreen.destroy());
  // Detached for real: a resize after teardown reaches nobody.
  await page.setViewportSize({ width: 400, height: 700 });
  await expect.poll(() => page.evaluate(() => window.eglCrossings.length)).toBe(2);
});

test('needs no Bootstrap peer and no stylesheet', async ({ page }) => {
  // The fixture deliberately loads neither. An observer that quietly depended on
  // one would fail here and nowhere else.
  const worked = await page.evaluate(async (entry) => {
    const { createBreakpoints, BOOTSTRAP_BREAKPOINTS } = await import(entry);
    const screen = createBreakpoints();
    const answer = {
      hasPeer: typeof window.bootstrap,
      names: screen.names,
      map: BOOTSTRAP_BREAKPOINTS,
    };
    screen.destroy();
    return answer;
  }, UI_ENTRY);

  expect(worked.hasPeer).toBe('undefined');
  expect(worked.names).toEqual(['xs', 'sm', 'md', 'lg', 'xl', 'xxl']);
  expect(worked.map).toEqual({ xs: 0, sm: 576, md: 768, lg: 992, xl: 1200, xxl: 1400 });
});
