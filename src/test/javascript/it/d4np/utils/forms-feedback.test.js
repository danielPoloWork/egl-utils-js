// @vitest-environment jsdom
// Example tests (roadmap 21.3, spec 08 §2 items F120-F121 and §6, ADR-0079) for
// rendering findings into a form.
//
// Two things get the most attention. The **teardown** is asserted to leave the
// markup as it found it, because a renderer that creates nodes and forgets them
// is a leak with a visual symptom. And **text, never markup** is asserted with a
// payload, because 21.4 will route a server's error body through this exact path.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bindFormFeedback,
  createForm,
  createValidator,
} from '../../../../../main/javascript/it/d4np/utils/forms.js';
import { BOOTSTRAP_FEEDBACK_CLASSES } from '../../../../../main/javascript/it/d4np/utils/bootstrap.js';

/** @type {Element} */
let root;

/**
 * @param {string} html
 * @returns {Element}
 */
function mount(html) {
  document.body.innerHTML = `<form id="root">${html}</form>`;
  return /** @type {Element} */ (document.getElementById('root'));
}

/**
 * @param {Record<string, any>} [rules]
 * @param {Record<string, any>} [options]
 */
function wire(rules = {}, options = {}) {
  const form = createForm(root);
  const validator = createValidator(form, { native: false, rules });
  const feedback = bindFormFeedback(validator, options);
  return { form, validator, feedback };
}

beforeEach(() => {
  root = mount(`
    <input name="name" value="Ada" />
    <input name="email" value="a@b.c" />
  `);
});

describe('F120 — the engine emits, a class map renders', () => {
  it('creates a feedback node after the field, with the message as text', async () => {
    const { validator } = wire({ name: () => 'Too plain' });
    await validator.validate();

    const control = /** @type {Element} */ (root.querySelector('[name=name]'));
    const node = /** @type {Element} */ (control.nextElementSibling);
    expect(node.tagName).toBe('DIV');
    expect(node.textContent).toBe('Too plain');
    expect(node.children).toHaveLength(1);
  });

  it('renders one child per finding, so two messages do not run together', async () => {
    const { validator } = wire({
      name: [() => 'first', () => ({ message: 'second', severity: 'warning' })],
    });
    await validator.validate();

    const node = /** @type {Element} */ (root.querySelector('[name=name]')?.nextElementSibling);
    expect([...node.children].map((child) => child.textContent)).toEqual(['first', 'second']);
  });

  it('applies the injected class map and nothing of its own', async () => {
    const { validator } = wire(
      { name: () => 'no' },
      { classes: { controlInvalid: 'x-bad', invalid: 'x-msg', validated: 'x-done' } },
    );
    await validator.validate();

    const control = /** @type {Element} */ (root.querySelector('[name=name]'));
    expect(control.classList.contains('x-bad')).toBe(true);
    expect(control.nextElementSibling?.classList.contains('x-msg')).toBe(true);
    expect(root.classList.contains('x-done')).toBe(true);
    // The clean field carries no class at all: nothing was configured for it.
    expect(root.querySelector('[name=email]')?.className).toBe('');
  });

  it('is styling-free by default — structure, text and ARIA only', async () => {
    const { validator } = wire({ name: () => 'no' });
    await validator.validate();
    const control = /** @type {Element} */ (root.querySelector('[name=name]'));
    expect(control.className).toBe('');
    expect(control.nextElementSibling?.className).toBe('');
    expect(control.getAttribute('aria-invalid')).toBe('true');
  });

  it('wires aria-invalid and aria-describedby, and unwires them', async () => {
    const { form, validator } = wire({
      name: (value) => (value === 'bad' ? 'no' : undefined),
    });
    const control = /** @type {Element} */ (root.querySelector('[name=name]'));

    form.setValues({ name: 'bad' });
    await validator.validate();
    const id = control.nextElementSibling?.id;
    expect(id).toMatch(/^egl-feedback-\d+$/);
    expect(control.getAttribute('aria-invalid')).toBe('true');
    expect(control.getAttribute('aria-describedby')).toBe(id);

    form.setValues({ name: 'good' });
    await validator.validate();
    expect(control.hasAttribute('aria-invalid')).toBe(false);
    expect(control.hasAttribute('aria-describedby')).toBe(false);
  });

  it("keeps a caller's own aria-describedby token", async () => {
    root = mount('<input name="name" aria-describedby="hint" /><span id="hint">a hint</span>');
    const { validator } = wire({ name: () => 'no' });
    await validator.validate();

    const control = /** @type {Element} */ (root.querySelector('[name=name]'));
    const tokens = (control.getAttribute('aria-describedby') ?? '').split(' ');
    expect(tokens).toHaveLength(2);
    expect(tokens[0]).toBe('hint');
  });

  it("uses the caller's node when one is given, and creates nothing", async () => {
    root = mount('<input name="name" /><p id="mine"></p>');
    const { validator, feedback } = wire({ name: () => 'no' }, { feedback: { name: '#mine' } });
    await validator.validate();

    expect(document.getElementById('mine')?.textContent).toBe('no');
    // No container was inserted: the control's next sibling is still the
    // caller's node, and the only `div` on the page is the message inside it.
    expect(root.querySelector('[name=name]')?.nextElementSibling?.id).toBe('mine');
    expect(root.querySelectorAll('div')).toHaveLength(1);
    expect(document.getElementById('mine')?.children).toHaveLength(1);

    // A caller's node is emptied, never removed.
    feedback.destroy();
    expect(document.getElementById('mine')).not.toBeNull();
    expect(document.getElementById('mine')?.textContent).toBe('');
  });

  it('renders form-level findings in their own node', async () => {
    const form = createForm(root);
    const validator = createValidator(form, { native: false, formRules: () => 'the whole thing' });
    bindFormFeedback(validator);
    await validator.validate();
    expect(root.lastElementChild?.textContent).toBe('the whole thing');
  });

  it('creates nothing for a declared field that matched no control', async () => {
    const form = createForm(root, { fields: { ghost: '#absent', name: '[name=name]' } });
    const validator = createValidator(form, { native: false, rules: { ghost: () => 'no' } });
    bindFormFeedback(validator);
    await validator.validate();
    // The finding exists and has nowhere to go, which is honest: there is no
    // control to attach an explanation to.
    expect(validator.result().fields.ghost).toHaveLength(1);
    expect(root.querySelectorAll('div')).toHaveLength(0);
  });

  it("uses the caller's node for form-level findings too", async () => {
    root = mount('<input name="name" /><p id="summary"></p>');
    const form = createForm(root);
    const validator = createValidator(form, { native: false, formRules: () => 'form-wide' });
    bindFormFeedback(validator, { formFeedback: '#summary' });
    await validator.validate();
    expect(document.getElementById('summary')?.textContent).toBe('form-wide');

    // Repainted in place on the next run, not re-resolved into a second node.
    await validator.validate();
    expect(document.getElementById('summary')?.children).toHaveLength(1);
  });

  it('renders text, never markup — this is the path a server payload takes', async () => {
    const payload = '<img src=x onerror="window.__xss = true">';
    const { validator } = wire({ name: () => payload });
    await validator.validate();

    const node = /** @type {Element} */ (root.querySelector('[name=name]')?.nextElementSibling);
    expect(node.querySelector('img')).toBeNull();
    expect(node.textContent).toBe(payload);
    expect(/** @type {any} */ (window).__xss).toBeUndefined();
  });

  it('folds a native finding in like any other', async () => {
    root = mount('<input name="who" required />');
    const validator = createValidator(createForm(root));
    bindFormFeedback(validator, { classes: { controlInvalid: 'is-invalid' } });
    await validator.validate();

    const control = /** @type {Element} */ (root.querySelector('[name=who]'));
    expect(control.classList.contains('is-invalid')).toBe(true);
    expect(control.nextElementSibling?.textContent).not.toBe('');
  });

  it('rejects a malformed option', () => {
    const validator = createValidator(createForm(root));
    expect(() => bindFormFeedback(/** @type {any} */ ({}))).toThrow(
      /must be a createValidator instance/,
    );
    expect(() => bindFormFeedback(validator, /** @type {any} */ ({ klasses: {} }))).toThrow(
      /unknown option 'klasses'/,
    );
    expect(() => bindFormFeedback(validator, { classes: { invalidd: 'x' } })).toThrow(
      /unknown class slot 'invalidd'/,
    );
    expect(() => bindFormFeedback(validator, { feedback: { ghost: '#x' } })).toThrow(
      /options\.feedback names no such field 'ghost'/,
    );
    expect(() => bindFormFeedback(validator, { feedback: { name: '#nope' } })).not.toThrow();
    expect(() => bindFormFeedback(validator, /** @type {any} */ ({ summary: 'x' }))).toThrow(
      /summary must be a function/,
    );
    expect(() => bindFormFeedback(validator, /** @type {any} */ ({ announce: 'yes' }))).toThrow(
      /announce must be a boolean/,
    );
    expect(() => bindFormFeedback(validator, /** @type {any} */ ({ signal: {} }))).toThrow(
      /signal must be an AbortSignal/,
    );
    expect(() => bindFormFeedback(validator, /** @type {any} */ ('nope'))).toThrow(
      /options must be a plain object/,
    );
  });

  it('accepts an Element as well as a selector, and refuses anything else', async () => {
    const node = document.createElement('p');
    root.append(node);
    const { validator } = wire({ name: () => 'no' }, { feedback: { name: node } });
    await validator.validate();
    expect(node.textContent).toBe('no');

    const other = wire({ name: () => 'no' }, { feedback: { name: /** @type {any} */ (7) } });
    await expect(other.validator.validate()).rejects.toThrow(
      /options\.feedback\.name must be an Element or a selector string/,
    );
  });

  it('reports a feedback selector that matches nothing, at the point it is needed', async () => {
    const { validator } = wire({ name: () => 'no' }, { feedback: { name: '#absent' } });
    await expect(validator.validate()).rejects.toThrow(
      /options\.feedback\.name matched no element/,
    );
  });
});

describe('F121 — announced and reachable, not merely red', () => {
  it('moves focus to the first field with an error', async () => {
    const { validator, feedback } = wire({
      name: () => undefined,
      email: () => 'not an address',
    });
    await validator.validate();

    const focused = feedback.report();
    expect(focused).toBe(root.querySelector('[name=email]'));
    expect(document.activeElement).toBe(root.querySelector('[name=email]'));
  });

  it('announces a count rather than reciting every message', async () => {
    const announce = vi.fn();
    const { validator, feedback } = wire(
      { name: () => 'a', email: () => 'b' },
      { liveRegion: { announce, element: document.createElement('div'), destroy() {} } },
    );
    await validator.validate();
    feedback.report();
    expect(announce).toHaveBeenCalledWith('2 problems need attention.');

    announce.mockClear();
    const one = wire(
      { name: () => 'a' },
      { liveRegion: { announce, element: root, destroy() {} } },
    );
    await one.validator.validate();
    one.feedback.report();
    expect(announce).toHaveBeenCalledWith('1 problem needs attention.');
  });

  it("takes the caller's wording", async () => {
    const announce = vi.fn();
    const { validator, feedback } = wire(
      { name: () => 'a' },
      {
        liveRegion: { announce, element: root, destroy() {} },
        summary: (result) => `custom ${result.validated.length}`,
      },
    );
    await validator.validate();
    feedback.report();
    expect(announce).toHaveBeenCalledWith('custom 2');
  });

  it('says nothing and focuses nothing when there is nothing wrong', async () => {
    const announce = vi.fn();
    const { validator, feedback } = wire(
      { name: () => undefined },
      { liveRegion: { announce, element: root, destroy() {} } },
    );
    await validator.validate();
    expect(feedback.report()).toBeNull();
    expect(announce).toHaveBeenCalledWith('No problems found.');
  });

  it('can be silenced', async () => {
    const announce = vi.fn();
    const { validator, feedback } = wire(
      { name: () => 'a' },
      { announce: false, liveRegion: { announce, element: root, destroy() {} } },
    );
    await validator.validate();
    feedback.report();
    expect(announce).not.toHaveBeenCalled();
  });

  it('adds no live region to the document until report() needs one', async () => {
    const { validator, feedback } = wire({ name: () => 'a' });
    await validator.validate();
    const before = document.querySelectorAll('[aria-live]').length;
    feedback.report();
    expect(document.querySelectorAll('[aria-live]').length).toBe(before + 1);

    feedback.destroy();
    expect(document.querySelectorAll('[aria-live]').length).toBe(before);
  });

  it('skips a disabled control when choosing where to send focus', async () => {
    root = mount('<input name="a" disabled /><input name="b" />');
    const { validator, feedback } = wire({ a: () => 'x', b: () => 'y' });
    await validator.validate();
    expect(feedback.report()).toBe(root.querySelector('[name=b]'));
  });
});

describe('the Bootstrap costume', () => {
  it('is frozen data, composed at the call site', async () => {
    expect(Object.isFrozen(BOOTSTRAP_FEEDBACK_CLASSES)).toBe(true);
    expect(BOOTSTRAP_FEEDBACK_CLASSES.controlValid).toBe('');

    const { validator } = wire({ name: () => 'no' }, { classes: BOOTSTRAP_FEEDBACK_CLASSES });
    await validator.validate();

    const control = /** @type {Element} */ (root.querySelector('[name=name]'));
    expect(control.classList.contains('is-invalid')).toBe(true);
    expect(control.nextElementSibling?.classList.contains('invalid-feedback')).toBe(true);
    expect(root.classList.contains('was-validated')).toBe(true);
  });

  it('puts a non-blocking finding somewhere Bootstrap actually shows it', async () => {
    const { validator } = wire(
      { name: () => ({ message: 'just so you know', severity: 'warning' }) },
      { classes: BOOTSTRAP_FEEDBACK_CLASSES },
    );
    await validator.validate();

    const node = /** @type {Element} */ (root.querySelector('[name=name]')?.nextElementSibling);
    // `form-text`, not `invalid-feedback`: the latter is hidden unless a sibling
    // is `:invalid`, so a warning rendered there would never be seen.
    expect(node.classList.contains('form-text')).toBe(true);
    expect(node.classList.contains('invalid-feedback')).toBe(false);
    expect(node.firstElementChild?.classList.contains('text-warning')).toBe(true);
  });
});

describe('lifecycle', () => {
  it('leaves the markup as it found it', async () => {
    const before = root.innerHTML;
    const { validator, feedback } = wire(
      { name: () => 'no' },
      { classes: BOOTSTRAP_FEEDBACK_CLASSES },
    );
    await validator.validate();
    expect(root.innerHTML).not.toBe(before);

    feedback.destroy();
    expect(root.innerHTML).toBe(before);
    expect(root.className).toBe('');
  });

  it('is idempotent, and a command after destroy throws', async () => {
    const { validator, feedback } = wire({ name: () => 'no' });
    await validator.validate();
    feedback.destroy();
    expect(() => feedback.destroy()).not.toThrow();
    expect(() => feedback.report()).toThrow(/report\(\) was called after destroy\(\)/);
    expect(feedback.validator).toBe(validator);
    expect(feedback.element).toBe(root);
  });

  it('stops rendering once destroyed', async () => {
    const { form, validator, feedback } = wire({
      name: (value) => (value === 'bad' ? 'no' : undefined),
    });
    feedback.destroy();
    form.setValues({ name: 'bad' });
    await validator.validate();
    expect(root.querySelector('[name=name]')?.nextElementSibling?.tagName).toBe('INPUT');
  });

  it('an aborted signal tears it down', async () => {
    const controller = new AbortController();
    const { feedback } = wire({ name: () => 'no' }, { signal: controller.signal });
    controller.abort();
    expect(() => feedback.report()).toThrow(/after destroy\(\)/);

    const already = wire({ name: () => 'no' }, { signal: AbortSignal.abort() });
    expect(() => already.feedback.report()).toThrow(/after destroy\(\)/);
  });
});
