import { test, expect } from '@playwright/test';

// Three-engine assertions for dirty/touched tracking (roadmap 21.5, spec 08 §2
// F124-F125 and §6, ADR-0081).
//
// **Why these cannot be jsdom tests.** The Node suite dispatches its events by
// hand — `el.value = x; el.dispatchEvent(new Event('input'))` — which proves the
// listener wiring and nothing about whether a real interaction produces those
// events at all. That gap is the whole risk here: this instance's correctness
// rests entirely on the assumption that typing fires `input`, that tabbing away
// fires `focusout`, and that a click on a checkbox and a keyboard selection in a
// `<select>` fire `change`. Every one of those is the engine's behaviour, not
// ours, and none of them is a claim jsdom can settle.
//
// The `beforeunload` half is deliberately NOT asserted here: automation
// suppresses that dialog by design, so a browser test of it would assert the
// harness rather than the library. What is assertable — that the registration
// exists only while the form is dirty and is gone after `destroy()` — is a leak
// test, and it is counted directly on an injected window in the Node suite.
const FIXTURE = '/src/test/browser/fixture.html';

test.beforeEach(async ({ page }) => {
  /** @type {string[]} */
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  await page.goto(FIXTURE);
  const ready = await page.evaluate(() => window.__eglReady);
  expect(ready.ok, `fixture failed to load the built bundles: ${ready.message ?? ''}`).toBe(true);
  expect(pageErrors, 'the fixture must load without page errors').toEqual([]);
});

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} markup
 */
async function form(page, markup) {
  await page.evaluate((html) => {
    const host = document.getElementById('host');
    host.replaceChildren();
    host.innerHTML = `<form id="f" novalidate>${html}</form>`;
    const { createForm, trackChanges } = window.egl.forms;
    window.__changes = trackChanges(createForm(document.getElementById('f')));
  }, markup);
}

/** @param {import('@playwright/test').Page} page */
function state(page) {
  return page.evaluate(() => window.__changes.state());
}

test.describe('F124 — what a real interaction actually produces', () => {
  test('typing marks a field dirty and touched, and an undo clears only the dirty half', async ({
    page,
  }) => {
    await form(page, '<input name="name" value="Ada" /><input name="email" value="a@b.c" />');

    await expect.poll(() => state(page)).toMatchObject({ dirty: false, touched: false });

    // A real keystroke, not a synthesised event.
    await page.fill('#f [name=name]', 'Grace');
    await expect
      .poll(() => state(page))
      .toMatchObject({ dirty: true, touched: true, dirtyFields: ['name'] });

    await page.fill('#f [name=name]', 'Ada');
    const undone = await state(page);
    expect(undone.dirty).toBe(false);
    // Still touched: the user was in there, and that is a different fact from
    // whether anything survived it.
    expect(undone.touchedFields).toEqual(['name']);
  });

  test('tabbing through a field touches it without making it dirty', async ({ page }) => {
    await form(page, '<input name="name" value="Ada" /><input name="email" value="a@b.c" />');

    await page.focus('#f [name=name]');
    await page.keyboard.press('Tab');

    await expect
      .poll(() => state(page))
      .toMatchObject({ dirty: false, touched: true, touchedFields: ['name'] });
  });

  test('a clicked checkbox and a chosen option both arrive as `change`', async ({ page }) => {
    await form(
      page,
      `<input name="agree" type="checkbox" />
       <select name="tier"><option value="free" selected>free</option><option value="pro">pro</option></select>`,
    );

    await page.check('#f [name=agree]');
    await expect.poll(() => state(page)).toMatchObject({ dirtyFields: ['agree'] });

    await page.selectOption('#f [name=tier]', 'pro');
    await expect.poll(() => state(page)).toMatchObject({ dirtyFields: ['agree', 'tier'] });

    // And back: unchecking restores the baseline for that field alone.
    await page.uncheck('#f [name=agree]');
    await expect.poll(() => state(page)).toMatchObject({ dirty: true, dirtyFields: ['tier'] });
  });
});
