import { test, expect } from '@playwright/test';

// Three-engine assertions for grid keyboard navigation (roadmap 23.3, spec 09
// F130–F131 §6, NFR-49).
//
// The movement matrix is proved in jsdom, where it belongs: which key from which
// cell reaches which cell is arithmetic over rows and cells and owes nothing to
// an engine. What is here is the part jsdom cannot answer, and each of the four
// is load-bearing rather than a duplicate of a Node assertion:
//
//  - **One Tab in, one Tab out.** The whole of F130's first sentence. jsdom has
//    no focus order at all, so `tabindex="-1"` on a hundred controls is a claim
//    about attributes there and a claim about the page here.
//  - **Focus really lands on the cell.** A `<td>` is not focusable until this
//    library makes it one, and whether `focus()` then takes is the engine's
//    answer, not ours.
//  - **The cell is scrolled into view.** F130 says the browser does this and this
//    library does not — which is only true if `focus()` really does it.
//  - **Enter in, Escape back, on a real control.** The F131 round trip.
//
// The fixture is peer-free: a data grid has no vendor behind it, which is the
// reason this item exists (spec 09 §1).

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
    // A focusable sentinel on each side of the table, so "one Tab in, one Tab
    // out" is a question about the page rather than about browser chrome.
    const before = document.createElement('button');
    before.id = 'before';
    before.textContent = 'before';
    const host = document.getElementById('host');
    host.before(before);

    const after = document.createElement('button');
    after.id = 'after';
    after.textContent = 'after';
    host.after(after);

    window.eglTable = window.egl.bootstrap.bsTable(host, {
      columns: [
        { key: 'a', label: 'Alpha' },
        { key: 'b', label: 'Beta' },
      ],
      // Enough rows that the last one is below the fold of a bounded container.
      data: Array.from({ length: 60 }, (_, index) => ({ a: `a${index}`, b: `b${index}` })),
      rowKey: 'a',
      selection: true,
      resize: true,
      responsive: true,
      sticky: { maxHeight: '160px' },
      keyboard: true,
    });
  });
});

/** The cell holding the grid's single tab stop, as the page sees it. */
const stopText = (page) =>
  page.evaluate(() => document.querySelector('table [tabindex="0"]')?.textContent?.trim() ?? null);

test('the grid is one tab stop: one Tab reaches it, one more leaves it', async ({ page }) => {
  await page.locator('#before').focus();
  await page.keyboard.press('Tab');

  // Sixty checkboxes, two resize grips and a hundred and twenty cells, and Tab
  // landed on the one cell that carries the stop.
  const landed = await page.evaluate(() => ({
    tag: document.activeElement?.tagName,
    isTheStop: document.activeElement === document.querySelector('table [tabindex="0"]'),
  }));
  expect(landed.isTheStop).toBe(true);
  expect(landed.tag).toBe('TH');

  await page.keyboard.press('Tab');
  await expect(page.locator('#after')).toBeFocused();
});

test('the arrows move focus itself, not merely an attribute', async ({ page }) => {
  await page.locator('#before').focus();
  await page.keyboard.press('Tab');

  // Tab lands on the F95 selection header, so one step right is `Alpha` and one
  // step down is that column's first body cell.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');

  const focused = await page.evaluate(() => ({
    text: document.activeElement?.textContent?.trim(),
    isCell: document.activeElement?.tagName === 'TD',
    isTheStop: document.activeElement === document.querySelector('table [tabindex="0"]'),
  }));
  expect(focused.isCell).toBe(true);
  expect(focused.isTheStop).toBe(true);
  expect(focused.text).toBe('a0');
});

test('the browser scrolls the cell into view, because this library does not', async ({ page }) => {
  const scrollTop = () =>
    page.evaluate(() => document.querySelector('.table-responsive')?.scrollTop ?? -1);

  await page.locator('#before').focus();
  await page.keyboard.press('Tab');
  expect(await scrollTop()).toBe(0);

  await page.keyboard.press('Control+End');

  // F130 asks for a roving tabindex rather than a painted highlight precisely so
  // that this is the engine's job: `focus()` scrolled the container, and nothing
  // in this library called `scrollIntoView`.
  expect(await scrollTop()).toBeGreaterThan(0);
  expect(await stopText(page)).toBe('b59');
});

test('Enter enters the cell control and Escape comes back (F131)', async ({ page }) => {
  await page.locator('#before').focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('ArrowDown'); // the first body row's selection cell
  await page.keyboard.press('Enter');

  await expect(page.locator('tbody input[data-egl-select]').first()).toBeFocused();

  // The control really is operable once entered — this is what the demoted tab
  // stop costs nothing.
  await page.keyboard.press('Space');
  expect(await page.evaluate(() => window.eglTable.selection.count())).toBe(1);

  await page.keyboard.press('Escape');
  const back = await page.evaluate(
    () => document.activeElement === document.querySelector('table [tabindex="0"]'),
  );
  expect(back).toBe(true);

  // And from the cell, the arrows are the grid's again.
  await page.keyboard.press('ArrowRight');
  expect(await stopText(page)).toBe('a0');
});
