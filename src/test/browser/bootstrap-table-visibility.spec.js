import { test, expect } from '@playwright/test';

// Three-engine assertions for the F129 column chooser (roadmap 23.2, spec 09
// F128–F129 §6, NFR-49).
//
// Deliberately two tests, not twenty. The Node suite proves the model in full —
// what is hidden, what survives, what is refused, what the URL carries — and
// jsdom is the right instrument for all of that. Exactly two claims need a real
// engine, and both are about the **keyboard**, which is the half NFR-49 names and
// the half jsdom cannot answer:
//
//  - **`Tab` reaches the checkboxes and `Space` toggles one.** jsdom does not
//    implement the focus order of a document, and it does not activate a checkbox
//    on `Space` — dispatching a `change` event, as the Node suite does, asserts
//    the wiring and not the operability. Only an engine can say that a keyboard
//    user can actually work this control.
//  - **The disabled box is skipped by `Tab` and does nothing under `Space`.** The
//    refusal of the last visible column rests on `disabled` being honoured; that
//    is the browser's promise, not ours, and it is worth one assertion that the
//    browser keeps it.
//
// Bootstrap's own bundle is not injected: the chooser is native checkboxes and a
// `role="group"`, so it needs no peer — which is itself part of the claim.

const FIXTURE = '/src/test/browser/fixture.html';

test.beforeEach(async ({ page }) => {
  /** @type {string[]} */
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  await page.goto(FIXTURE);
  const ready = await page.evaluate(() => window.__eglReady);
  expect(ready.ok, `fixture failed to load the built bundles: ${ready.message ?? ''}`).toBe(true);
  expect(pageErrors, 'the fixture must load without page errors').toEqual([]);

  await page.evaluate(() => {
    const host = document.getElementById('host');
    window.eglTable = window.egl.bootstrap.bsTable(host, {
      columns: [
        { key: 'a', label: 'Alpha' },
        { key: 'b', label: 'Beta' },
      ],
      data: [{ a: 'a1', b: 'b1' }],
      controls: { columns: true },
    });

    // A focusable sentinel AFTER the table, and it is load-bearing rather than
    // scenery. Without it there is nothing to receive focus once Tab has left the
    // chooser, so focus leaves the document — and what `document.activeElement`
    // reads then is the engine's business, not this library's: Chromium and
    // WebKit reset it to `<body>`, Firefox keeps reporting the last element the
    // page had, and a subsequent `Space` therefore lands somewhere different on
    // each. Giving Tab a real destination inside the page is what makes the
    // assertions below about the chooser instead of about browser chrome.
    const sentinel = document.createElement('button');
    sentinel.id = 'after';
    sentinel.textContent = 'after the table';
    document.body.append(sentinel);
  });
});

test('a keyboard user can hide a column: Tab to the box, Space to toggle', async ({ page }) => {
  // Tab really does move along the group rather than out of it — asserted first,
  // because hiding one of two columns disables the box for the other.
  await page.locator('input[data-egl-column="a"]').focus();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.getAttribute('data-egl-column'))).toBe(
    'b',
  );

  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Space');

  await expect(page.locator('thead tr:first-child th')).toHaveCount(1);
  expect(await page.evaluate(() => window.eglTable.getHiddenColumns())).toEqual(['a']);
});

test("the last visible column is unreachable and inert, because `disabled` is the engine's", async ({
  page,
}) => {
  await page.evaluate(() => window.eglTable.hideColumn('a'));
  const last = page.locator('input[data-egl-column="b"]');
  await expect(last).toBeDisabled();

  // Focus the box before it, then Tab: a disabled control is skipped by every
  // engine's focus order, so Tab goes straight past it to the sentinel.
  await page.locator('input[data-egl-column="a"]').focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('#after')).toBeFocused();

  // And the key that would have toggled it does nothing to the table, because
  // the box it would have toggled was never reached.
  await page.keyboard.press('Space');
  expect(await page.evaluate(() => window.eglTable.getHiddenColumns())).toEqual(['a']);
  await expect(page.locator('thead tr:first-child th')).toHaveCount(1);
});
