import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

// Three-engine assertions for the submit lifecycle (roadmap 21.4, spec 08 §2
// F122-F123 and §6, ADR-0080).
//
// **Why these cannot be jsdom tests.** The Node suite proves the sequence: the
// guard by promise identity, disable-and-restore, the mapper's negative-path
// corpus, the teardown. Three claims are left over, and each needs an engine
// jsdom does not have:
//
//  - **that the page does not navigate.** jsdom does not implement form
//    submission at all — it logs "Not implemented" and stays put — so a test
//    there passes whether or not anything called `preventDefault()`. The single
//    most user-visible failure mode of this whole item is a form that saves
//    correctly and then reloads the page, and only a real engine can rule it
//    out.
//  - **that a disabled submit button really swallows the second click.** The
//    guard is asserted by identity in Node; this is the same guarantee at the
//    level a user reaches it, and "a click on a disabled control dispatches
//    nothing" is the engine's rule, not ours.
//  - **that a server's finding is visible and the control is really `:invalid`.**
//    jsdom's constraint validation is a simulation (spec 08 §6), so whether
//    `setCustomValidity` with a server's message leaves the field `:invalid` —
//    and therefore not simultaneously styled green by `.was-validated :valid` —
//    is a question only a real `ValidityState` and a real stylesheet can answer.
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
 * A real `<form>` with a real submit button, and `novalidate` so the browser's
 * own bubbles stay out of the way — the engine is the one deciding here (F119).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} markup
 */
async function form(page, markup) {
  await page.evaluate((html) => {
    const host = document.getElementById('host');
    host.replaceChildren();
    host.innerHTML = `<form id="f" novalidate>${html}
      <button id="save" type="submit" class="btn btn-primary">Save</button>
    </form>`;
  }, markup);
}

test.describe('F122 — the lifecycle a user actually drives', () => {
  test('a real click runs the handler and the page stays where it was', async ({ page }) => {
    await form(page, '<input name="name" class="form-control" value="Ada" />');

    await page.evaluate(() => {
      const { createForm, createValidator, bindSubmit } = window.egl.forms;
      // A marker a navigation would wipe out: this is how "the page did not
      // reload" is asserted rather than assumed.
      window.__marker = 'alive';
      window.__saved = [];
      const validator = createValidator(createForm(document.getElementById('f')));
      bindSubmit(validator, {
        handler: ({ values }) => {
          window.__saved.push(values);
        },
      });
    });

    await page.click('#save');
    await expect.poll(() => page.evaluate(() => window.__saved?.length ?? 0)).toBe(1);

    const state = await page.evaluate(() => ({
      marker: window.__marker,
      saved: window.__saved[0],
      busy: document.getElementById('f').hasAttribute('aria-busy'),
    }));

    expect(state.marker).toBe('alive');
    expect(state.saved).toEqual({ name: 'Ada' });
    expect(state.busy).toBe(false);
  });

  test('the disabled submit button swallows the second click', async ({ page }) => {
    await form(page, '<input name="name" class="form-control" value="Ada" />');

    await page.evaluate(() => {
      const { createForm, createValidator, bindSubmit } = window.egl.forms;
      window.__calls = 0;
      window.__release = () => {};
      const validator = createValidator(createForm(document.getElementById('f')));
      bindSubmit(validator, {
        disable: ['#save'],
        busyClass: 'disabled',
        handler: () => {
          window.__calls += 1;
          return new Promise((resolve) => {
            window.__release = resolve;
          });
        },
      });
    });

    await page.click('#save');
    await expect.poll(() => page.evaluate(() => window.__calls)).toBe(1);
    await expect(page.locator('#save')).toBeDisabled();

    // `force`, because Playwright refuses to click a disabled control — and the
    // point is what the ENGINE does with the click, not what the harness thinks
    // of it. A real browser dispatches nothing from a disabled button.
    await page.click('#save', { force: true });
    expect(await page.evaluate(() => window.__calls)).toBe(1);

    await page.evaluate(() => window.__release());
    await expect(page.locator('#save')).toBeEnabled();
    expect(await page.evaluate(() => document.getElementById('save').className)).toBe(
      'btn btn-primary',
    );
  });
});

test.describe('F123 — a server’s finding, on a real engine', () => {
  test('is visible under the control, and leaves the field really :invalid', async ({ page }) => {
    await form(page, '<input name="email" class="form-control" value="ada@example.com" />');

    const state = await page.evaluate(async () => {
      const { createForm, createValidator, bindFormFeedback, bindSubmit } = window.egl.forms;
      const { BOOTSTRAP_FEEDBACK_CLASSES } = window.egl.bootstrap;
      const { HttpError } = window.egl.errors;

      const validator = createValidator(createForm(document.getElementById('f')));
      const feedback = bindFormFeedback(validator, { classes: BOOTSTRAP_FEEDBACK_CLASSES });
      const submitter = bindSubmit(validator, {
        feedback,
        handler: () =>
          Promise.reject(
            new HttpError('Unprocessable Entity', {
              status: 422,
              body: { errors: { email: 'Already registered' } },
            }),
          ),
      });

      const failure = await submitter.submit().then(
        () => null,
        (thrown) => thrown,
      );

      const control = document.querySelector('[name=email]');
      const node = control.nextElementSibling;
      return {
        status: failure?.status,
        text: node.textContent,
        display: getComputedStyle(node).display,
        classes: node.className,
        // The real ValidityState, which is the half jsdom only simulates.
        invalid: control.matches(':invalid'),
        valid: control.matches(':valid'),
        message: control.validationMessage,
        focused: document.activeElement?.getAttribute('name'),
        formValidated: document.getElementById('f').className,
      };
    });

    expect(state.status).toBe(422);
    expect(state.text).toBe('Already registered');
    // Visible, and for the same reason as 21.3: the node is the control's
    // sibling, which is the only placement Bootstrap's CSS will show.
    expect(state.display).toBe('block');
    expect(state.classes).toContain('invalid-feedback');
    // Pushed through `setCustomValidity`, so the platform agrees with the engine
    // about a field the SERVER rejected — and `.was-validated :valid` therefore
    // cannot style this control green at the same time (F119).
    expect(state.invalid).toBe(true);
    expect(state.valid).toBe(false);
    expect(state.message).toBe('Already registered');
    expect(state.formValidated).toContain('was-validated');
    // And the user was taken to it.
    expect(state.focused).toBe('email');
  });
});
