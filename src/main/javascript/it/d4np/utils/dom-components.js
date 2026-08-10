/**
 * egl-utils-js — UI components (spec 03 §2 items F49-F50).
 *
 * Instance-based and framework-agnostic: a component here owns its own nodes,
 * its own timer, and its own listeners, and it never assumes a design system.
 * Both properties are corrections of the same widespread shape — the static
 * singleton with hardcoded framework classes — where a second alert on the page
 * silently steals the first one's container and cancels its timer, and where
 * adopting the component means adopting its CSS framework (ADR-0031).
 *
 * {@link loadingOverlay} takes the same shape one step further: it owns the
 * *timing* of a presentation without owning the presentation itself, which is
 * how one gate serves a modal, a spinner, or a bar (ADR-0032).
 *
 * @module egl-utils-js/dom
 */

import { controllerFor, isAbortSignal, isElement, requireDocument } from './dom-helpers.js';
import { assertNoUnknownOptions } from './option-keys.js';

/** The four semantic kinds. Severity is the caller's vocabulary, not ours. */
const KINDS = /** @type {const} */ (['success', 'info', 'warning', 'danger']);

/**
 * Neutral, framework-free defaults in BEM shape — they collide with nothing and
 * style nothing until the consumer writes CSS for them, which is the point: a
 * Bootstrap or Tailwind map is one option away, and neither is privileged.
 */
const DEFAULT_CLASSES = /** @type {const} */ ({
  base: 'egl-alert',
  success: 'egl-alert--success',
  info: 'egl-alert--info',
  warning: 'egl-alert--warning',
  danger: 'egl-alert--danger',
  icon: 'egl-alert__icon',
  message: 'egl-alert__message',
  close: 'egl-alert__close',
});

/**
 * `role="alert"` interrupts a screen reader; `role="status"` waits for a pause.
 * A failure earns the interruption, a confirmation does not.
 */
const ROLES = /** @type {const} */ ({
  success: 'status',
  info: 'status',
  warning: 'alert',
  danger: 'alert',
});

/**
 * @typedef {'success' | 'info' | 'warning' | 'danger'} AlertKind
 */

/**
 * @typedef {Element & { hidden: boolean }} HideableElement
 * An element whose visibility is driven by the `hidden` attribute — the same
 * mechanism {@link setVisible} uses by default (F45), so the two agree.
 */

/**
 * @typedef {string | Node | ((kind: AlertKind) => string | Node | null | undefined)} AlertIcon
 * A per-kind icon: a string (rendered as text, so a ligature or a glyph works),
 * a node (cloned per render, so one map can serve many instances), or a factory
 * returning either. No icon set is assumed and none is bundled.
 */

/**
 * @typedef {object} InlineAlertOptions
 * @property {Partial<Record<'base' | AlertKind | 'icon' | 'message' | 'close', string>>} [classes]
 *   Class names, merged over the neutral defaults. Supply a framework's map here
 *   to adopt its look without the library knowing the framework exists.
 * @property {Partial<Record<AlertKind | 'close', AlertIcon>>} [icons] - Icons per
 *   kind, plus the close button's glyph (default `'×'`). Absent kinds render
 *   no icon element content.
 * @property {number} [autoHideMs] - Hide automatically after this many
 *   milliseconds. Omitted means the alert stays until `hide()` or a dismissal.
 * @property {boolean} [dismissible=true] - Render a close button.
 * @property {string} [closeLabel='Close'] - The close button's accessible name.
 *   A visible glyph is not a label, so this is what a screen reader announces.
 * @property {AbortSignal} [signal] - Destroys the instance when aborted, so a
 *   component's teardown can ride the same signal as the rest of its listeners
 *   (NFR-15).
 */

/**
 * @typedef {object} InlineAlertShowOptions
 * @property {number} [autoHideMs] - Overrides the instance default for this one
 *   alert. `0` or `Infinity` pins it open.
 * @property {boolean} [html=false] - Treat `message` as markup instead of text.
 *   Requires `sanitize`.
 * @property {((html: string) => string) | false} [sanitize] - Required when
 *   `html` is true: a sanitizer, or the literal `false` to declare the markup
 *   trusted. Mirrors {@link injectFragment}'s contract exactly (F47, ADR-0030).
 */

/**
 * @typedef {object} InlineAlertInstance
 * @property {(kind: AlertKind, message: string, options?: InlineAlertShowOptions) => void} show
 * @property {() => void} hide
 * @property {() => void} destroy
 */

/**
 * An inline alert banner bound to one container (spec 03 F49).
 *
 * **Every instance owns its state.** The timer, the close-button listener, and
 * the nodes belong to the returned object, so two alerts on one page — a
 * page-level one and a dialog-level one, the usual pair — cannot cancel each
 * other's auto-hide or write into each other's container. Re-showing while a
 * previous alert is still visible cancels the pending timer first, so the newer
 * message always gets its full time on screen instead of inheriting the tail of
 * the older one.
 *
 * **Text by default, markup by decision.** `message` is written with
 * `textContent`, so a value containing `<` is displayed rather than parsed.
 * Rich content needs the explicit `{ html: true, sanitize }` pair — the same
 * rule as {@link injectFragment}, for the same reason: the dangerous choice must
 * be the loud one, and a default sanitizer would quietly bind this entry to the
 * DOMPurify optional peer.
 *
 * The nodes are created in the **container's own document**, so an alert inside
 * an iframe or a server-side DOM implementation works without an ambient
 * `document` (NFR-14 as amended in 11.2).
 *
 * @example
 * const alerts = inlineAlert(document.querySelector('#form-alert'));
 * alerts.show('success', 'Saved.', { autoHideMs: 3_000 });
 * // …when the dialog closes
 * alerts.destroy();
 *
 * @example
 * // Adopt a design system by passing its class names — the library stays neutral:
 * const alerts = inlineAlert(host, {
 *   classes: { base: 'alert', success: 'alert-success', close: 'btn-close' },
 *   icons: { success: '✓', danger: '⚠' },
 * });
 *
 * @example
 * // Markup requires the sanitize decision, exactly like injectFragment:
 * import { sanitizeHtml } from 'egl-utils-js/sanitize';
 * alerts.show('info', '<b>3</b> items imported', { html: true, sanitize: sanitizeHtml });
 *
 * @param {Element} container - Host element. The alert is appended to it; other
 *   children are left alone, and `destroy()` removes only what this instance
 *   added.
 * @param {InlineAlertOptions} [options]
 * @returns {InlineAlertInstance}
 * @throws {TypeError} If `container` is not an element, if `classes`/`icons` are
 *   not objects, if `autoHideMs` is not a positive finite number, or if `signal`
 *   is not an `AbortSignal`.
 * @throws {DomContractError} If the container has no owner document and there is
 *   no global one either — there is nowhere to create the alert.
 */
export function inlineAlert(container, options = {}) {
  if (!isElement(container)) {
    throw new TypeError('inlineAlert: container must be an Element');
  }
  const {
    classes: classOverrides = {},
    icons = {},
    autoHideMs,
    dismissible = true,
    closeLabel = 'Close',
    signal,
    ...unknown
  } = options;
  assertNoUnknownOptions(unknown, 'inlineAlert');

  assertPlainObject(classOverrides, 'options.classes');
  assertPlainObject(icons, 'options.icons');
  assertAutoHide(autoHideMs, 'options.autoHideMs');
  if (signal !== undefined && !isAbortSignal(signal)) {
    throw new TypeError('inlineAlert: options.signal must be an AbortSignal');
  }

  const classes = { ...DEFAULT_CLASSES, ...classOverrides };
  // The container's own document keeps the nodes in the right realm; the global
  // one is only a fallback for a container that has none.
  const doc =
    /** @type {{ ownerDocument?: Document }} */ (container).ownerDocument ??
    requireDocument('inlineAlert');

  const controller = controllerFor(container);
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  /** @type {{ root: HideableElement, icon: HideableElement, message: Element } | undefined} */
  let parts;
  let destroyed = false;

  const clearTimer = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  const hide = () => {
    clearTimer();
    if (parts !== undefined) parts.root.hidden = true;
  };

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    clearTimer();
    // One abort detaches the close button and the external-signal hook together.
    controller.abort();
    parts?.root.remove();
    parts = undefined;
  };

  /**
   * Build the nodes once, on first show — a component that is created but never
   * shown must leave the container untouched.
   *
   * @returns {{ root: HideableElement, icon: HideableElement, message: Element }}
   */
  const build = () => {
    const root = doc.createElement('div');
    const icon = doc.createElement('span');
    icon.className = classes.icon;
    const message = doc.createElement('span');
    message.className = classes.message;
    root.append(icon, message);

    if (dismissible) {
      const close = doc.createElement('button');
      // `type="button"`: the default is `submit`, so a close button inside a
      // form would post it — a classic and very confusing bug.
      close.type = 'button';
      close.className = classes.close;
      close.setAttribute('aria-label', closeLabel);
      // `hideWhenEmpty: false` — the button is the slot here, not a decoration
      // beside one. A design system whose close control is drawn entirely in CSS
      // (Bootstrap's `.btn-close` background image, for one) supplies an empty
      // icon, and hiding the control for that would remove the only way to
      // dismiss the alert. `dismissible: false` is how a caller asks for no
      // close button; an empty glyph asks for no *glyph* (found by 14.2/F64).
      renderIcon(close, icons.close ?? '×', 'info', false);
      close.addEventListener('click', hide, { signal: controller.signal });
      root.append(close);
    }

    container.append(root);
    return { root, icon, message };
  };

  /** @type {InlineAlertInstance['show']} */
  const show = (kind, message, showOptions = {}) => {
    if (destroyed) {
      throw new TypeError('inlineAlert: show() was called after destroy()');
    }
    if (!KINDS.includes(/** @type {never} */ (kind))) {
      throw new TypeError(`inlineAlert: kind must be one of: ${KINDS.join(', ')}`);
    }
    if (typeof message !== 'string') {
      throw new TypeError('inlineAlert: message must be a string');
    }
    const {
      autoHideMs: showAutoHide = autoHideMs,
      html = false,
      sanitize,
      ...unknownShow
    } = showOptions;
    assertNoUnknownOptions(unknownShow, 'inlineAlert.show');
    assertAutoHide(showAutoHide, 'options.autoHideMs', true);

    parts ??= build();
    const { root, icon, message: messageEl } = parts;

    root.className = `${classes.base} ${classes[kind]}`;
    root.setAttribute('role', ROLES[kind]);
    renderIcon(icon, icons[kind], kind);
    renderMessage(messageEl, message, html, sanitize);
    root.hidden = false;

    // Always cancel first: an in-flight timer from the previous message would
    // otherwise close this one early.
    clearTimer();
    if (showAutoHide !== undefined && showAutoHide > 0 && Number.isFinite(showAutoHide)) {
      timer = setTimeout(hide, showAutoHide);
    }
  };

  signal?.addEventListener('abort', destroy, { once: true });
  if (signal?.aborted === true) destroy();

  return { show, hide, destroy };
}

/**
 * Write the message as text, or as sanitized markup when the caller asked for
 * markup and said what to sanitize it with.
 *
 * @param {Element} target
 * @param {string} message
 * @param {boolean} html
 * @param {((html: string) => string) | false | undefined} sanitize
 * @returns {void}
 * @throws {TypeError} If `html` is true and `sanitize` is missing or invalid, or
 *   if the sanitizer returns a non-string.
 */
function renderMessage(target, message, html, sanitize) {
  if (html !== true) {
    target.textContent = message;
    return;
  }
  if (sanitize === undefined) {
    throw new TypeError(
      'inlineAlert: options.sanitize is required with { html: true } — pass a sanitizer ' +
        '(sanitizeHtml from egl-utils-js/sanitize fits) or false. There is no default.',
    );
  }
  if (sanitize !== false && typeof sanitize !== 'function') {
    throw new TypeError('inlineAlert: options.sanitize must be a function or false');
  }
  const markup = sanitize === false ? message : sanitize(message);
  if (typeof markup !== 'string') {
    throw new TypeError('inlineAlert: the sanitizer must return a string');
  }
  target.innerHTML = markup;
}

/**
 * Render an icon slot: text as text, a node as a **clone**, nothing as an empty
 * hidden slot.
 *
 * Cloning is what lets one `icons` map serve several instances and several
 * shows — appending the caller's node directly would move it out of wherever it
 * was, and the second alert would silently steal the first one's icon.
 *
 * @param {HideableElement} target
 * @param {AlertIcon | undefined} icon
 * @param {AlertKind} kind
 * @param {boolean} [hideWhenEmpty=true] - Hide the slot when there is nothing to
 *   put in it. True for a decorative icon span, whose empty box would still take
 *   margin; false where the slot is itself the control.
 * @returns {void}
 * @throws {TypeError} If a supplied icon is neither a string nor a cloneable node.
 */
function renderIcon(target, icon, kind, hideWhenEmpty = true) {
  target.replaceChildren();
  const value = typeof icon === 'function' ? icon(kind) : icon;
  if (value === undefined || value === null || value === '') {
    if (hideWhenEmpty) target.hidden = true;
    return;
  }
  target.hidden = false;
  if (typeof value === 'string') {
    target.textContent = value;
    return;
  }
  if (typeof (/** @type {{ cloneNode?: unknown }} */ (value).cloneNode) !== 'function') {
    throw new TypeError('inlineAlert: an icon must be a string, a Node, or a function');
  }
  target.append(value.cloneNode(true));
}

/**
 * @param {unknown} value
 * @param {string} name
 * @returns {void}
 */
function assertPlainObject(value, name) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`inlineAlert: ${name} must be an object`);
  }
}

/**
 * `undefined` disables auto-hide. A per-show `0` or `Infinity` pins the alert
 * open, which is why they are accepted there and rejected as an instance
 * default — a default of `0` would read as "hide immediately" to everyone.
 *
 * @param {unknown} value
 * @param {string} name
 * @param {boolean} [allowPinned=false]
 * @returns {void}
 */
function assertAutoHide(value, name, allowPinned = false) {
  if (value === undefined) return;
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new TypeError(`inlineAlert: ${name} must be a number`);
  }
  if (allowPinned ? value < 0 : !(value > 0 && Number.isFinite(value))) {
    throw new TypeError(`inlineAlert: ${name} must be a positive finite number`);
  }
}

/**
 * @typedef {object} OverlayFocusOptions
 * @property {boolean} [save=false] - Capture the active element before showing
 *   and restore it after hiding. Needs a document; without a `root` the ambient
 *   one is used, so this is the one option that makes the gate browser-only.
 * @property {Element} [root] - The overlay's own element. Focus inside it is
 *   cleared before hiding — that is what prevents the "blocked aria-hidden on an
 *   element because its descendant retained focus" warning. Its `ownerDocument`
 *   is also used in preference to the ambient one.
 */

/**
 * @typedef {object} LoadingOverlayOptions
 * @property {() => void | Promise<void>} onShow - Presents the overlay. May be
 *   async: the minimum-visible clock starts when it **settles**.
 * @property {() => void | Promise<void>} onHide - Dismisses the overlay.
 * @property {number} [minVisibleMs=400] - How long the overlay stays up once it
 *   has actually appeared. `0` disables the anti-flicker floor.
 * @property {OverlayFocusOptions} [focus] - Focus save/restore behaviour.
 * @property {AbortSignal} [signal] - Destroys the gate when aborted (NFR-15).
 */

/**
 * @typedef {object} LoadingOverlayInstance
 * @property {() => () => void} show - Acquire the overlay; returns an idempotent
 *   release.
 * @property {<T>(operation: Promise<T> | (() => Promise<T> | T)) => Promise<T>} wrap
 * @property {() => boolean} isShown
 * @property {() => void} destroy
 */

/**
 * A reference-counted visibility gate over an injected presentation (spec 03 F50).
 *
 * The gate owns *when* an overlay is visible; `onShow`/`onHide` own *what* is
 * visible. That split is the whole design: one gate drives a modal, a spinner,
 * or a progress bar, and none of them leak into this file (ADR-0032).
 *
 * Three problems it exists to solve, each of which is usually got wrong:
 *
 * 1. **Concurrent owners.** `show()` increments a count and returns an
 *    idempotent release; the overlay hides only when the count returns to zero.
 *    Two overlapping fetches therefore cannot tear the overlay down while the
 *    other is still running — the bug a plain boolean flag guarantees.
 * 2. **Flicker.** The minimum-visible clock starts when `onShow` **settles**,
 *    not when `show()` is called, so an animated presentation cannot be measured
 *    from before it appeared. A response that arrives in 30 ms still yields a
 *    readable overlay instead of a flash.
 * 3. **Focus.** With `focus.save` the active element is captured before showing,
 *    focus inside the overlay is cleared before hiding — which is what avoids the
 *    `aria-hidden` focus warning — and the original element is refocused
 *    afterwards, but only if it is still in the document.
 *
 * A `hide` that arrives mid-appearance is honoured once the appearance completes
 * and the floor has elapsed, so the gate can never be left up by a race.
 *
 * **Presentation failures are contained.** If `onShow` or `onHide` throws or
 * rejects, the gate returns to a consistent state and the error is not thrown
 * into the caller's code — the same rule the logger applies to a failing sink
 * (ADR-0027). A spinner that cannot render must not fail the save it was
 * decorating. Only programmer errors (bad options, use after `destroy()`) throw.
 *
 * @example
 * const overlay = loadingOverlay({
 *   onShow: () => modal.show(),
 *   onHide: () => modal.hide(),
 *   focus: { save: true, root: modalElement },
 * });
 *
 * const release = overlay.show();
 * try { await save(); } finally { release(); }
 *
 * @example
 * // Same thing, without the try/finally — release happens either way:
 * const user = await overlay.wrap(() => api.get('users/42'));
 *
 * @example
 * // Nested operations: the overlay survives until the last one finishes.
 * await Promise.all([overlay.wrap(loadA()), overlay.wrap(loadB())]);
 *
 * @param {LoadingOverlayOptions} options
 * @returns {LoadingOverlayInstance}
 * @throws {TypeError} If `onShow`/`onHide` are not functions, if `minVisibleMs`
 *   is not a non-negative finite number, if `focus`/`focus.root` are of the wrong
 *   type, or if `signal` is not an `AbortSignal`.
 * @throws {DomContractError} If `focus.save` is set and there is no document to
 *   read the active element from.
 */
export function loadingOverlay(options) {
  const {
    onShow,
    onHide,
    minVisibleMs = 400,
    focus = {},
    signal,
    ...unknown
  } = /** @type {Partial<LoadingOverlayOptions>} */ (options ?? {});
  assertNoUnknownOptions(unknown, 'loadingOverlay');

  if (typeof onShow !== 'function' || typeof onHide !== 'function') {
    throw new TypeError('loadingOverlay: options.onShow and options.onHide must be functions');
  }
  if (typeof minVisibleMs !== 'number' || !(minVisibleMs >= 0) || !Number.isFinite(minVisibleMs)) {
    throw new TypeError(
      'loadingOverlay: options.minVisibleMs must be a non-negative finite number',
    );
  }
  if (focus === null || typeof focus !== 'object') {
    throw new TypeError('loadingOverlay: options.focus must be an object');
  }
  const { save: saveFocus = false, root: focusRoot, ...unknownFocus } = focus;
  assertNoUnknownOptions(unknownFocus, 'loadingOverlay.focus');
  if (focusRoot !== undefined && !isElement(focusRoot)) {
    throw new TypeError('loadingOverlay: options.focus.root must be an Element');
  }
  if (signal !== undefined && !isAbortSignal(signal)) {
    throw new TypeError('loadingOverlay: options.signal must be an AbortSignal');
  }

  // Resolved once, and only when focus handling is actually requested — the gate
  // is otherwise usable with no DOM at all, which is what makes its timing
  // logic testable in Node (NFR-14 as amended in 11.2).
  /** @type {Document | undefined} */
  const doc = saveFocus
    ? (focusRoot?.ownerDocument ?? requireDocument('loadingOverlay'))
    : undefined;

  /** @type {'hidden' | 'appearing' | 'shown'} */
  let state = 'hidden';
  let refCount = 0;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let floorTimer;
  let floorElapsed = false;
  let hideRequested = false;
  let destroyed = false;
  /** @type {Element | undefined} */
  let savedFocus;

  const clearFloor = () => {
    if (floorTimer !== undefined) {
      clearTimeout(floorTimer);
      floorTimer = undefined;
    }
  };

  /**
   * Run a presentation hook without letting its failure escape into unrelated
   * code, and **call it synchronously** — `show()` must start showing now, not a
   * microtask later. A synchronous throw and a rejection are contained the same
   * way, so both shapes leave the gate in a state it can recover from.
   *
   * @param {() => void | Promise<void>} hook
   * @returns {Promise<void>}
   */
  const runHook = (hook) => {
    try {
      return Promise.resolve(hook()).catch(() => {});
    } catch {
      return Promise.resolve();
    }
  };

  const performHide = () => {
    hideRequested = false;
    state = 'hidden';
    clearFloor();
    floorElapsed = false;

    // Blur first: hiding a container that still holds focus is what produces the
    // aria-hidden warning, and the browser would otherwise move focus to <body>.
    if (doc !== undefined) {
      const active = doc.activeElement;
      if (active !== null && focusRoot?.contains(active) === true) {
        /** @type {{ blur?: () => void }} */ (active).blur?.();
      }
    }

    return runHook(onHide).then(() => {
      const target = savedFocus;
      savedFocus = undefined;
      // Only refocus something still attached: restoring focus to a node the
      // operation removed would throw, or silently focus a detached element.
      if (target !== undefined && doc?.contains(target) === true) {
        /** @type {{ focus?: () => void }} */ (target).focus?.();
      }
    });
  };

  const onAppeared = () => {
    if (destroyed || state !== 'appearing') return;
    state = 'shown';
    floorElapsed = false;
    clearFloor();
    // The floor is measured from here — the moment the overlay is actually up —
    // never from the show() call, which may precede it by an animation.
    floorTimer = setTimeout(() => {
      floorTimer = undefined;
      floorElapsed = true;
      if (hideRequested) performHide();
    }, minVisibleMs);
  };

  const beginAppear = () => {
    state = 'appearing';
    savedFocus = doc?.activeElement ?? undefined;
    runHook(onShow).then(onAppeared);
  };

  const requestHide = () => {
    hideRequested = true;
    // Appearing: onAppeared starts the floor and the timer honours this then.
    // Shown but inside the floor: the running timer honours it on expiry.
    if (state === 'shown' && floorElapsed) performHide();
  };

  /** @type {LoadingOverlayInstance['show']} */
  const show = () => {
    if (destroyed) {
      throw new TypeError('loadingOverlay: show() was called after destroy()');
    }
    refCount += 1;
    // A new owner cancels a hide that has not happened yet, so show/release/show
    // in the same tick does not blink.
    hideRequested = false;
    if (refCount === 1 && state === 'hidden') beginAppear();

    let released = false;
    return () => {
      // Idempotent by contract: a release called twice must not let a sibling's
      // acquisition go unnoticed, which is exactly how refcounts drift.
      if (released) return;
      released = true;
      refCount -= 1;
      if (refCount === 0) requestHide();
    };
  };

  /** @type {LoadingOverlayInstance['wrap']} */
  const wrap = async (operation) => {
    const release = show();
    try {
      return await (typeof operation === 'function' ? operation() : operation);
    } finally {
      release();
    }
  };

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    clearFloor();
    refCount = 0;
    hideRequested = false;
    // Teardown is not cosmetic: it bypasses the minimum-visible floor rather
    // than leaving an overlay up for a component that no longer exists.
    if (state !== 'hidden') performHide();
    savedFocus = undefined;
  };

  signal?.addEventListener('abort', destroy, { once: true });
  if (signal?.aborted === true) destroy();

  return { show, wrap, isShown: () => state !== 'hidden', destroy };
}
