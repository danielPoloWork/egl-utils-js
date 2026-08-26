/**
 * egl-utils-js — event delegation and native element setters
 * (spec 03 §2 items F44-F45).
 *
 * Both halves exist to remove a habit rather than to wrap an API. `delegate`
 * replaces the rebind-after-every-render cycle with one listener that outlives
 * the nodes it serves; the setters replace a per-property `if (el)` guard at
 * every call site with a no-op on `null`.
 *
 * Neither needs the ambient document: they act on the node they are given, so
 * they work inside a server-side DOM implementation (spec 03 NFR-14, as amended
 * in 11.2). What they do need is an `AbortSignal` story, because a listener
 * without teardown is a leak — see {@link delegate} and NFR-15.
 *
 * @module egl-utils-js/dom
 */

import { controllerFor, isAbortSignal, isElement } from './dom-helpers.js';
import { assertNoUnknownOptions } from './option-keys.js';

/**
 * True for anything that can host a delegated listener and answer
 * `contains()` — an `Element`, a `Document`, or a `DocumentFragment`.
 *
 * Structural, for the cross-realm reason `isElement` is (ADR-0028): a root from
 * an iframe or a second jsdom realm is perfectly usable and fails `instanceof`.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isListenerRoot(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (/** @type {{ addEventListener?: unknown }} */ (value).addEventListener) ===
      'function' &&
    typeof (/** @type {{ contains?: unknown }} */ (value).contains) === 'function'
  );
}

/**
 * @typedef {object} DelegateOptions
 * @property {AbortSignal} [signal] - Detaches the listener when aborted, in
 *   addition to the returned function. An already-aborted signal means nothing
 *   is ever attached.
 * @property {boolean} [capture=false] - Listen during the capture phase.
 *   Needed for event types that do not bubble at all (`focus`, `blur`), since
 *   delegation depends on the event reaching `root`.
 */

/**
 * Attach one listener that serves every current and future descendant matching
 * `selector` (spec 03 F44).
 *
 * The alternative — binding each row after each render — costs a listener per
 * row per render and, worse, needs a teardown pass that is easy to forget and
 * invisible when missed. One delegated listener survives any number of
 * re-renders: nodes come and go beneath it and nothing needs rebinding.
 *
 * `handler(event, matchedElement)` receives the **matched** element, not
 * `event.target`, which is the deeper node that was actually clicked (an icon
 * inside a button, a `<span>` inside a row). That second argument is the one
 * callers want and the one a hand-rolled `closest` call usually forgets.
 *
 * Matching is `event.target.closest(selector)`, then a `root.contains(match)`
 * check — because `closest` walks past `root` to the document and would
 * otherwise match an ancestor outside the delegated subtree.
 *
 * Teardown is structural: the listener is registered with an internal
 * `AbortController`'s signal, so unsubscribing is one `abort()` — idempotent by
 * construction, with nothing to forget and no handler reference to retain.
 *
 * @example
 * // One listener for a table that re-renders on every filter keystroke:
 * const off = delegate(tbody, 'click', 'tr[data-id]', (event, row) => {
 *   openRecord(row.dataset.id); // `row`, not event.target — which may be a cell
 * });
 * off(); // detach; calling it again is a no-op
 *
 * @example
 * // Tie the listener's life to a component's signal instead:
 * delegate(root, 'click', '[data-action="delete"]', onDelete, { signal });
 *
 * @example
 * // `focus` does not bubble, so delegation needs the capture phase:
 * delegate(form, 'focus', 'input', highlight, { capture: true });
 *
 * @param {Element | Document | DocumentFragment} root - The node the listener is
 *   attached to. Must be an ancestor of the elements to match.
 * @param {string} type - Event type, e.g. `'click'`.
 * @param {string} selector - CSS selector the event's target must match, or be
 *   contained by.
 * @param {(event: Event, matchedElement: Element) => void} handler - Called with
 *   the event and the matched element.
 * @param {DelegateOptions} [options]
 * @returns {() => void} Idempotent unsubscribe.
 * @throws {TypeError} If `root` cannot host a listener, if `type` or `selector`
 *   is not a non-empty string, if `handler` is not a function, or if `signal` is
 *   not an `AbortSignal`.
 */
export function delegate(root, type, selector, handler, options = {}) {
  if (!isListenerRoot(root)) {
    throw new TypeError('root must be an Element, Document, or DocumentFragment');
  }
  assertNonEmptyString(type, 'type');
  assertNonEmptyString(selector, 'selector');
  if (typeof handler !== 'function') {
    throw new TypeError('handler must be a function');
  }
  const { signal, capture = false, ...unknown } = options;
  assertNoUnknownOptions(unknown, 'delegate');
  if (signal !== undefined && !isAbortSignal(signal)) {
    throw new TypeError('options.signal must be an AbortSignal');
  }

  const controller = controllerFor(root);
  const detach = () => controller.abort();

  // An already-aborted caller signal means the subscription is over before it
  // begins — attaching and immediately removing would be observable as one
  // spurious registration.
  if (signal?.aborted === true) return detach;

  root.addEventListener(
    type,
    (event) => {
      const target = event.target;
      // `event.target` is not always an element: it can be the document, a text
      // node in some engines, or null for a synthetic event.
      if (!isElement(target)) return;
      const match = /** @type {Element} */ (target).closest(selector);
      // `closest` climbs past `root` to the document root, so a match above the
      // delegated subtree has to be rejected explicitly.
      if (match === null || !root.contains(match)) return;
      handler(event, match);
    },
    { capture, signal: controller.signal },
  );

  signal?.addEventListener('abort', detach, { once: true, signal: controller.signal });

  return detach;
}

/**
 * @param {unknown} value
 * @param {string} name
 * @returns {asserts value is string}
 */
function assertNonEmptyString(value, name) {
  if (typeof value !== 'string' || value === '') {
    throw new TypeError(`${name} must be a non-empty string`);
  }
}

/**
 * Reject a non-element target, and report whether there is anything to act on.
 *
 * `null` and `undefined` are deliberately accepted: an optional element that is
 * absent is a normal state, and making every caller write `if (el)` around a
 * setter is how those guards get forgotten. A *wrong type* is still a
 * programmer error.
 *
 * @param {unknown} el
 * @param {string} api
 * @returns {boolean} True when `el` is an element to act on.
 * @throws {TypeError} If `el` is neither an element nor nullish.
 */
function actionable(el, api) {
  if (el === null || el === undefined) return false;
  if (!isElement(el)) {
    throw new TypeError(`${api}: first argument must be an Element or null`);
  }
  return true;
}

/**
 * Enable or disable a control (spec 03 F45).
 *
 * Sets the `disabled` **property** where the element has one — every form
 * control does — because the property is what the browser consults. For any
 * other element (a `div` acting as a button, a custom element) the `disabled`
 * **attribute** is toggled instead: the property would be an inert expando,
 * while the attribute is at least observable by CSS and by a custom element's
 * `attributeChangedCallback`.
 *
 * @example
 * setEnabled(elements.submit, form.checkValidity());
 * setEnabled(elements.maybeMissing, true); // no-op when null, no guard needed
 *
 * @param {Element | null | undefined} el - The control, or nullish for a no-op.
 * @param {boolean} enabled - `true` enables, `false` disables.
 * @returns {void}
 * @throws {TypeError} If `el` is neither an element nor nullish, or `enabled` is
 *   not a boolean.
 */
export function setEnabled(el, enabled) {
  if (typeof enabled !== 'boolean') {
    throw new TypeError('setEnabled: enabled must be a boolean');
  }
  if (!actionable(el, 'setEnabled')) return;
  const element = /** @type {Element & { disabled?: boolean }} */ (el);
  if ('disabled' in element) {
    element.disabled = !enabled;
  } else {
    element.toggleAttribute('disabled', !enabled);
  }
}

/**
 * @typedef {object} SetVisibleOptions
 * @property {string} [hiddenClass] - Toggle this class **instead of** the
 *   `hidden` attribute, for CSS frameworks that hide through a class.
 */

/**
 * Show or hide an element (spec 03 F45).
 *
 * Drives the `hidden` attribute by default — the platform's own mechanism,
 * which needs no stylesheet. With `hiddenClass` the class is toggled *instead*,
 * never in addition: driving both would leave an element that one mechanism
 * hides and the other shows, and whichever wins depends on CSS specificity.
 *
 * Symmetric by construction: `setVisible(el, false)` and `setVisible(el, true)`
 * touch exactly the same one thing, so they always undo each other. (A common
 * hand-rolled pair does not — a `show` that clears two mechanisms and a `hide`
 * that sets one leaves the element stuck after the wrong sequence.)
 *
 * @example
 * setVisible(elements.spinner, isLoading);
 * setVisible(elements.panel, false, { hiddenClass: 'is-hidden' });
 *
 * @param {Element | null | undefined} el - The element, or nullish for a no-op.
 * @param {boolean} visible - `true` shows, `false` hides.
 * @param {SetVisibleOptions} [options]
 * @returns {void}
 * @throws {TypeError} If `el` is neither an element nor nullish, if `visible` is
 *   not a boolean, or if `hiddenClass` is not a non-empty string.
 */
export function setVisible(el, visible, options = {}) {
  if (typeof visible !== 'boolean') {
    throw new TypeError('setVisible: visible must be a boolean');
  }
  const { hiddenClass, ...unknown } = options;
  assertNoUnknownOptions(unknown, 'setVisible');
  if (hiddenClass !== undefined) assertNonEmptyString(hiddenClass, 'options.hiddenClass');
  if (!actionable(el, 'setVisible')) return;

  const element = /** @type {Element & { hidden?: boolean }} */ (el);
  if (hiddenClass === undefined) {
    element.hidden = !visible;
  } else {
    element.classList.toggle(hiddenClass, !visible);
  }
}

/**
 * Set a form control's value (spec 03 F45).
 *
 * One function for the four shapes a "value" takes in HTML, so a caller does
 * not branch on element type: a checkbox or radio takes `checked`, a `select`
 * selects the matching option (or an array of them when `multiple`), and
 * everything else takes `value`. `null`/`undefined` clears rather than writing
 * the string `"null"`.
 *
 * **No event is dispatched.** A programmatic assignment fires no `input` or
 * `change` natively, and quietly synthesising one here would make this function
 * behave unlike the assignment it replaces — including re-entering the very
 * handler that called it. Dispatch explicitly if a listener must run:
 * `el.dispatchEvent(new Event('input', { bubbles: true }))`.
 *
 * @example
 * setValue(elements.name, record.name);
 * setValue(elements.subscribed, true); // a checkbox
 * setValue(elements.country, 'IT'); // selects that option; unknown value clears
 * setValue(elements.tags, ['a', 'b']); // a multiple select
 * setValue(elements.name, null); // clears
 *
 * @param {Element | null | undefined} el - The control, or nullish for a no-op.
 * @param {unknown} value - The value; arrays apply to a `multiple` select,
 *   booleans to a checkbox or radio, nullish clears.
 * @returns {void}
 * @throws {TypeError} If `el` is neither an element nor nullish.
 */
export function setValue(el, value) {
  if (!actionable(el, 'setValue')) return;
  const element = /** @type {any} */ (el);

  if (element.type === 'checkbox' || element.type === 'radio') {
    element.checked = Boolean(value);
    return;
  }

  if (typeof element.selectedIndex === 'number' && element.options !== undefined) {
    const wanted = Array.isArray(value)
      ? new Set(value.map((entry) => String(entry)))
      : new Set(value === null || value === undefined ? [] : [String(value)]);
    for (const option of element.options) {
      option.selected = wanted.has(option.value);
    }
    // Nothing matched: leave no phantom selection. Assigning -1 is how a select
    // is cleared; a plain `value = ''` would silently select a blank option if
    // one happened to exist.
    if (element.selectedIndex >= 0 && !wanted.has(element.value)) {
      element.selectedIndex = -1;
    }
    return;
  }

  element.value = value === null || value === undefined ? '' : String(value);
}

/**
 * Read a form control's value — the half {@link setValue} never had
 * (spec 08 F113).
 *
 * `setValue` has existed since spec 03 and reading was left to the caller, so
 * every application wrote the same loop over `form.elements` and got the same
 * four things wrong: an unchecked checkbox reported as `undefined` rather than
 * `false`, an empty `type="number"` reported as the string `''`, a `multiple`
 * select reported as one value, and a `select` with nothing selected reported as
 * `''` — indistinguishable from an option whose value *is* the empty string.
 *
 * **Reading needs a policy, and this is it** — stated rather than implied,
 * because the alternative is every caller inventing one:
 *
 * | Control | Value |
 * |---|---|
 * | checkbox, radio | `boolean` — the `checked` state |
 * | `select` | the selected option's value, or `null` when nothing is selected |
 * | `select[multiple]` | `string[]` of the selected values, `[]` when none are |
 * | `type="number"`, `type="range"` | `number`, or `null` when the field is empty |
 * | `type="file"` | `File[]`, `[]` when nothing is chosen |
 * | anything else | the `value` string |
 *
 * Two of those are the whole point. **An empty number is `null`, never `NaN`**:
 * `Number('')` is `0`, `parseInt('')` is `NaN`, and both are lies about a field
 * the user left alone. And **an unselected `select` is `null`**, which a bare
 * `.value` read cannot express.
 *
 * A **group** — several radios or checkboxes sharing a name — is not this
 * function's job, because it needs more than one element: that is what the form
 * engine's field resolution is for.
 *
 * @example
 * getValue(elements.name); // 'Ada'
 * getValue(elements.subscribed); // true — not 'on', not undefined
 * getValue(elements.quantity); // 7, or null when the box is empty
 * getValue(elements.tags); // ['a', 'b'] from a multiple select
 * getValue(elements.maybeMissing); // null — no guard needed, like setValue
 *
 * @param {Element | null | undefined} el - The control, or nullish for `null`.
 * @returns {unknown} The value per the table above.
 * @throws {TypeError} If `el` is neither an element nor nullish.
 */
export function getValue(el) {
  if (!actionable(el, 'getValue')) return null;
  const element = /** @type {any} */ (el);

  if (element.type === 'checkbox' || element.type === 'radio') {
    return Boolean(element.checked);
  }

  if (element.type === 'file') {
    // A `FileList` is array-like and not an array; a caller wants to iterate,
    // filter and `length` it like everything else this function returns. No
    // `?? []` fallback: every engine defines `files` on a file input, so the
    // guard would be dead code — and this project deletes those rather than
    // mock-covering them (the M2.4 precedent).
    return Array.from(element.files);
  }

  if (typeof element.selectedIndex === 'number' && element.options !== undefined) {
    if (element.multiple === true) {
      return Array.from(element.options)
        .filter((option) => /** @type {any} */ (option).selected)
        .map((option) => /** @type {any} */ (option).value);
    }
    return element.selectedIndex < 0 ? null : element.value;
  }

  if (element.type === 'number' || element.type === 'range') {
    // `valueAsNumber` would be the platform's own answer and is deliberately not
    // used: it reports NaN for an empty field *and* for an unparseable one, so it
    // cannot tell "left alone" from "typed nonsense". The raw string can.
    return element.value === '' ? null : Number(element.value);
  }

  return element.value;
}
