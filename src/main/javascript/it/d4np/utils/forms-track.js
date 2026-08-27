/**
 * egl-utils-js/forms — dirty, touched, and the unsaved-changes guard
 * (spec 08 §2 items F124-F125).
 *
 * The fifth and last member of the ADR-0077 family, and the one that answers two
 * questions applications routinely collapse into one boolean.
 *
 * **Dirty is not touched.** *Dirty* is "this differs from the F115 baseline";
 * *touched* is "the user has been in here". They are different because the two
 * useful behaviours want different ones: an unsaved-changes guard wants dirty —
 * a field the user visited and left exactly as they found it is nothing to warn
 * about — while "do not show me an error for a field I have not filled in yet"
 * wants touched, and a field that is still empty is not dirty at all.
 *
 * **Dirty is derived, never stored.** The baseline moves — `setBaseline()` after
 * a save, `reset()` back to it — so a cached flag would be one `setBaseline`
 * away from lying. Every query here recomputes from the form, which is why none
 * of them can be stale.
 *
 * **What this cannot hear, it says so about.** `setValues` deliberately fires no
 * events (F115: a programmatic write is not a user edit), so a value written in
 * code is invisible to any listener. The queries are unaffected — they recompute
 * — but the `'change'` event and the `beforeunload` registration are driven by
 * what this can observe, so a programmatic write is followed by `refresh()`.
 * That seam is the honest consequence of F115's decision rather than a gap: the
 * alternative is a library that synthesises events, and F45 refused that for
 * reasons that have not changed.
 *
 * **The guard is opt-in, and attached only while it has something to guard.**
 * A `beforeunload` listener is a *window*-level registration, and in every
 * current engine having one costs the page its back/forward-cache eligibility.
 * So `trackChanges` attaches its own form-scoped listeners because that is its
 * job, and touches the window only when asked for `guard: true` — and even then
 * only while the form is actually dirty (F125, NFR-40).
 *
 * @module egl-utils-js/forms
 */

import { DomContractError } from './errors.js';
import { controllerFor, isAbortSignal, isElement } from './dom-helpers.js';
import { fieldOf } from './forms-values.js';
import { assertAlive } from './lifecycle.js';
import { assertNoUnknownOptions } from './option-keys.js';

/** What a caller may put in `touchOn`. `blur` is observed as `focusout` (F118's lesson). */
const TOUCH_EVENTS = /* @__PURE__ */ new Set(['input', 'change', 'blur']);

/**
 * @param {unknown} value
 * @param {string} name
 * @returns {void}
 */
function assertPlainObject(value, name) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`trackChanges: ${name} must be a plain object`);
  }
}

/**
 * Whether two field values are the same value.
 *
 * `Object.is` on the leaves, element-wise on arrays — which is the whole shape
 * space F112-F115 admits: `null`, a boolean, a string, a `string[]` (checkbox
 * group, multiple select, repeated name) or a `File[]`. A `File` compares by
 * identity on purpose: two different files with the same name are two different
 * files, and the platform gives no cheaper truth than that.
 *
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
function sameValue(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((entry, index) => Object.is(entry, b[index]));
  }
  return Object.is(a, b);
}

/**
 * @param {ChangeState} a
 * @param {ChangeState} b
 * @returns {boolean}
 */
function sameState(a, b) {
  return (
    a.dirty === b.dirty &&
    a.touched === b.touched &&
    a.dirtyFields.length === b.dirtyFields.length &&
    a.touchedFields.length === b.touchedFields.length &&
    a.dirtyFields.every((name, index) => name === b.dirtyFields[index]) &&
    a.touchedFields.every((name, index) => name === b.touchedFields[index])
  );
}

/**
 * @typedef {object} ChangeState
 * @property {boolean} dirty - Any field differs from the baseline.
 * @property {boolean} touched - The user has been in any field.
 * @property {readonly string[]} dirtyFields - Which ones differ, in field order.
 * @property {readonly string[]} touchedFields - Which ones were reached, in field
 *   order — not in the order they were reached, because a set of names is what
 *   every caller of this actually wants.
 */

/**
 * @typedef {object} TrackChangesOptions
 * @property {readonly ('input' | 'change' | 'blur')[]} [touchOn=['input','change','blur']] -
 *   What marks a field touched. `blur` is observed as `focusout`, the bubbling
 *   half of the same moment. The default is "the user typed in it, changed it,
 *   or visited and left it" — pass `['blur']` alone for the stricter reading
 *   most form libraries use.
 * @property {boolean} [guard=false] - Register `beforeunload` while the form is
 *   dirty, so the browser asks before the page is closed or navigated away from.
 *   Opt-in because it is a **window**-level registration with a cost this
 *   instance cannot see (F125).
 * @property {(state: ChangeState) => boolean | Promise<boolean>} [confirm] - Asked
 *   by `confirmLeave()` when the form is dirty, and never when it is clean. This
 *   is where an F101 dialog goes.
 * @property {{ addEventListener: Function, removeEventListener: Function }} [window] -
 *   The window to register the guard on. Defaults to the form's own realm
 *   (`ownerDocument.defaultView`), so an iframe or a jsdom document guards
 *   itself; injectable for the same reason every DOM option in this library is
 *   (NFR-14). Only consulted when `guard` is `true`.
 * @property {AbortSignal} [signal] - Destroys the tracker when aborted (NFR-15).
 */

/**
 * @typedef {object} TrackChangesInstance
 * @property {import('./forms-values.js').FormInstance} form - The form this reads.
 * @property {Element} element - The root it listens on.
 * @property {() => ChangeState} state - The whole answer, recomputed.
 * @property {(name?: string) => boolean} isDirty - For one field, or the form.
 * @property {(name?: string) => boolean} isTouched - For one field, or the form.
 * @property {(name?: string) => void} touch - Mark one field, or every field,
 *   touched — what a blocked submit does so every error is allowed to show.
 * @property {(name?: string) => void} untouch - The exact inverse: what a
 *   successful save does, beside the form's own `setBaseline()`.
 * @property {() => ChangeState} refresh - Recompute and reconcile: publish a
 *   `'change'` if the state moved, and attach or detach the guard. Call it after
 *   a programmatic `setValues`, `setBaseline` or `reset`, which fire no events.
 * @property {() => Promise<boolean>} confirmLeave - May the application navigate
 *   away? `true` immediately when the form is clean.
 * @property {(event: 'change', handler: (state: ChangeState) => void) => () => void} on
 *   Subscribe to state changes; returns an idempotent unsubscribe.
 * @property {() => void} destroy - Idempotent teardown, which **detaches the
 *   `beforeunload` registration** — the half of F125 that is a leak test rather
 *   than a behaviour test.
 */

/**
 * Track what the user changed and what they merely visited, and guard the
 * unsaved half (spec 08 F124-F125).
 *
 * **The browser's own dialog is not ours to write.** Every engine shows its own
 * generic wording for `beforeunload` and ignores any string a page supplies;
 * several also refuse to show it at all unless the user has interacted with the
 * page. The guard is therefore **best-effort by the platform's design**, which is
 * exactly why `confirmLeave()` exists beside it: an in-app route change is
 * invisible to `beforeunload`, and it is the case where a real question can be
 * asked in your own words.
 *
 * @example
 * const form = createForm(root);
 * const changes = trackChanges(form, { guard: true });
 *
 * // Only show a field's error once the user has actually been in it:
 * bindFormFeedback(validator, { … });
 * validator.on('change', () => saveButton.disabled = !changes.isDirty());
 *
 * @example
 * // The in-app route change `beforeunload` cannot see, asked in your own words:
 * const changes = trackChanges(form, {
 *   guard: true,
 *   confirm: ({ dirtyFields }) =>
 *     dialogs.confirm(`Discard ${dirtyFields.length} unsaved change(s)?`),
 * });
 *
 * router.beforeEach(async () => await changes.confirmLeave());
 *
 * @example
 * // After a save: the new values are the clean ones, and nothing is touched.
 * await api.put(url, form.toJSON());
 * form.setBaseline();
 * changes.untouch();
 * changes.refresh(); // setBaseline fires no events — this is the seam (F115)
 *
 * @param {import('./forms-values.js').FormInstance} form - The form to track.
 * @param {TrackChangesOptions} [options]
 * @returns {TrackChangesInstance}
 * @throws {TypeError} On a malformed option, or a `touchOn` entry that is not
 *   `'input'`, `'change'` or `'blur'`.
 * @throws {DomContractError} With `guard: true` and no window to register on —
 *   this names its contract rather than failing on an undefined read (ADR-0028).
 */
export function trackChanges(form, options = {}) {
  const api = 'trackChanges';
  if (
    form === null ||
    typeof form !== 'object' ||
    typeof (/** @type {any} */ (form).baseline) !== 'function' ||
    typeof (/** @type {any} */ (form).getValues) !== 'function' ||
    !isElement(/** @type {any} */ (form).element)
  ) {
    throw new TypeError(`${api}: form must be a createForm instance`);
  }
  assertPlainObject(options, 'options');
  const {
    touchOn = ['input', 'change', 'blur'],
    guard = false,
    confirm,
    window: injectedWindow,
    signal,
    ...unknown
  } = options;
  assertNoUnknownOptions(unknown, api);
  if (!Array.isArray(touchOn)) {
    throw new TypeError(`${api}: options.touchOn must be an array of 'input', 'change' or 'blur'`);
  }
  for (const trigger of touchOn) {
    if (!TOUCH_EVENTS.has(trigger)) {
      throw new TypeError(
        `${api}: options.touchOn contains '${String(trigger)}' — expected 'input', 'change' or 'blur'`,
      );
    }
  }
  if (typeof guard !== 'boolean') throw new TypeError(`${api}: options.guard must be a boolean`);
  if (confirm !== undefined && typeof confirm !== 'function') {
    throw new TypeError(`${api}: options.confirm must be a function`);
  }
  if (signal !== undefined && !isAbortSignal(signal)) {
    throw new TypeError(`${api}: options.signal must be an AbortSignal`);
  }

  const root = form.element;
  const fieldSet = form.fields;
  const names = Object.keys(fieldSet);
  const marks = new Set(touchOn);

  /** @type {any} */
  const view = guard ? (injectedWindow ?? root.ownerDocument?.defaultView) : undefined;
  if (
    guard &&
    (view === null ||
      view === undefined ||
      typeof view.addEventListener !== 'function' ||
      typeof view.removeEventListener !== 'function')
  ) {
    throw new DomContractError(
      `${api}: options.guard needs a window to register 'beforeunload' on — pass options.window on a server or in a detached document`,
    );
  }

  /** @type {Set<string>} */
  const touchedNames = new Set();
  /** @type {Set<(state: ChangeState) => void>} */
  const listeners = new Set();
  let destroyed = false;
  let guarding = false;

  /** @returns {string[]} */
  function dirtyNames() {
    const baseline = form.baseline();
    const values = form.getValues();
    // A field the baseline does not mention is never dirty, for the same reason
    // `reset()` leaves it alone: there is nothing for it to differ FROM. That
    // happens when a caller adopted a partial baseline, and treating "absent" as
    // "changed" would make such a form permanently unsaveable-looking.
    return names.filter(
      (name) => Object.hasOwn(baseline, name) && !sameValue(values[name], baseline[name]),
    );
  }

  /** @returns {ChangeState} */
  function derive() {
    const dirtyFields = dirtyNames();
    // Field order rather than the order they were reached: a caller asking
    // "which fields" wants a set, and a stable order makes the state comparable
    // between two derivations, which is what decides whether to publish.
    const touchedFields = names.filter((name) => touchedNames.has(name));
    return Object.freeze({
      dirty: dirtyFields.length > 0,
      touched: touchedFields.length > 0,
      dirtyFields: Object.freeze(dirtyFields),
      touchedFields: Object.freeze(touchedFields),
    });
  }

  let current = derive();

  /**
   * The `beforeunload` handler. Nothing here chooses the wording: `returnValue`
   * carries the empty string because engines that predate the modern spec need
   * *something* assigned, and every current one shows its own sentence whatever
   * is in it.
   *
   * @param {Event} event
   * @returns {void}
   */
  function onBeforeUnload(event) {
    event.preventDefault();
    // Cast, because the DOM lib types the LEGACY `Event.returnValue` as a
    // boolean while a `BeforeUnloadEvent`'s is a string. Both are the same slot
    // at run time and the string is what engines that still read it expect.
    /** @type {any} */ (event).returnValue = '';
  }

  /**
   * @param {boolean} wanted
   * @returns {void}
   */
  function setGuard(wanted) {
    if (wanted === guarding) return;
    guarding = wanted;
    if (wanted) view.addEventListener('beforeunload', onBeforeUnload);
    // Detached explicitly rather than through an internal AbortController: the
    // controller would come from this document's realm and the listener lives on
    // its window, which is the BUG-0003 cross-realm trap (ADR-0045, and the same
    // reasoning `bindTableHistory` records for `popstate`).
    else view.removeEventListener('beforeunload', onBeforeUnload);
  }

  /** @returns {ChangeState} */
  function sync() {
    const next = derive();
    const moved = !sameState(current, next);
    current = next;
    if (guard) setGuard(next.dirty);
    if (moved) {
      // A copy: a subscriber that unsubscribes during dispatch must not reindex
      // the set being iterated.
      for (const handler of [...listeners]) handler(current);
    }
    return current;
  }

  /**
   * @param {string} name
   * @param {string} method - The one refusing it, for the message.
   * @returns {void}
   */
  function assertField(name, method) {
    if (typeof name !== 'string' || !Object.hasOwn(fieldSet, name)) {
      throw new TypeError(`${api}: ${method} names no such field '${String(name)}'`);
    }
  }

  /** @type {TrackChangesInstance} */
  const instance = {
    form,
    element: root,

    state() {
      // Recomputed rather than returned from the cache: the baseline can move
      // under this instance (`setBaseline`), and a query that can be stale is the
      // defect this library refuses everywhere else (ADR-0028).
      return derive();
    },

    isDirty(name) {
      if (name === undefined) return derive().dirty;
      assertField(name, 'isDirty');
      return dirtyNames().includes(name);
    },

    isTouched(name) {
      if (name === undefined) return touchedNames.size > 0;
      assertField(name, 'isTouched');
      return touchedNames.has(name);
    },

    touch(name) {
      assertAlive(destroyed, api, 'touch');
      if (name === undefined) for (const field of names) touchedNames.add(field);
      else {
        assertField(name, 'touch');
        touchedNames.add(name);
      }
      sync();
    },

    untouch(name) {
      assertAlive(destroyed, api, 'untouch');
      if (name === undefined) touchedNames.clear();
      else {
        assertField(name, 'untouch');
        touchedNames.delete(name);
      }
      sync();
    },

    refresh() {
      assertAlive(destroyed, api, 'refresh');
      return sync();
    },

    async confirmLeave() {
      assertAlive(destroyed, api, 'confirmLeave');
      const state = derive();
      // A clean form asks nothing. Putting a dialog in front of a user who
      // changed nothing is how a guard gets disabled by the people it protects.
      if (!state.dirty) return true;
      // No `confirm` injected means nobody was asked, and "nobody was asked" is
      // not consent: the answer is no, and an F101 dialog is one option away.
      if (confirm === undefined) return false;
      const answer = await confirm(state);
      if (typeof answer !== 'boolean') {
        throw new TypeError(`${api}: options.confirm must answer true or false`);
      }
      return answer;
    },

    on(event, handler) {
      assertAlive(destroyed, api, 'on');
      if (event !== 'change') {
        throw new TypeError(`${api}: on() takes 'change' — got '${String(event)}'`);
      }
      if (typeof handler !== 'function') {
        throw new TypeError(`${api}: on() handler must be a function`);
      }
      listeners.add(handler);
      return () => {
        listeners.delete(handler);
      };
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      domController.abort();
      if (guard) setGuard(false);
      listeners.clear();
      if (signal !== undefined) signal.removeEventListener('abort', onAbort);
    },
  };

  /** @returns {void} */
  function onAbort() {
    instance.destroy();
  }

  /**
   * @param {Event} event
   * @param {boolean} marksTouched
   * @returns {void}
   */
  function observe(event, marksTouched) {
    const name = fieldOf(fieldSet, event.target);
    if (name === null) return;
    if (marksTouched) touchedNames.add(name);
    sync();
  }

  const domController = controllerFor(root);
  const listenerOptions = { signal: domController.signal };
  // `input` and `change` are attached unconditionally: noticing an edit is this
  // instance's whole job, and `touchOn` decides only whether an edit also counts
  // as a touch. `focusout` is attached solely for `blur`, because a visit that
  // changed nothing has nothing to tell the dirty half.
  root.addEventListener('input', (event) => observe(event, marks.has('input')), listenerOptions);
  root.addEventListener('change', (event) => observe(event, marks.has('change')), listenerOptions);
  if (marks.has('blur')) {
    root.addEventListener('focusout', (event) => observe(event, true), listenerOptions);
  }

  // A form can already be dirty the moment this is constructed — `createForm`
  // took its baseline earlier, and a record loaded through `setValues` between
  // the two is exactly the case F125 exists for. So the guard is reconciled once
  // here rather than waiting for the first keystroke to notice.
  if (guard) setGuard(current.dirty);

  if (signal !== undefined) {
    if (signal.aborted) instance.destroy();
    else signal.addEventListener('abort', onAbort);
  }

  return instance;
}
