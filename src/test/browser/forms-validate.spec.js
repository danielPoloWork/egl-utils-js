import { test, expect } from '@playwright/test';

// Three-engine assertions for the validation engine's platform seam (roadmap
// 21.2, spec 08 §2 F119 and §6, ADR-0078).
//
// **Why these cannot be jsdom tests.** The Node suite proves every rule, every
// severity and every race against jsdom, which is the right instrument for
// logic and the wrong one for constraint validation. jsdom implements the API
// faithfully enough to unit-test against, and then reports
// `validationMessage` as the single string "Constraints not satisfied" for
// every failure — so the two claims F119 actually makes are unprovable there:
//
//  - that a real engine's own **wording** reaches the finding, which is the
//    reason reading the platform beats re-declaring it (it is localized, and we
//    do not have to write it);
//  - that `setCustomValidity` really does make a real `checkValidity()` and a
//    real submit refuse, which is the whole point of pushing our message back.
//
// Bootstrap is not loaded: nothing here needs it, and asserting that keeps the
// entry honest about needing no component library at all.

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
 * Put a real form on the page and return nothing — the test drives it through
 * `window.egl` like every other spec here.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} markup
 */
async function form(page, markup) {
  await page.evaluate((html) => {
    const host = document.getElementById('host');
    host.replaceChildren();
    host.innerHTML = `<form id="f">${html}</form>`;
  }, markup);
}

test.describe('F119 — the platform is read, not re-declared', () => {
  test("a native failure carries the engine's own wording", async ({ page }) => {
    await form(page, '<input name="mail" type="email" value="not-an-address" required />');

    const finding = await page.evaluate(async () => {
      const { createForm, createValidator } = window.egl.forms;
      const validator = createValidator(createForm(document.getElementById('f')));
      const { fields } = await validator.validate();
      return fields.mail[0];
    });

    expect(finding.source).toBe('native');
    expect(finding.constraint).toBe('typeMismatch');
    // Not asserted verbatim — it is the engine's string and it is localized.
    // What is asserted is that it is real prose rather than jsdom's placeholder.
    expect(finding.message.length).toBeGreaterThan(8);
    expect(finding.message).not.toBe('Constraints not satisfied');
  });

  test('valueMissing on an empty required field, in this engine', async ({ page }) => {
    await form(page, '<input name="who" required />');
    const constraint = await page.evaluate(async () => {
      const { createForm, createValidator } = window.egl.forms;
      const { fields } = await createValidator(createForm(document.getElementById('f'))).validate();
      return fields.who[0].constraint;
    });
    expect(constraint).toBe('valueMissing');
  });

  test("a rule's message makes a real checkValidity() refuse, and a real submit", async ({
    page,
  }) => {
    await form(page, '<input name="handle" value="taken" /><button type="submit">Go</button>');

    const outcome = await page.evaluate(async () => {
      const { createForm, createValidator } = window.egl.forms;
      const el = document.getElementById('f');
      const control = el.querySelector('[name=handle]');
      const validator = createValidator(createForm(el), {
        rules: { handle: (value) => (value === 'taken' ? 'That handle is taken' : undefined) },
      });

      const before = { valid: control.checkValidity(), formValid: el.checkValidity() };
      await validator.validate();
      const after = {
        valid: control.checkValidity(),
        formValid: el.checkValidity(),
        message: control.validationMessage,
        customError: control.validity.customError,
      };

      // A real submit, with a real listener: an invalid form must not fire it.
      let submitted = false;
      el.addEventListener('submit', (event) => {
        event.preventDefault();
        submitted = true;
      });
      el.querySelector('button').click();
      await new Promise((resolve) => setTimeout(resolve, 50));

      control.value = 'free';
      await validator.validate();
      const cleared = { valid: control.checkValidity(), customError: control.validity.customError };

      return { before, after, submitted, cleared };
    });

    expect(outcome.before).toEqual({ valid: true, formValid: true });
    expect(outcome.after.valid).toBe(false);
    expect(outcome.after.formValid).toBe(false);
    expect(outcome.after.customError).toBe(true);
    expect(outcome.after.message).toBe('That handle is taken');
    // The engine's own refusal, not ours: nothing in this library listens for
    // submit, and the browser still declined to fire it.
    expect(outcome.submitted).toBe(false);
    expect(outcome.cleared).toEqual({ valid: true, customError: false });
  });

  test('a real blur triggers validation, through focusout', async ({ page }) => {
    await form(page, '<input name="a" /><input name="b" />');

    const runs = await page.evaluate(async () => {
      const { createForm, createValidator } = window.egl.forms;
      const el = document.getElementById('f');
      /** @type {string[]} */
      const seen = [];
      createValidator(createForm(el), {
        validateOn: ['blur'],
        rules: {
          a: () => {
            seen.push('a');
            return undefined;
          },
          b: () => {
            seen.push('b');
            return undefined;
          },
        },
      });

      el.querySelector('[name=a]').focus();
      el.querySelector('[name=b]').focus(); // moving focus blurs `a` for real
      await new Promise((resolve) => setTimeout(resolve, 50));
      return seen;
    });

    expect(runs).toEqual(['a']);
  });

  test('the entry resolves and works with no Bootstrap global at all', async ({ page }) => {
    await form(page, '<input name="who" value="x" />');
    const outcome = await page.evaluate(async () => {
      const { createForm, createValidator } = window.egl.forms;
      const validator = createValidator(createForm(document.getElementById('f')), {
        rules: { who: () => undefined },
      });
      const { valid } = await validator.validate();
      return { valid, bootstrap: typeof window.bootstrap };
    });
    expect(outcome).toEqual({ valid: true, bootstrap: 'undefined' });
  });
});
