/**
 * egl-utils-js — accessibility primitives (spec 07 §2 items F109–F110).
 *
 * Two things every dialog, drawer and overlay needs, and which this library has
 * so far had exactly once each — inside the F50 overlay, where nothing else can
 * reach them.
 *
 * **A focus trap** keeps Tab inside a region while that region owns the screen.
 * The failure it prevents is not cosmetic: a modal a keyboard user can Tab out
 * of puts them behind it, in a page they cannot see, with no way back. The
 * failure it *causes* when written carelessly is worse — a trap with nothing to
 * hold focus is a lock, and F109 names that case rather than leaving it to be
 * discovered.
 *
 * **A live region** says something happened without moving focus. Moving focus is
 * how most code announces things, and it is why a screen-reader user gets thrown
 * to the top of a table because a column moved. ADR-0069 named that gap in this
 * library's own F100 keyboard path; this is what closes it.
 *
 * Neither needs a component library, which is why both live here and not behind
 * the Bootstrap-flavoured entry (spec 07 §4): a consumer should not have to take
 * a component catalogue to announce a message.
 *
 * @module egl-utils-js/dom
 */

import { controllerFor, isAbortSignal, isElement, requireDocument } from './dom-helpers.js';
import { assertNoUnknownOptions } from './option-keys.js';

/**
 * What the platform will hand focus to on Tab, before per-element filtering.
 *
 * Deliberately a **selector, not a heuristic**: the list is the one the HTML
 * spec makes focusable by default plus anything the author opted in with
 * `tabindex`. Everything situational — disabled, hidden, negative tabindex — is
 * filtered in {@link isTabbable}, where the reason for each exclusion can be
 * stated.
 */
const FOCUSABLE =
  'a[href],area[href],button,input,select,textarea,summary,iframe,object,embed,[contenteditable],[tabindex]';

/**
 * Whether an element is in the sequential tab order.
 *
 * **No layout is consulted.** Whether an element is visible is a rendered
 * question, and reading it would mean a forced layout per Tab press on the hot
 * path of a keyboard user's navigation — the cost F98 refused and every item
 * since has inherited. `hidden` and `disabled` are the two states the DOM can
 * answer for free, and they cover what a caller controls; an element hidden by
 * CSS alone is the caller's to keep out of the trap's root.
 *
 * @param {Element} el
 * @returns {boolean}
 */
function isTabbable(el) {
  if (/** @type {{ disabled?: boolean }} */ (el).disabled === true) return false;
  if (el.hasAttribute('hidden') || el.closest('[hidden]') !== null) return false;
  if (el.getAttribute('aria-hidden') === 'true') return false;
  // A negative `tabindex` is the author saying "focusable, but not by Tab" —
  // which is exactly what this function is asking about.
  const tabindex = el.getAttribute('tabindex');
  return tabindex === null || Number(tabindex) >= 0;
}

/**
 * @typedef {object} SaveFocusOptions
 * @property {Document} [document] - The document whose focus to capture. Defaults
 *   to the ambient one; injectable for a server-side DOM, an iframe or a test
 *   (NFR-14).
 */

/**
 * Remember what has focus now, and get back a way to put it there (F109).
 *
 * The half of F109 that **already existed** — inside the F50 overlay, where it
 * was correct and unreachable. `loadingOverlay` now calls this instead of keeping
 * its own copy, which is what makes this an extraction rather than a second
 * implementation of the same fifteen lines.
 *
 * @example
 * const restore = saveFocus();
 * openTheThing();
 * // …later:
 * restore();
 *
 * @param {SaveFocusOptions} [options]
 * @returns {() => void} Idempotent restore. A target that has since left the
 *   document is **not** refocused: restoring focus to a detached node either
 *   throws or silently focuses nothing, and neither is a restoration.
 * @throws {TypeError} On a malformed or unknown option.
 * @throws {DomContractError} If there is no document to read focus from.
 */
export function saveFocus(options = {}) {
  const api = 'saveFocus';
  if (options === null || typeof options !== 'object') {
    throw new TypeError(`${api}: options must be an object`);
  }
  const { document: explicitDocument, ...unknown } = options;
  assertNoUnknownOptions(unknown, api);
  if (explicitDocument !== undefined && typeof explicitDocument !== 'object') {
    throw new TypeError(`${api}: options.document must be a Document`);
  }
  const doc = /** @type {Document} */ (explicitDocument ?? requireDocument(api));
  const saved = doc.activeElement;
  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    if (saved !== null && doc.contains(saved)) {
      /** @type {{ focus?: () => void }} */ (saved).focus?.();
    }
  };
}

/**
 * @typedef {object} FocusTrapOptions
 * @property {boolean} [restore=true] - On release, refocus whatever had focus when
 *   the trap was installed, through {@link saveFocus} — including its rule that a
 *   target which has since left the document is not refocused.
 * @property {Element | false} [initialFocus] - What to focus when the trap is
 *   installed. Defaults to the first tabbable element in `root`; `false` moves
 *   nothing, for a caller who has already placed focus themselves.
 * @property {AbortSignal} [signal] - Releases the trap when aborted, the same
 *   teardown every listener-owning export on this entry takes (NFR-15).
 */

/**
 * Keep Tab inside `root` until the returned function is called (F109).
 *
 * @example
 * const release = focusTrap(dialog);
 * // …later, when the dialog closes:
 * release(); // focus goes back where it came from
 *
 * @example
 * // Teardown can ride a signal instead, like every other listener here:
 * focusTrap(drawer, { signal: controller.signal, initialFocus: closeButton });
 *
 * @param {Element} root - The region focus stays inside.
 * @param {FocusTrapOptions} [options]
 * @returns {() => void} Idempotent release: detaches the listener, drops any
 *   `tabindex` this added, and restores focus.
 * @throws {TypeError} On a malformed option or a non-Element root.
 */
export function focusTrap(root, options = {}) {
  const api = 'focusTrap';
  if (!isElement(root)) throw new TypeError(`${api}: root must be an Element`);
  if (options === null || typeof options !== 'object') {
    throw new TypeError(`${api}: options must be an object`);
  }
  const { restore = true, initialFocus, signal, ...unknown } = options;
  assertNoUnknownOptions(unknown, api);
  if (typeof restore !== 'boolean') {
    throw new TypeError(`${api}: options.restore must be a boolean`);
  }
  if (initialFocus !== undefined && initialFocus !== false && !isElement(initialFocus)) {
    throw new TypeError(`${api}: options.initialFocus must be an Element or false`);
  }
  if (signal !== undefined && !isAbortSignal(signal)) {
    throw new TypeError(`${api}: options.signal must be an AbortSignal`);
  }

  // An Element always has one, so this is an assertion rather than a fallback —
  // and `?? requireDocument(api)` would be a branch no execution can take, which
  // this project deletes rather than mock-covers (the M2.4 precedent).
  const doc = /** @type {Document} */ (root.ownerDocument);
  // Composed, not repeated: a trap that restores focus is a trap plus the thing
  // above it, and writing the second half twice is how the two would drift.
  const restoreFocus = restore ? saveFocus({ document: doc }) : undefined;
  const controller = controllerFor(root);

  /** @returns {Element[]} */
  const tabbable = () => [...root.querySelectorAll(FOCUSABLE)].filter(isTabbable);

  // A root with nothing tabbable in it still has to hold focus, or the browser
  // leaves it on `<body>` — outside the trap, which is the one place a trap must
  // not put anyone. `tabindex="-1"` makes the root itself a target without
  // adding it to the tab order, and it is removed again on release so the node
  // goes back to how the caller had it.
  const addedTabindex = !root.hasAttribute('tabindex');
  if (addedTabindex) root.setAttribute('tabindex', '-1');

  if (initialFocus !== false) {
    const target = initialFocus ?? tabbable()[0] ?? root;
    /** @type {{ focus?: () => void }} */ (target).focus?.();
  }

  root.addEventListener(
    'keydown',
    (event) => {
      if (/** @type {any} */ (event).key !== 'Tab') return;
      const list = tabbable();
      // Nothing to move to: hold the key rather than let the browser move focus
      // out of the region. This is the case that turns a trap into a lock if it
      // is handled by *cycling* instead — there is nothing to cycle through.
      if (list.length === 0) {
        event.preventDefault();
        return;
      }
      const back = /** @type {any} */ (event).shiftKey === true;
      const active = doc.activeElement;
      // Two cases, and asking "is focus on something we own" answers both: it is
      // at the edge the key is about to leave through, or it is somewhere this
      // trap does not hold — the root itself, or a node outside it — from which
      // the browser's next Tab goes wherever it likes. Everything in between is
      // the platform's own tab order, which is correct and left alone.
      const at = list.indexOf(/** @type {Element} */ (active));
      if (at === -1 || at === (back ? 0 : list.length - 1)) {
        event.preventDefault();
        /** @type {{ focus?: () => void }} */ (back ? list[list.length - 1] : list[0]).focus?.();
      }
    },
    { signal: controller.signal },
  );

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    controller.abort();
    if (addedTabindex) root.removeAttribute('tabindex');
    restoreFocus?.();
  };

  signal?.addEventListener('abort', release, { once: true });
  if (signal?.aborted === true) release();
  return release;
}

/**
 * @typedef {object} LiveRegionOptions
 * @property {'polite' | 'assertive'} [politeness='polite'] - How urgently a
 *   screen reader interrupts. Fixed for the life of the region rather than
 *   per-announcement: changing `aria-live` on a live node is unreliable across
 *   assistive technologies, so a caller who needs both makes two announcers,
 *   which is honest about what it costs.
 * @property {string} [class] - Replaces the built-in visually-hidden styles with
 *   a class of yours — `visually-hidden` if you already load Bootstrap. Given
 *   one, no inline style is written at all.
 * @property {Document} [document] - The document to build in, for a server-side
 *   DOM, an iframe or a test (NFR-14).
 * @property {AbortSignal} [signal] - Destroys the region when aborted.
 */

/**
 * @typedef {object} LiveRegionInstance
 * @property {(message: string) => void} announce - Say something. Does not move
 *   focus, which is the entire point.
 * @property {Element} element - The region itself, for a caller who wants to
 *   place it somewhere other than `<body>`.
 * @property {() => void} destroy
 */

/**
 * Visually hidden, and still read aloud — the clip pattern, as one attribute
 * rather than nine property writes.
 *
 * `display: none` and `visibility: hidden` would remove the region from the
 * accessibility tree along with the screen, which is the mistake that makes a
 * live region silent.
 */
const HIDDEN_STYLE =
  'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0';

/**
 * A live region that announces without moving focus (F110).
 *
 * @example
 * const announcer = liveRegion();
 * announcer.announce(`Column moved to position ${index + 1} of ${total}`);
 *
 * @example
 * // Urgent, and using Bootstrap's own utility class instead of inline styles:
 * const errors = liveRegion({ politeness: 'assertive', class: 'visually-hidden' });
 *
 * @param {LiveRegionOptions} [options]
 * @returns {LiveRegionInstance}
 * @throws {TypeError} On a malformed or unknown option.
 * @throws {DomContractError} If there is no document to build in.
 */
export function liveRegion(options = {}) {
  const api = 'liveRegion';
  if (options === null || typeof options !== 'object') {
    throw new TypeError(`${api}: options must be an object`);
  }
  const {
    politeness = 'polite',
    class: className,
    document: explicitDocument,
    signal,
    ...unknown
  } = options;
  assertNoUnknownOptions(unknown, api);
  if (politeness !== 'polite' && politeness !== 'assertive') {
    throw new TypeError(`${api}: options.politeness must be 'polite' or 'assertive'`);
  }
  if (className !== undefined && typeof className !== 'string') {
    throw new TypeError(`${api}: options.class must be a string`);
  }
  if (explicitDocument !== undefined && typeof explicitDocument !== 'object') {
    throw new TypeError(`${api}: options.document must be a Document`);
  }
  if (signal !== undefined && !isAbortSignal(signal)) {
    throw new TypeError(`${api}: options.signal must be an AbortSignal`);
  }

  const doc = /** @type {Document} */ (explicitDocument ?? requireDocument(api));
  const element = doc.createElement('div');
  // Both the role and the attribute. `role="status"` already implies a polite
  // live region and `role="alert"` an assertive one, but support for the implied
  // half has never been uniform, and a duplicated attribute costs nothing next to
  // an announcement nobody hears.
  element.setAttribute('role', politeness === 'assertive' ? 'alert' : 'status');
  element.setAttribute('aria-live', politeness);
  // The region is read as a whole, so a message replacing a longer one is not
  // announced as the difference between the two.
  element.setAttribute('aria-atomic', 'true');
  if (className === undefined) element.setAttribute('style', HIDDEN_STYLE);
  else element.setAttribute('class', className);
  doc.body.append(element);

  let destroyed = false;
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    element.remove();
    signal?.removeEventListener('abort', destroy);
  };
  signal?.addEventListener('abort', destroy, { once: true });
  if (signal?.aborted === true) destroy();

  return {
    element,
    announce: (message) => {
      if (destroyed) throw new TypeError(`${api}: announce() was called after destroy()`);
      if (typeof message !== 'string') {
        throw new TypeError(`${api}: message must be a string`);
      }
      // A screen reader announces a live region when its content *changes*, so
      // the same message twice running is silence the second time — exactly the
      // case a "Saved" toast hits. Comparing against what is already there and
      // adding a trailing space makes the text differ without changing a word of
      // what is read, and needs no state of its own to do it.
      element.textContent = element.textContent === message ? `${message} ` : message;
    },
    destroy,
  };
}
