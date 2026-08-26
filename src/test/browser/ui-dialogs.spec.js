import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

// Three-engine assertions for the promise-based dialogs (roadmap 20.1, spec 07
// §2 F101–F103 and §6, ADR-0071).
//
// **Why these tests cannot be jsdom tests.** The Node suite proves every
// settlement path, every race and every option, against a Bootstrap double —
// which is the right instrument for logic and the wrong one for two questions:
//
//  - **where focus went.** "The element focused when the dialog opened is focused
//    again when it settles" (F103) is a claim about an engine's focus model, and
//    jsdom's is a simulation. The smoke suite says so explicitly at the F70
//    modal test — *"focus restoration is deliberately not asserted here: bsModal
//    makes no such promise"* — and 20.1 is where the promise starts existing, so
//    this is where it gets proven.
//  - **what Bootstrap actually does.** Real transitions, the real backdrop, the
//    real `<body>` scroll lock, and real Escape handling. A double fires the
//    events we told it to; an engine fires the ones Bootstrap decided on.
//
// The peer is injected per test rather than added to the fixture, for the same
// reason the 16.1 suite does it: the fixture's own assertion is that the entries
// load with no `bootstrap` global at all, and loading the bundle for everybody
// would delete that proof instead of extending it.

const FIXTURE = '/src/test/browser/fixture.html';
// Both read once, here, and injected as CONTENT rather than fetched per test by
// URL. The bytes are Bootstrap's own either way; what changes is that the
// parallel workers no longer ask this repo's minimal static server for a 227 kB
// stylesheet and a 79 kB bundle once per test.
//
// Worth recording, since this file is where the suspicion started: 20.7 measured
// the server and it was never the bottleneck — it serves 140 concurrent fixture
// loads in 1.1 s. What timed this file out was the worker count, now bounded in
// `playwright.config.js` (ADR-0076). Injecting the bytes is still the right shape
// — it is less work for everyone — it just was not the cure it looked like.
const BOOTSTRAP_BUNDLE = readFileSync(
  'node_modules/bootstrap/dist/js/bootstrap.bundle.min.js',
  'utf8',
);
const BOOTSTRAP_CSS = readFileSync('node_modules/bootstrap/dist/css/bootstrap.min.css', 'utf8');

test.beforeEach(async ({ page }) => {
  // The 60 s budget this file used to set for itself now belongs to the whole
  // suite (`playwright.config.js`, ADR-0076): five specs had grown the same line
  // for the same reason, and the sixth had not, which is how 20.7 was found.
  /** @type {string[]} */
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  await page.goto(FIXTURE);
  const ready = await page.evaluate(() => window.__eglReady);
  expect(ready.ok, `fixture failed to load the built bundles: ${ready.message ?? ''}`).toBe(true);

  // The stylesheet matters here in a way it does not elsewhere: without it a
  // `.modal` has no transition, and the show/hide events Bootstrap emits are the
  // synchronous ones rather than the transitioned ones. The whole point of these
  // tests is the transitioned path.
  await page.addStyleTag({ content: BOOTSTRAP_CSS });
  await page.addScriptTag({ content: BOOTSTRAP_BUNDLE });
  await page.waitForFunction(() => typeof window.bootstrap === 'object');
  expect(pageErrors, 'the fixture must load without page errors').toEqual([]);
});

/**
 * Put a real, focusable trigger on the page and focus it — the element F103 is
 * about giving focus back to.
 *
 * @param {import('@playwright/test').Page} page
 */
async function focusedTrigger(page) {
  await page.evaluate(() => {
    const trigger = document.createElement('button');
    trigger.id = 'trigger';
    trigger.textContent = 'Ask';
    document.getElementById('host').append(trigger);
    trigger.focus();
  });
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('trigger');
}

/**
 * Wait until focus is actually inside the dialog.
 *
 * `.modal.show` is **not** the same instant: Bootstrap adds the class at the start
 * of the entrance transition and focus lands at the end of it. A key press sent in
 * between goes to whatever the caller was focused on — outside the dialog, where
 * Bootstrap's own Escape handler cannot see it — and the dialog then never closes.
 * That is a race in a *test* rather than in the library, and it cost one flaky run
 * to find; every test here that sends keys waits on this instead.
 *
 * @param {import('@playwright/test').Page} page
 */
async function focusInsideDialog(page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.querySelector('.modal')?.contains(document.activeElement) === true,
      ),
    )
    .toBe(true);
}

test.describe('F103 — focus, in a real engine', () => {
  test('restores focus to the element that opened the dialog', async ({ page }) => {
    await focusedTrigger(page);

    await page.evaluate(() => {
      const { createDialogs } = window.egl.ui;
      window.eglDialogs = createDialogs();
      window.eglAnswer = window.eglDialogs.confirm('Delete this row?');
    });

    // Bootstrap has finished showing, and focus is inside the dialog — which is
    // the state F103's second half is about.
    await expect(page.locator('.modal.show')).toHaveCount(1);
    await focusInsideDialog(page);

    await page.locator('.modal-footer .btn-primary').click();
    expect(await page.evaluate(() => window.eglAnswer)).toBe(true);

    // Not `<body>`, and not nothing: the element the user was on. A dialog that
    // leaves focus on the body has stranded every keyboard user at the top of
    // the page.
    await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('trigger');
    await page.evaluate(() => window.eglDialogs.destroy());
  });

  test('restores focus after a dismissal too, not only an answer', async ({ page }) => {
    await focusedTrigger(page);
    await page.evaluate(() => {
      window.eglDialogs = window.egl.ui.createDialogs();
      window.eglAnswer = window.eglDialogs.prompt('New name');
    });
    await expect(page.locator('.modal.show')).toHaveCount(1);
    await focusInsideDialog(page);

    // Escape, handled by Bootstrap itself — nothing in this library listens for
    // the key, which is why this is the interesting engine-level path.
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => window.eglAnswer)).toBeNull();
    await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('trigger');
    await page.evaluate(() => window.eglDialogs.destroy());
  });

  test('focuses the prompt field, so the question can be answered by typing', async ({ page }) => {
    await page.evaluate(() => {
      window.eglDialogs = window.egl.ui.createDialogs();
      window.eglAnswer = window.eglDialogs.prompt('New folder name', { value: 'Untitled' });
    });
    await expect(page.locator('.modal.show')).toHaveCount(1);
    // Not the dialog, not the first button: the field. Bootstrap focuses the
    // `.modal` itself, so this is the one focus decision 20.1 makes rather than
    // inherits.
    await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).toBe('INPUT');

    await page.keyboard.press('Control+A');
    await page.keyboard.type('Reports');
    await page.locator('.modal-footer .btn-primary').click();
    expect(await page.evaluate(() => window.eglAnswer)).toBe('Reports');
    await page.evaluate(() => window.eglDialogs.destroy());
  });

  test('keeps Tab inside the dialog, in the engine’s own tab order', async ({ page }) => {
    await page.evaluate(() => {
      const outside = document.createElement('button');
      outside.id = 'outside';
      outside.textContent = 'Outside';
      document.getElementById('host').append(outside);
      window.eglDialogs = window.egl.ui.createDialogs();
      window.eglAnswer = window.eglDialogs.confirm('Sure?');
    });
    await expect(page.locator('.modal.show')).toHaveCount(1);
    await focusInsideDialog(page);

    // Round the trap several times. Whatever the engine's own order is, focus
    // must never leave the dialog — which is the property, rather than any
    // particular landing spot.
    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press('Tab');
      const inside = await page.evaluate(
        () => document.querySelector('.modal')?.contains(document.activeElement) === true,
      );
      expect(inside, `Tab ${i + 1} left the dialog`).toBe(true);
    }
    // And backwards, which is the other edge.
    for (let i = 0; i < 4; i += 1) {
      await page.keyboard.press('Shift+Tab');
      const inside = await page.evaluate(
        () => document.querySelector('.modal')?.contains(document.activeElement) === true,
      );
      expect(inside, `Shift+Tab ${i + 1} left the dialog`).toBe(true);
    }

    await page.evaluate(() => window.eglDialogs.destroy());
  });
});

test.describe('F101/F102 — what Bootstrap actually does', () => {
  test('leaves no backdrop, no scroll lock and no markup behind', async ({ page }) => {
    await page.evaluate(() => {
      window.eglDialogs = window.egl.ui.createDialogs();
      window.eglAnswer = window.eglDialogs.confirm('Sure?');
    });
    await expect(page.locator('.modal.show')).toHaveCount(1);
    await expect(page.locator('.modal-backdrop')).toHaveCount(1);

    await page.locator('.modal-header .btn-close').click();
    expect(await page.evaluate(() => window.eglAnswer)).toBe(false);

    // All three, because each is a different way for the page to stay broken
    // after a dialog closes: a stranded backdrop swallows every click, a leftover
    // `modal-open` freezes scrolling, and orphaned markup accumulates per ask.
    await expect(page.locator('.modal-backdrop')).toHaveCount(0);
    await expect(page.locator('.modal')).toHaveCount(0);
    expect(await page.evaluate(() => document.body.classList.contains('modal-open'))).toBe(false);
    await page.evaluate(() => window.eglDialogs.destroy());
  });

  test('a static backdrop does not dismiss, and the answer still arrives', async ({ page }) => {
    await page.evaluate(() => {
      window.eglDialogs = window.egl.ui.createDialogs({ backdrop: 'static', keyboard: false });
      window.eglSettled = false;
      window.eglAnswer = window.eglDialogs
        .confirm('Sure?')
        .then((value) => ((window.eglSettled = true), value));
    });
    await expect(page.locator('.modal.show')).toHaveCount(1);
    await focusInsideDialog(page);

    // Bootstrap's own passthrough options, doing their own job: neither of these
    // is a dismissal any more.
    await page.mouse.click(5, 5);
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => window.eglSettled)).toBe(false);

    await page.locator('.modal-footer .btn-secondary').click();
    expect(await page.evaluate(() => window.eglAnswer)).toBe(false);
    await page.evaluate(() => window.eglDialogs.destroy());
  });

  test('two dialogs from one manager are two dialogs', async ({ page }) => {
    await page.evaluate(() => {
      window.eglDialogs = window.egl.ui.createDialogs();
      window.eglFirst = window.eglDialogs.confirm('First?');
      window.eglSecond = window.eglDialogs.confirm('Second?');
    });
    await expect(page.locator('.modal')).toHaveCount(2);

    // destroy() answers both rather than abandoning either — a pending promise
    // nobody will settle is a leak with an `await` on the other end of it.
    await page.evaluate(() => window.eglDialogs.destroy());
    expect(await page.evaluate(() => Promise.all([window.eglFirst, window.eglSecond]))).toEqual([
      false,
      false,
    ]);
    await expect(page.locator('.modal')).toHaveCount(0);
    await expect(page.locator('.modal-backdrop')).toHaveCount(0);
  });

  test('rejects with EGL_PEER_MISSING on a page that never loaded Bootstrap', async ({ page }) => {
    // A separate page load, because the peer cannot be un-injected: this is the
    // ambient-absence half of the F68 contract, in an engine.
    await page.goto(FIXTURE);
    const ready = await page.evaluate(() => window.__eglReady);
    expect(ready.ok).toBe(true);

    const failure = await page.evaluate(async () => {
      try {
        await window.egl.ui.createDialogs().confirm('Sure?');
        return { threw: false };
      } catch (error) {
        return { threw: true, code: error.code, peer: error.peer };
      }
    });
    expect(failure).toEqual({ threw: true, code: 'EGL_PEER_MISSING', peer: 'bootstrap' });
    // Nothing drawn, so the page is not left with an inert dialog on it.
    await expect(page.locator('.modal')).toHaveCount(0);
  });
});
