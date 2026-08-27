import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

// Three-engine assertions for rendering findings (roadmap 21.3, spec 08 §2
// F120-F121 and §6, ADR-0079).
//
// **Why these cannot be jsdom tests.** The Node suite proves what is rendered:
// the nodes, the classes, the ARIA, the teardown. Three claims are left over,
// and each needs something jsdom does not have:
//
//  - **where focus went** on a blocked submit (F121). jsdom's focus model is a
//    simulation; "the first field with an error is focused" is a claim about an
//    engine's.
//  - **that the message is actually visible.** `.invalid-feedback` is
//    `display: none` until a SIBLING matches `:invalid`, which is the entire
//    reason this library inserts its node immediately after the field's last
//    control rather than anywhere convenient. Only a real stylesheet in a real
//    engine can say whether that placement was right.
//  - **that a real live region exists and carries the summary.**
//
// Bootstrap's stylesheet is read once and injected as content, per the 20.7
// rule: the suite's workers do not fetch a 227 kB file per test.
const BOOTSTRAP_CSS = readFileSync('node_modules/bootstrap/dist/css/bootstrap.min.css', 'utf8');
const FIXTURE = '/src/test/browser/fixture.html';

test.beforeEach(async ({ page }) => {
  /** @type {string[]} */
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  await page.goto(FIXTURE);
  const ready = await page.evaluate(() => window.__eglReady);
  expect(ready.ok, `fixture failed to load the built bundles: ${ready.message ?? ''}`).toBe(true);
  await page.addStyleTag({ content: BOOTSTRAP_CSS });
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
  }, markup);
}

test.describe('F121 — announced and reachable', () => {
  test('focus really lands on the first field with an error', async ({ page }) => {
    await form(
      page,
      `<input name="a" class="form-control" value="fine" />
       <input name="b" class="form-control" value="bad" />
       <input name="c" class="form-control" value="bad" />`,
    );

    const focused = await page.evaluate(async () => {
      const { createForm, createValidator, bindFormFeedback } = window.egl.forms;
      const { BOOTSTRAP_FEEDBACK_CLASSES } = window.egl.bootstrap;
      const validator = createValidator(createForm(document.getElementById('f')), {
        rules: {
          a: () => undefined,
          b: (value) => (value === 'bad' ? 'b is wrong' : undefined),
          c: (value) => (value === 'bad' ? 'c is wrong' : undefined),
        },
      });
      const feedback = bindFormFeedback(validator, { classes: BOOTSTRAP_FEEDBACK_CLASSES });

      const { valid } = await validator.validate();
      if (!valid) feedback.report();
      return document.activeElement?.getAttribute('name');
    });

    expect(focused).toBe('b');
  });

  test("the message is actually visible, which is why the node's placement matters", async ({
    page,
  }) => {
    await form(page, '<input name="handle" class="form-control" value="taken" />');

    const shown = await page.evaluate(async () => {
      const { createForm, createValidator, bindFormFeedback } = window.egl.forms;
      const { BOOTSTRAP_FEEDBACK_CLASSES } = window.egl.bootstrap;
      const validator = createValidator(createForm(document.getElementById('f')), {
        rules: { handle: (value) => (value === 'taken' ? 'That handle is taken' : undefined) },
      });
      bindFormFeedback(validator, { classes: BOOTSTRAP_FEEDBACK_CLASSES });
      await validator.validate();

      const control = document.querySelector('[name=handle]');
      const node = control.nextElementSibling;
      const style = getComputedStyle(node);
      return {
        classes: node.className,
        display: style.display,
        text: node.textContent,
        isSibling: node.previousElementSibling === control,
      };
    });

    expect(shown.classes).toContain('invalid-feedback');
    expect(shown.isSibling).toBe(true);
    expect(shown.text).toBe('That handle is taken');
    // The whole point: Bootstrap hides `.invalid-feedback` unless a sibling is
    // `:invalid`. `display: block` here proves the placement, not the class.
    expect(shown.display).toBe('block');
  });

  test('a warning lands where Bootstrap will still show it', async ({ page }) => {
    await form(page, '<input name="pw" class="form-control" value="short" />');

    const shown = await page.evaluate(async () => {
      const { createForm, createValidator, bindFormFeedback } = window.egl.forms;
      const { BOOTSTRAP_FEEDBACK_CLASSES } = window.egl.bootstrap;
      const validator = createValidator(createForm(document.getElementById('f')), {
        rules: { pw: () => ({ message: 'Consider a longer one', severity: 'warning' }) },
      });
      bindFormFeedback(validator, { classes: BOOTSTRAP_FEEDBACK_CLASSES });
      await validator.validate();

      const node = document.querySelector('[name=pw]').nextElementSibling;
      return { classes: node.className, display: getComputedStyle(node).display };
    });

    // `form-text`, not `invalid-feedback`: a warning in the latter would be
    // invisible, because the control is not `:invalid`.
    expect(shown.classes).toContain('form-text');
    expect(shown.classes).not.toContain('invalid-feedback');
    expect(shown.display).not.toBe('none');
  });

  test('a real live region carries the summary, and leaves focus alone', async ({ page }) => {
    await form(page, '<input name="a" class="form-control" value="bad" />');

    const outcome = await page.evaluate(async () => {
      const { createForm, createValidator, bindFormFeedback } = window.egl.forms;
      const validator = createValidator(createForm(document.getElementById('f')), {
        rules: { a: () => 'wrong' },
      });
      const feedback = bindFormFeedback(validator);
      await validator.validate();

      const before = document.querySelectorAll('[aria-live]').length;
      feedback.report();
      const region = document.querySelector('[aria-live]');
      // The announcement is asynchronous by design (the region clears and
      // re-fills so the same message is read twice), so give it a frame.
      await new Promise((resolve) => setTimeout(resolve, 100));
      return {
        before,
        after: document.querySelectorAll('[aria-live]').length,
        politeness: region?.getAttribute('aria-live'),
        text: region?.textContent,
        focused: document.activeElement?.getAttribute('name'),
      };
    });

    expect(outcome.before).toBe(0);
    expect(outcome.after).toBe(1);
    expect(outcome.politeness).toBe('polite');
    expect(outcome.text).toBe('1 problem needs attention.');
    // Focus went to the field, not into the region — that is the F110 contract.
    expect(outcome.focused).toBe('a');
  });
});
