/**
 * egl-utils-js — UI components (spec 03 §2 item F49).
 *
 * Instance-based and framework-agnostic: a component here owns its own nodes,
 * its own timer, and its own listeners, and it never assumes a design system.
 * Both properties are corrections of the same widespread shape — the static
 * singleton with hardcoded framework classes — where a second alert on the page
 * silently steals the first one's container and cancels its timer, and where
 * adopting the component means adopting its CSS framework (ADR-0031).
 *
 * @module egl-utils-js/dom
 */

import { isAbortSignal, isElement, requireDocument } from './dom-helpers.js';

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
  } = options;

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

  const controller = new AbortController();
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
      renderIcon(close, icons.close ?? '×', 'info');
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
    const { autoHideMs: showAutoHide = autoHideMs, html = false, sanitize } = showOptions;
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
 * @returns {void}
 * @throws {TypeError} If a supplied icon is neither a string nor a cloneable node.
 */
function renderIcon(target, icon, kind) {
  target.replaceChildren();
  const value = typeof icon === 'function' ? icon(kind) : icon;
  if (value === undefined || value === null || value === '') {
    target.hidden = true;
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
