// @vitest-environment jsdom
// Example tests (roadmap 21.5, spec 08 §2 items F124-F125 and §6, ADR-0081) for
// dirty/touched tracking and the unsaved-changes guard.
//
// Two things get the most attention, and they are the two §6 named. The
// **dirty/touched split** is asserted against a baseline that MOVES — a field
// edited back to its original value stops being dirty while staying touched,
// which is the whole reason the two are separate questions. And the guard's
// teardown is asserted as a **leak test**: `beforeunload` is registered only
// while the form is dirty, and gone after `destroy()`, counted on a fake window
// rather than inferred (NFR-15).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createForm,
  createValidator,
  trackChanges,
} from '../../../../../main/javascript/it/d4np/utils/forms.js';

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
 * A window double that counts registrations, because "is `beforeunload`
 * attached?" has no other observable answer — the platform exposes no listener
 * registry, so a leak test needs a window it can interrogate.
 */
function fakeWindow() {
  /** @type {Map<string, Set<Function>>} */
  const handlers = new Map();
  return {
    /** @param {string} type @param {Function} handler */
    addEventListener(type, handler) {
      const set = handlers.get(type) ?? new Set();
      set.add(handler);
      handlers.set(type, set);
    },
    /** @param {string} type @param {Function} handler */
    removeEventListener(type, handler) {
      handlers.get(type)?.delete(handler);
    },
    /** @param {string} type @returns {number} */
    count(type) {
      return handlers.get(type)?.size ?? 0;
    },
    /** @param {string} type @returns {Function[]} */
    listeners(type) {
      return [...(handlers.get(type) ?? [])];
    },
  };
}

/**
 * @param {string} name
 * @returns {any}
 */
function control(name) {
  return root.querySelector(`[name=${name}]`);
}

/**
 * Type into a control the way a user does: set the value, then announce it.
 *
 * @param {string} name
 * @param {string} value
 */
function type(name, value) {
  const el = control(name);
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

beforeEach(() => {
  root = mount(`
    <input name="name" value="Ada" />
    <input name="email" value="a@b.c" />
    <input name="agree" type="checkbox" />
  `);
});

describe('F124 — dirty and touched are different questions', () => {
  it('starts clean and untouched, because the baseline is what was loaded', () => {
    const changes = trackChanges(createForm(root));
    expect(changes.state()).toEqual({
      dirty: false,
      touched: false,
      dirtyFields: [],
      touchedFields: [],
    });
    expect(Object.isFrozen(changes.state())).toBe(true);
  });

  it('an edit makes a field dirty and touched, and names it', () => {
    const changes = trackChanges(createForm(root));
    type('name', 'Grace');

    expect(changes.state()).toEqual({
      dirty: true,
      touched: true,
      dirtyFields: ['name'],
      touchedFields: ['name'],
    });
    expect(changes.isDirty('name')).toBe(true);
    expect(changes.isDirty('email')).toBe(false);
  });

  it('a field edited back to its baseline stops being dirty and stays touched', () => {
    // THE reason the two are separate questions: an undo is not a visit that
    // never happened, and a guard that warned here would be warning about
    // nothing.
    const changes = trackChanges(createForm(root));
    type('name', 'Grace');
    type('name', 'Ada');

    expect(changes.isDirty()).toBe(false);
    expect(changes.isTouched('name')).toBe(true);
    expect(changes.state().touchedFields).toEqual(['name']);
  });

  it('a visit that changed nothing is touched and not dirty', () => {
    const changes = trackChanges(createForm(root));
    control('email').dispatchEvent(new Event('focusout', { bubbles: true }));

    expect(changes.isTouched('email')).toBe(true);
    expect(changes.isDirty()).toBe(false);
  });

  it('reports the fields in field order, not in the order they were reached', () => {
    const changes = trackChanges(createForm(root));
    control('email').dispatchEvent(new Event('focusout', { bubbles: true }));
    type('name', 'Grace');

    expect(changes.state().touchedFields).toEqual(['name', 'email']);
  });

  it('notices a checkbox, which announces itself through `change` rather than `input`', () => {
    const changes = trackChanges(createForm(root));
    const box = control('agree');
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));

    expect(changes.state().dirtyFields).toEqual(['agree']);
  });

  it('ignores an event from something that is not a field', () => {
    root.insertAdjacentHTML('beforeend', '<input id="loose" />');
    const changes = trackChanges(createForm(root, { fields: { name: '[name=name]' } }));
    const seen = vi.fn();
    changes.on('change', seen);

    /** @type {any} */ (document.getElementById('loose')).dispatchEvent(
      new Event('input', { bubbles: true }),
    );

    expect(seen).not.toHaveBeenCalled();
    expect(changes.state().touched).toBe(false);
  });

  it('follows the baseline when it moves — a save makes the current values clean', () => {
    const form = createForm(root);
    const changes = trackChanges(form);
    type('name', 'Grace');
    expect(changes.isDirty()).toBe(true);

    form.setBaseline();

    // Derived, never stored: no refresh() is needed for a QUERY to be right.
    expect(changes.isDirty()).toBe(false);
    expect(changes.isTouched('name')).toBe(true);
  });

  it('is clean again after the form resets to its baseline', () => {
    const form = createForm(root);
    const changes = trackChanges(form);
    type('name', 'Grace');
    form.reset();
    expect(changes.isDirty()).toBe(false);
  });

  it('never calls a field dirty that the baseline does not mention', () => {
    // Exactly what `reset()` does with it: nothing. There is no value for it to
    // differ from, so "changed" is not a fact anyone can assert.
    const form = createForm(root);
    form.setBaseline({ name: 'Ada' });
    const changes = trackChanges(form);

    type('email', 'z@z.z');

    expect(changes.state().dirtyFields).toEqual([]);
    expect(changes.isTouched('email')).toBe(true);
  });

  it('compares array values element-wise, so a multi-select is not always dirty', () => {
    root = mount(`
      <select name="tags" multiple>
        <option value="a" selected>a</option>
        <option value="b">b</option>
      </select>
    `);
    const changes = trackChanges(createForm(root));
    expect(changes.isDirty()).toBe(false);

    const select = /** @type {any} */ (root.querySelector('select'));
    select.options[1].selected = true;
    select.dispatchEvent(new Event('change', { bubbles: true }));

    expect(changes.state().dirtyFields).toEqual(['tags']);
  });

  it('takes touch() and untouch() for one field or for all of them', () => {
    const changes = trackChanges(createForm(root));

    // What a blocked submit does: every error is allowed to show at once.
    changes.touch();
    expect(changes.state().touchedFields).toEqual(['name', 'email', 'agree']);

    changes.untouch('email');
    expect(changes.state().touchedFields).toEqual(['name', 'agree']);

    // What a successful save does, beside the form's own setBaseline().
    changes.untouch();
    expect(changes.isTouched()).toBe(false);

    changes.touch('email');
    expect(changes.state().touchedFields).toEqual(['email']);
  });

  it('publishes to subscribers only when the state actually moves', () => {
    const changes = trackChanges(createForm(root));
    const seen = vi.fn();
    const off = changes.on('change', seen);

    type('name', 'Grace');
    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen.mock.calls[0][0]).toEqual({
      dirty: true,
      touched: true,
      dirtyFields: ['name'],
      touchedFields: ['name'],
    });

    // Same value again: touched already true, dirty already true, nothing moved.
    type('name', 'Grace');
    expect(seen).toHaveBeenCalledTimes(1);

    type('name', 'Ada');
    expect(seen).toHaveBeenCalledTimes(2);
    expect(seen.mock.calls[1][0].dirty).toBe(false);

    off();
    type('name', 'Hopper');
    expect(seen).toHaveBeenCalledTimes(2);
  });

  it('marks touched only on the events touchOn names', () => {
    const changes = trackChanges(createForm(root), { touchOn: ['blur'] });

    type('name', 'Grace');
    expect(changes.isTouched('name')).toBe(false);
    // The edit is still seen — noticing one is this instance's job, and touchOn
    // decides only whether an edit also counts as a visit.
    expect(changes.isDirty('name')).toBe(true);

    control('name').dispatchEvent(new Event('focusout', { bubbles: true }));
    expect(changes.isTouched('name')).toBe(true);
  });

  it('attaches no focusout listener when blur is not a trigger', () => {
    const changes = trackChanges(createForm(root), { touchOn: ['input'] });
    control('name').dispatchEvent(new Event('focusout', { bubbles: true }));
    expect(changes.isTouched()).toBe(false);
  });
});

describe('F115 fires no events, so refresh() is the seam', () => {
  it('leaves the queries right and the event silent after a programmatic write', () => {
    const form = createForm(root);
    const changes = trackChanges(form);
    const seen = vi.fn();
    changes.on('change', seen);

    form.setValues({ name: 'Grace' });

    // The query recomputes, so it cannot be stale…
    expect(changes.isDirty()).toBe(true);
    // …but nothing announced the write, because F45 deliberately dispatches no
    // event and this library does not synthesise one.
    expect(seen).not.toHaveBeenCalled();

    const state = changes.refresh();
    expect(seen).toHaveBeenCalledTimes(1);
    expect(state.dirtyFields).toEqual(['name']);
  });

  it('refresh() is quiet when nothing moved', () => {
    const changes = trackChanges(createForm(root));
    const seen = vi.fn();
    changes.on('change', seen);
    changes.refresh();
    expect(seen).not.toHaveBeenCalled();
  });
});

describe('F125 — the unsaved-changes guard', () => {
  it('registers nothing at all without guard: true', () => {
    const view = fakeWindow();
    const changes = trackChanges(createForm(root), { window: view });
    type('name', 'Grace');
    expect(changes.isDirty()).toBe(true);
    expect(view.count('beforeunload')).toBe(0);
  });

  it('registers only while the form is dirty', () => {
    const view = fakeWindow();
    trackChanges(createForm(root), { guard: true, window: view });
    expect(view.count('beforeunload')).toBe(0);

    type('name', 'Grace');
    expect(view.count('beforeunload')).toBe(1);

    // Edited back: nothing to guard any more, and the registration goes with it
    // — which is what keeps a clean page eligible for the back/forward cache.
    type('name', 'Ada');
    expect(view.count('beforeunload')).toBe(0);
  });

  it('registers once, not once per keystroke', () => {
    const view = fakeWindow();
    trackChanges(createForm(root), { guard: true, window: view });
    type('name', 'G');
    type('name', 'Gr');
    type('name', 'Gra');
    expect(view.count('beforeunload')).toBe(1);
  });

  it('registers at construction when the form is already dirty', () => {
    // A record loaded through setValues between createForm and trackChanges is
    // exactly the case this guard exists for, and waiting for a keystroke to
    // notice would miss it.
    const form = createForm(root);
    form.setValues({ name: 'Grace' });
    const view = fakeWindow();
    trackChanges(form, { guard: true, window: view });
    expect(view.count('beforeunload')).toBe(1);
  });

  it('cancels the navigation the way the platform requires, and chooses no wording', () => {
    const view = fakeWindow();
    trackChanges(createForm(root), { guard: true, window: view });
    type('name', 'Grace');

    const event = { preventDefault: vi.fn(), returnValue: undefined };
    view.listeners('beforeunload')[0](event);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    // The empty string is what older engines need assigned; every current one
    // shows its own sentence regardless, which is the documented limit.
    expect(event.returnValue).toBe('');
  });

  it('detaches on destroy() — the leak test half of F125', () => {
    const view = fakeWindow();
    const changes = trackChanges(createForm(root), { guard: true, window: view });
    type('name', 'Grace');
    expect(view.count('beforeunload')).toBe(1);

    changes.destroy();

    expect(view.count('beforeunload')).toBe(0);
    // And the form listeners are gone too: a later edit changes nothing here.
    const seen = vi.fn();
    expect(() => changes.on('change', seen)).toThrow(/after destroy/);
  });

  it('detaches on an aborted signal, before or after construction', () => {
    const view = fakeWindow();
    const controller = new AbortController();
    const changes = trackChanges(createForm(root), {
      guard: true,
      window: view,
      signal: controller.signal,
    });
    type('name', 'Grace');
    expect(view.count('beforeunload')).toBe(1);

    controller.abort();
    expect(view.count('beforeunload')).toBe(0);
    expect(() => changes.refresh()).toThrow(/after destroy/);

    const already = new AbortController();
    already.abort();
    const second = trackChanges(createForm(root), { window: view, signal: already.signal });
    expect(() => second.touch()).toThrow(/after destroy/);
  });

  it('defaults to the form’s own realm rather than the ambient window', () => {
    // Not `globalThis`: a form inside an iframe or a second jsdom document must
    // guard the window it is actually in (NFR-14).
    const changes = trackChanges(createForm(root), { guard: true });
    expect(changes.element.ownerDocument.defaultView).toBe(window);
    type('name', 'Grace');
    changes.destroy();
  });

  it('names its contract when there is no window to register on', () => {
    const detached = new Document().createElement('form');
    detached.innerHTML = '<input name="a" value="1" />';
    expect(() => trackChanges(createForm(detached), { guard: true })).toThrow(
      /needs a window to register 'beforeunload' on/,
    );
    // …and works perfectly well there without the guard.
    expect(() => trackChanges(createForm(detached))).not.toThrow();
  });
});

describe('F125 — the in-app route change beforeunload cannot see', () => {
  it('says yes immediately for a clean form, and asks nobody', async () => {
    const confirm = vi.fn();
    const changes = trackChanges(createForm(root), { confirm });
    await expect(changes.confirmLeave()).resolves.toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('asks the injected question when the form is dirty, and answers with it', async () => {
    const confirm = vi.fn(() => Promise.resolve(true));
    const changes = trackChanges(createForm(root), { confirm });
    type('name', 'Grace');

    await expect(changes.confirmLeave()).resolves.toBe(true);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0]).toMatchObject({ dirty: true, dirtyFields: ['name'] });
  });

  it('takes a synchronous answer too', async () => {
    const changes = trackChanges(createForm(root), { confirm: () => false });
    type('name', 'Grace');
    await expect(changes.confirmLeave()).resolves.toBe(false);
  });

  it('says no when nobody was asked, because that is not consent', async () => {
    const changes = trackChanges(createForm(root));
    type('name', 'Grace');
    await expect(changes.confirmLeave()).resolves.toBe(false);
  });

  it('refuses an answer that is not yes or no', async () => {
    const changes = trackChanges(createForm(root), { confirm: () => /** @type {any} */ ('yes') });
    type('name', 'Grace');
    await expect(changes.confirmLeave()).rejects.toThrow(
      'trackChanges: options.confirm must answer true or false',
    );
  });
});

describe('the option contract (ADR-0047) and the lifecycle contract (ADR-0049)', () => {
  it('refuses a form that is not one', () => {
    for (const value of [null, 'nope', {}, { getValues: () => ({}) }]) {
      expect(() => trackChanges(/** @type {any} */ (value))).toThrow(
        'trackChanges: form must be a createForm instance',
      );
    }
  });

  it('refuses an unknown option key, naming it', () => {
    expect(() => trackChanges(createForm(root), /** @type {any} */ ({ guarded: true }))).toThrow(
      "trackChanges: unknown option 'guarded'",
    );
  });

  it.each([
    ['options that are not an object', 'nope', /options must be a plain object/],
    ['a non-array touchOn', { touchOn: 'blur' }, /options.touchOn must be an array/],
    ['an unknown trigger', { touchOn: ['submit'] }, /contains 'submit'/],
    ['a non-boolean guard', { guard: 'yes' }, /options.guard must be a boolean/],
    ['a non-function confirm', { confirm: true }, /options.confirm must be a function/],
    ['a signal that is not one', { signal: {} }, /options.signal must be an AbortSignal/],
  ])('refuses %s', (_label, options, message) => {
    expect(() => trackChanges(createForm(root), /** @type {any} */ (options))).toThrow(message);
  });

  it.each([
    ['isDirty', (/** @type {any} */ c) => c.isDirty('nope')],
    ['isTouched', (/** @type {any} */ c) => c.isTouched('nope')],
    ['touch', (/** @type {any} */ c) => c.touch('nope')],
    ['untouch', (/** @type {any} */ c) => c.untouch('nope')],
  ])('refuses a field %s does not have', (name, act) => {
    const changes = trackChanges(createForm(root));
    expect(() => act(changes)).toThrow(`trackChanges: ${name} names no such field 'nope'`);
  });

  it('throws on a command after destroy() and answers a query', async () => {
    const changes = trackChanges(createForm(root));
    type('name', 'Grace');
    changes.destroy();

    expect(() => changes.touch()).toThrow('trackChanges: touch() was called after destroy()');
    expect(() => changes.untouch()).toThrow(/after destroy/);
    expect(() => changes.refresh()).toThrow(/after destroy/);
    expect(() => changes.on('change', () => {})).toThrow(/after destroy/);
    await expect(changes.confirmLeave()).rejects.toThrow(/after destroy/);

    // Queries still answer, and answer TRUTHFULLY: the values still differ from
    // the baseline, which is a fact about the form rather than about this.
    expect(changes.isDirty()).toBe(true);
    expect(changes.state().dirtyFields).toEqual(['name']);
    expect(changes.isTouched('name')).toBe(true);
    expect(changes.element).toBe(root);
    expect(() => changes.destroy()).not.toThrow();
  });

  it('refuses an event it does not have and a handler that is not a function', () => {
    const changes = trackChanges(createForm(root));
    expect(() => changes.on(/** @type {any} */ ('dirty'), () => {})).toThrow(
      "trackChanges: on() takes 'change' — got 'dirty'",
    );
    expect(() => changes.on('change', /** @type {any} */ (7))).toThrow(
      'trackChanges: on() handler must be a function',
    );
  });

  it('unsubscribes idempotently, and a subscriber that unsubscribes mid-dispatch is safe', () => {
    const changes = trackChanges(createForm(root));
    const second = vi.fn();
    const off = changes.on('change', () => {
      off();
      offSecond();
    });
    const offSecond = changes.on('change', second);

    type('name', 'Grace');
    expect(second).toHaveBeenCalledTimes(1);

    type('name', 'Hopper');
    expect(second).toHaveBeenCalledTimes(1);
    expect(() => off()).not.toThrow();
  });
});

describe('NFR-41 — two forms on one page observe nothing of each other', () => {
  it('keeps baselines, dirty flags and guards separate', () => {
    document.body.innerHTML = `
      <form id="filter"><input name="q" value="ada" /></form>
      <form id="edit"><input name="name" value="Ada" /></form>
    `;
    const filterRoot = /** @type {Element} */ (document.getElementById('filter'));
    const editRoot = /** @type {Element} */ (document.getElementById('edit'));
    const view = fakeWindow();

    const filter = trackChanges(createForm(filterRoot), { guard: true, window: view });
    const edit = trackChanges(createForm(editRoot), { guard: true, window: view });

    const q = /** @type {any} */ (filterRoot.querySelector('[name=q]'));
    q.value = 'grace';
    q.dispatchEvent(new Event('input', { bubbles: true }));

    expect(filter.isDirty()).toBe(true);
    expect(edit.isDirty()).toBe(false);
    expect(view.count('beforeunload')).toBe(1);

    const name = /** @type {any} */ (editRoot.querySelector('[name=name]'));
    name.value = 'Hopper';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    expect(view.count('beforeunload')).toBe(2);

    // One teardown leaves the other's registration standing.
    filter.destroy();
    expect(view.count('beforeunload')).toBe(1);
    expect(edit.isDirty()).toBe(true);
    edit.destroy();
    expect(view.count('beforeunload')).toBe(0);
  });
});

describe('the family composes (ADR-0077)', () => {
  it('answers touched beside a validator’s findings, which is F124’s reason for existing', async () => {
    const form = createForm(root);
    const validator = createValidator(form, {
      native: false,
      rules: { email: (value) => (String(value).endsWith('.com') ? undefined : 'Not an address') },
    });
    const changes = trackChanges(form);

    await validator.validate();

    // The finding exists, and the field has not been reached: "do not show me an
    // error for a field I have not filled in yet" is a question about TOUCHED,
    // and the validator has no opinion on it.
    expect(validator.result().fields.email[0].message).toBe('Not an address');
    expect(changes.isTouched('email')).toBe(false);

    type('email', 'still-wrong');
    expect(changes.isTouched('email')).toBe(true);
  });
});
