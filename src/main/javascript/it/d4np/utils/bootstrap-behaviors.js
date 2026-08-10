/**
 * egl-utils-js — Bootstrap behaviour wrappers: the peer-backed half of the
 * toolkit (spec 04 §2 items F68-F71, ADR-0041).
 *
 * Everything in the sibling builder files needs a document and nothing else.
 * These wrappers need Bootstrap's own JavaScript, and that package is an
 * **optional peer** (NFR-18). Three rules follow, and they are the whole design:
 *
 * - **Nothing is imported.** There is no `import 'bootstrap'` anywhere on this
 *   entry. A static import would make one badge cost every consumer a peer
 *   install, and would fail at *load*, where nothing is yet known about what the
 *   caller wanted (the `/sanitize` entry can import DOMPurify because that entry
 *   exists only to use it — the trade-off is not the same here).
 * - **Resolution is a value lookup, at first real use.** The injected
 *   `{ bootstrap }` option wins, then the ambient `globalThis.bootstrap` a CDN
 *   bundle defines. Construction of a wrapper stays free: `bsModal(el)` resolves
 *   nothing, `modal.show()` resolves. So an application can wire its UI at
 *   startup and still discover a packaging mistake at the operation that needs
 *   the package, not at the one that happened to run first.
 * - **A missing peer is a typed throw** — {@link PeerMissingError}, code
 *   `EGL_PEER_MISSING`, naming the package and both remedies. Never a
 *   `ReferenceError`, never a silent no-op.
 *
 * @module egl-utils-js/bootstrap
 */

import { PeerMissingError } from './errors.js';
import { isAbortSignal, isElement } from './dom-helpers.js';
import { assertNoUnknownOptions } from './option-keys.js';
import { loadingOverlay } from './dom-components.js';
import {
  appendContent,
  applyClasses,
  assertPlainObject,
  assertToken,
  bsCloseButton,
  bsSpinner,
  renderContent,
  resolveDocument,
} from './bootstrap-elements.js';

/**
 * @typedef {import('./bootstrap-elements.js').Content} Content
 * @typedef {import('./bootstrap-elements.js').ClassOption} ClassOption
 * @typedef {import('./dom-components.js').LoadingOverlayInstance} LoadingOverlayInstance
 */

/**
 * The shape a Bootstrap component instance presents to a wrapper. Every member
 * is optional because the check that matters happens at the call: a namespace
 * that answers to the name but not to the method is as unusable as none.
 *
 * @typedef {object} BootstrapInstanceLike
 * @property {() => void} [show]
 * @property {() => void} [hide]
 * @property {() => void} [toggle]
 * @property {() => void} [dispose]
 */

/**
 * A Bootstrap component constructor, as reached through the peer.
 *
 * @typedef {{
 *   new (element: Element, config?: Record<string, unknown>): BootstrapInstanceLike,
 *   getOrCreateInstance?: (element: Element, config?: Record<string, unknown>) => BootstrapInstanceLike,
 * }} BootstrapComponent
 */

/**
 * @typedef {object} PeerOption
 * @property {Record<string, unknown>} [bootstrap] - The Bootstrap namespace,
 *   injected. Wins over the ambient global, which is what makes these wrappers
 *   testable against a fake and usable where the global is not `bootstrap`.
 */

const PEER = 'bootstrap';

const REMEDY =
  "install the optional peer (`npm i bootstrap`) and pass it as { bootstrap }, or load Bootstrap's " +
  'bundle so it defines the `bootstrap` global.';

/**
 * Resolve one Bootstrap component constructor (spec 04 F68).
 *
 * Called at the first operation that needs Bootstrap's JavaScript — not at
 * module load, and not when a wrapper is constructed. The result is not cached
 * here: a wrapper caches its own instance, and a caller who loads the bundle
 * late should not be told forever that it is missing.
 *
 * @param {PeerOption} options
 * @param {string} api - Public function name, for the message.
 * @param {string} name - Component name on the namespace, e.g. `'Modal'`.
 * @returns {BootstrapComponent}
 * @throws {TypeError} If `options.bootstrap` is present but not an object.
 * @throws {PeerMissingError} If no namespace is reachable, or the one that is
 *   does not provide `name`.
 */
export function resolveComponent(options, api, name) {
  const injected = options.bootstrap;
  if (injected !== undefined && (typeof injected !== 'object' || injected === null)) {
    throw new TypeError(`${api}: options.bootstrap must be the Bootstrap namespace object`);
  }

  const ambient = /** @type {{ bootstrap?: unknown }} */ (globalThis).bootstrap;
  const namespace =
    injected ??
    (typeof ambient === 'object' && ambient !== null
      ? /** @type {Record<string, unknown>} */ (ambient)
      : undefined);

  if (namespace === undefined) {
    throw new PeerMissingError(
      `${api} needs Bootstrap's JavaScript, which is not reachable: ${REMEDY}`,
      { peer: PEER },
    );
  }

  const component = namespace[name];
  if (typeof component !== 'function') {
    // The package is there but this component is not — a partial build, or a
    // namespace-shaped object that is not Bootstrap. Same code, because the
    // caller's problem is identical: the capability is unreachable. The message
    // is what differs, and it is the part they act on.
    throw new PeerMissingError(
      `${api} needs bootstrap.${name}, but the Bootstrap namespace in use does not provide it. ` +
        `Check that the full bundle is loaded, then: ${REMEDY}`,
      { peer: PEER },
    );
  }
  return /** @type {BootstrapComponent} */ (/** @type {unknown} */ (component));
}

/**
 * `getOrCreateInstance` where the component offers it, `new` otherwise.
 *
 * Bootstrap 5 ships the static on every component; a hand-written fake in a test
 * need not, and an older build might not. Falling back keeps the wrapper honest
 * about what it actually requires — a constructor.
 *
 * @param {BootstrapComponent} component
 * @param {Element} element
 * @param {Record<string, unknown>} config
 * @returns {BootstrapInstanceLike}
 */
export function instantiate(component, element, config) {
  if (typeof component.getOrCreateInstance === 'function') {
    return component.getOrCreateInstance(element, config);
  }
  return new component(element, config);
}

/**
 * Call one method on a Bootstrap instance, if it has it.
 *
 * @param {BootstrapInstanceLike} instance
 * @param {'show' | 'hide' | 'toggle' | 'dispose'} method
 * @returns {void}
 */
export function invoke(instance, method) {
  const fn = instance[method];
  if (typeof fn === 'function') fn.call(instance);
}

/**
 * Expand a lifecycle event name: `'shown'` → `'shown.bs.modal'`.
 *
 * Both spellings are accepted because both are natural — the short one at a call
 * site that already names the component, the qualified one when copying from
 * Bootstrap's documentation.
 *
 * @param {unknown} event
 * @param {string} suffix - e.g. `'bs.modal'`.
 * @param {string} api
 * @returns {string}
 * @throws {TypeError} If `event` is not a non-empty string.
 */
export function qualifyEvent(event, suffix, api) {
  if (typeof event !== 'string' || event === '') {
    throw new TypeError(`${api}: event must be a non-empty string`);
  }
  return event.includes('.') ? event : `${event}.${suffix}`;
}

/**
 * Validate an `autoHideMs`: a non-negative finite number of milliseconds, or
 * `false` for "stay up until dismissed" (ADR-0048).
 *
 * @param {unknown} value
 * @param {string} api
 * @returns {void}
 * @throws {TypeError} On anything else.
 */
function assertAutoHideMs(value, api) {
  if (value === false) return;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new TypeError(
      `${api}: options.autoHideMs must be a non-negative finite number of milliseconds, or false`,
    );
  }
}

/**
 * Validate the options every wrapper shares.
 *
 * @param {{ signal?: unknown }} options
 * @param {string} api
 * @returns {void}
 * @throws {TypeError} If `signal` is present and is not an `AbortSignal`.
 */
export function assertSignal(options, api) {
  const { signal } = options;
  if (signal !== undefined && !isAbortSignal(signal)) {
    throw new TypeError(`${api}: options.signal must be an AbortSignal`);
  }
}

/**
 * @typedef {object} BehaviourWrapper
 * @property {() => void} show
 * @property {() => void} hide
 * @property {() => void} toggle
 * @property {(event: string, handler: (event: Event) => void) => () => void} on
 * @property {() => BootstrapInstanceLike} instance
 * @property {Element} element
 * @property {() => boolean} isShown
 * @property {() => void} destroy
 */

/**
 * The lifecycle every one-element behaviour wrapper needs, in one place.
 *
 * `bsModal` wrote this shape first (ADR-0041); by the fifth component it was
 * either one helper or five copies of a `destroy` whose ordering is easy to get
 * subtly wrong. What it owns: lazy resolution through {@link resolveComponent},
 * subscriptions that return an idempotent unsubscribe, open/closed state read
 * from the DOM rather than from our own calls — Escape and the data-API dismiss
 * both act without us — and a `destroy` that, on a component still open, hides
 * first and disposes once the closing event arrives, because disposing an open
 * component strands Bootstrap's backdrop and its body class.
 *
 * @param {Element} target
 * @param {PeerOption & { signal?: AbortSignal }} options
 * @param {object} spec
 * @param {string} spec.api - Public function name, for messages.
 * @param {string} spec.component - Name on the namespace, e.g. `'Collapse'`.
 * @param {string} spec.ns - Event suffix, e.g. `'bs.collapse'`.
 * @param {Record<string, unknown>} [spec.config] - Passed to the constructor.
 * @param {boolean} [spec.hideBeforeDispose=true] - Whether an open component
 *   must be closed before it is disposed. False for `Tab`, whose "shown" means a
 *   panel is selected rather than an overlay is up.
 * @returns {BehaviourWrapper}
 */
export function behaviourWrapper(target, options, spec) {
  const { api, component, ns, config = {}, hideBeforeDispose = true } = spec;

  /** @type {BootstrapInstanceLike | undefined} */
  let resolved;
  /** @type {Array<() => void>} */
  const subscriptions = [];
  let destroyed = false;
  let shown = false;
  const { signal } = options;

  function instance() {
    if (destroyed) throw new TypeError(`${api}: this wrapper has been destroyed`);
    if (resolved === undefined) {
      resolved = instantiate(resolveComponent(options, api, component), target, config);
    }
    return resolved;
  }

  const onShown = () => {
    shown = true;
  };
  const onHidden = () => {
    shown = false;
  };
  target.addEventListener(`shown.${ns}`, onShown);
  target.addEventListener(`hidden.${ns}`, onHidden);

  /**
   * @param {string} event
   * @param {(event: Event) => void} handler
   * @returns {() => void}
   */
  function on(event, handler) {
    if (destroyed) throw new TypeError(`${api}: this wrapper has been destroyed`);
    if (typeof handler !== 'function') {
      throw new TypeError(`${api}: handler must be a function`);
    }
    const name = qualifyEvent(event, ns, api);
    target.addEventListener(name, handler);
    let off = () => {
      target.removeEventListener(name, handler);
      off = () => {};
    };
    const unsubscribe = () => off();
    subscriptions.push(unsubscribe);
    return unsubscribe;
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    for (const unsubscribe of subscriptions) unsubscribe();
    subscriptions.length = 0;
    target.removeEventListener(`shown.${ns}`, onShown);
    target.removeEventListener(`hidden.${ns}`, onHidden);
    if (signal !== undefined) signal.removeEventListener('abort', destroy);

    const current = resolved;
    resolved = undefined;
    if (current === undefined) return;
    if (!shown || !hideBeforeDispose) {
      invoke(current, 'dispose');
      return;
    }
    const disposeWhenClosed = () => {
      target.removeEventListener(`hidden.${ns}`, disposeWhenClosed);
      invoke(current, 'dispose');
    };
    target.addEventListener(`hidden.${ns}`, disposeWhenClosed);
    invoke(current, 'hide');
  }

  if (signal !== undefined) {
    if (signal.aborted) destroyed = true;
    else signal.addEventListener('abort', destroy);
  }

  return {
    show: () => invoke(instance(), 'show'),
    hide: () => invoke(instance(), 'hide'),
    toggle: () => invoke(instance(), 'toggle'),
    on,
    instance,
    element: target,
    isShown: () => shown,
    destroy,
  };
}

/**
 * @typedef {object} BsToastOptions
 * @property {string} [variant] - Theme colour, applied as `text-bg-<variant>`.
 *   Per-show overridable.
 * @property {number | false} [autoHideMs=5000] - Hide this many milliseconds
 *   after showing, or `false` to leave the toast up until it is dismissed. One
 *   option rather than Bootstrap's `{autohide, delay}` pair, and the same name
 *   {@link inlineAlert} uses for the same idea (ADR-0048).
 * @property {boolean} [animation=true]
 * @property {boolean} [dismissible=true] - Render an F57 close button.
 * @property {string} [closeLabel='Close'] - Its accessible name (NFR-21).
 * @property {ClassOption} [class] - Extra classes on every toast this manager
 *   builds.
 * @property {Record<string, unknown>} [bootstrap]
 * @property {AbortSignal} [signal] - Destroys the manager when aborted (NFR-15).
 * @property {Document} [document] - Where toasts are built, when it is not the
 *   container's ambient one (F52).
 */

/**
 * @typedef {object} BsToastShowOptions
 * @property {Content} [title] - Rendered in the toast header; omitting it omits
 *   the header entirely.
 * @property {string} [variant]
 * @property {number | false} [autoHideMs] - Overrides the manager's default for
 *   this one toast.
 * @property {boolean} [html=false] - Treat string content as markup.
 * @property {((html: string) => string) | false} [sanitize] - Required with
 *   `{ html: true }` (F52).
 */

/**
 * @typedef {object} BsToastInstance
 * @property {(message: Content, options?: BsToastShowOptions) => Element} show
 * @property {() => void} hide - Hides every toast currently up.
 * @property {() => void} destroy
 */

/**
 * A Bootstrap toast manager (spec 04 F69).
 *
 * One manager owns a container and stacks toasts in it. Each `show` builds a
 * **fresh node**, which is what makes the "no stale variant classes" property
 * structural rather than a cleanup step: a danger toast and the info toast after
 * it share nothing. Each node disposes itself and leaves the DOM on
 * `hidden.bs.toast`, so a page that toasts all day does not accumulate hidden
 * markup.
 *
 * @example
 * const toasts = bsToast(document.querySelector('.toast-container'));
 * toasts.show('Saved.');
 * toasts.show('Could not save.', { variant: 'danger', title: 'Error', autoHideMs: false });
 *
 * @param {Element} container - Where toasts are appended. A
 *   `.toast-container` positions them; this wrapper does not position anything.
 * @param {BsToastOptions} [options]
 * @returns {BsToastInstance}
 * @throws {TypeError} On a malformed or unknown option or a non-Element container.
 * @throws {PeerMissingError} From `show`, if Bootstrap's `Toast` is unreachable.
 */
export function bsToast(container, options = {}) {
  const api = 'bsToast';
  if (!isElement(container)) {
    throw new TypeError(`${api}: container must be an Element`);
  }
  assertPlainObject(options, 'options', api);
  assertSignal(options, api);

  const {
    variant: defaultVariant,
    autoHideMs: defaultAutoHideMs = 5000,
    animation = true,
    dismissible = true,
    closeLabel = 'Close',
    signal,
    bootstrap,
    class: extraClass,
    document: explicitDocument,
    ...unknown
  } = options;
  assertNoUnknownOptions(unknown, api);

  if (defaultVariant !== undefined) assertToken(defaultVariant, 'options.variant', api);
  assertAutoHideMs(defaultAutoHideMs, api);

  // The container's own document, with `options.document` as an override —
  // matching every other container-taking manager (`bsTable`, `bsPagination`).
  // Resolving the ambient one instead would build a toast in the top document
  // for a container living in an iframe.
  const doc =
    explicitDocument === undefined
      ? /** @type {Document} */ (container.ownerDocument)
      : resolveDocument({ document: explicitDocument }, api);
  /** @type {Set<{ element: Element, instance: BootstrapInstanceLike, cleanup: () => void }>} */
  const live = new Set();
  let destroyed = false;

  /**
   * @param {Content} message
   * @param {BsToastShowOptions} [showOptions]
   * @returns {Element}
   */
  function show(message, showOptions = {}) {
    if (destroyed) throw new TypeError(`${api}: this manager has been destroyed`);
    assertPlainObject(showOptions, 'options', `${api}.show`);

    const {
      title,
      variant = defaultVariant,
      autoHideMs = defaultAutoHideMs,
      html,
      sanitize,
      ...unknownShow
    } = showOptions;
    assertNoUnknownOptions(unknownShow, `${api}.show`);
    if (variant !== undefined) assertToken(variant, 'options.variant', `${api}.show`);
    assertAutoHideMs(autoHideMs, `${api}.show`);

    // Resolved before anything is built, so a packaging failure leaves no
    // orphaned node in the container.
    const component = resolveComponent({ bootstrap }, `${api}.show`, 'Toast');
    const contentOptions = { html, sanitize };

    const el = doc.createElement('div');
    applyClasses(
      el,
      ['toast', variant !== undefined && `text-bg-${variant}`],
      extraClass,
      `${api}.show`,
    );
    // A warning or an error interrupts; anything else waits its turn. The pair
    // is what a screen reader acts on, so it is set from severity rather than
    // left to the caller (NFR-21).
    const assertive = variant === 'danger' || variant === 'warning';
    el.setAttribute('role', assertive ? 'alert' : 'status');
    el.setAttribute('aria-live', assertive ? 'assertive' : 'polite');
    el.setAttribute('aria-atomic', 'true');

    /**
     * The dismiss control, carrying the data-API attribute Bootstrap's Toast
     * listens for — set here rather than patched back on with a query, since
     * this code just built the node.
     *
     * @param {string} extraClass
     * @returns {Element}
     */
    const dismissButton = (extraClass) => {
      const button = bsCloseButton({ ariaLabel: closeLabel, class: extraClass, document: doc });
      button.setAttribute('data-bs-dismiss', 'toast');
      return button;
    };

    if (title !== undefined) {
      const header = doc.createElement('div');
      header.className = 'toast-header';
      const strong = doc.createElement('strong');
      strong.className = 'me-auto';
      renderContent(strong, title, contentOptions, `${api}.show`);
      header.append(strong);
      if (dismissible === true) header.append(dismissButton('ms-2'));
      el.append(header);
    }

    const body = doc.createElement('div');
    body.className = 'toast-body';
    renderContent(body, message, contentOptions, `${api}.show`);

    if (title === undefined && dismissible === true) {
      // Bootstrap's headerless layout: body and button side by side, the button
      // carrying the auto-margin the header's <strong> would otherwise provide.
      const wrapper = doc.createElement('div');
      wrapper.className = 'd-flex';
      wrapper.append(body);
      wrapper.append(dismissButton('me-2 m-auto'));
      el.append(wrapper);
    } else {
      el.append(body);
    }

    container.append(el);
    // Translated to Bootstrap's own pair at the boundary, which is the only
    // place that vocabulary belongs (ADR-0048).
    const instance = instantiate(component, el, {
      animation,
      autohide: autoHideMs !== false,
      ...(autoHideMs === false ? {} : { delay: autoHideMs }),
    });

    /** @type {{ element: Element, instance: BootstrapInstanceLike, cleanup: () => void }} */
    const record = { element: el, instance, cleanup: () => {} };
    const onHidden = () => {
      record.cleanup();
      live.delete(record);
      invoke(instance, 'dispose');
      el.remove();
    };
    el.addEventListener('hidden.bs.toast', onHidden);
    record.cleanup = () => el.removeEventListener('hidden.bs.toast', onHidden);
    live.add(record);

    invoke(instance, 'show');
    return el;
  }

  function hide() {
    // A copy: hiding may complete synchronously in a test double, and that
    // mutates `live` through the hidden handler while we are iterating it.
    for (const record of [...live]) invoke(record.instance, 'hide');
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    for (const record of [...live]) {
      record.cleanup();
      invoke(record.instance, 'dispose');
      record.element.remove();
    }
    live.clear();
    if (signal !== undefined) signal.removeEventListener('abort', destroy);
  }

  if (signal !== undefined) {
    if (signal.aborted) destroyed = true;
    else signal.addEventListener('abort', destroy);
  }

  return { show, hide, destroy };
}

/**
 * @typedef {object} BsModalOptions
 * @property {boolean | 'static'} [backdrop] - Bootstrap's own option.
 * @property {boolean} [keyboard] - Whether Escape closes.
 * @property {boolean} [focus] - Whether Bootstrap moves focus into the dialog.
 * @property {Record<string, unknown>} [bootstrap]
 * @property {AbortSignal} [signal] - Destroys the wrapper when aborted (NFR-15).
 */

/**
 * @typedef {object} BsModalInstance
 * @property {() => void} show
 * @property {() => void} hide
 * @property {() => void} toggle
 * @property {(event: string, handler: (event: Event) => void) => () => void} on
 * @property {() => BootstrapInstanceLike} instance - The Bootstrap instance,
 *   resolved on first access. The door out of the wrapper (ADR-0039's rule).
 * @property {Element} element
 * @property {() => void} destroy
 */

/**
 * A Bootstrap modal wrapper (spec 04 F70).
 *
 * The wrapper exists for the lifecycle, not the API surface: `show`/`hide`/
 * `toggle` are one line each, while `on` returning an unsubscribe and `destroy`
 * disposing **after** the dialog has actually closed are the parts that get
 * written wrong by hand. Disposing a shown modal leaves Bootstrap's backdrop
 * behind and the `<body>` locked — so `destroy` on a shown dialog hides it first
 * and disposes once `hidden.bs.modal` arrives.
 *
 * @example
 * const modal = bsModal(document.querySelector('#confirm'));
 * const off = modal.on('hidden', () => form.reset());
 * modal.show();
 *
 * @param {Element} target - The `.modal` element.
 * @param {BsModalOptions} [options]
 * @returns {BsModalInstance}
 * @throws {TypeError} On a malformed or unknown option or a non-Element target.
 * @throws {PeerMissingError} From the first operation, if `Modal` is unreachable.
 */
export function bsModal(target, options = {}) {
  const api = 'bsModal';
  if (!isElement(target)) {
    throw new TypeError(`${api}: target must be an Element`);
  }
  assertPlainObject(options, 'options', api);
  assertSignal(options, api);

  const { backdrop, keyboard, focus, bootstrap, signal, ...unknown } = options;
  assertNoUnknownOptions(unknown, api);
  /** @type {Record<string, unknown>} */
  const config = {};
  if (backdrop !== undefined) config.backdrop = backdrop;
  if (keyboard !== undefined) config.keyboard = keyboard;
  if (focus !== undefined) config.focus = focus;

  const wrapper = behaviourWrapper(
    target,
    { bootstrap, signal },
    {
      api,
      component: 'Modal',
      ns: 'bs.modal',
      config,
    },
  );
  // Spelled out rather than spread: F70 froze this surface, and `isShown` — which
  // the shared helper also offers — is not part of it.
  return {
    show: wrapper.show,
    hide: wrapper.hide,
    toggle: wrapper.toggle,
    on: wrapper.on,
    instance: wrapper.instance,
    element: wrapper.element,
    destroy: wrapper.destroy,
  };
}

/**
 * @typedef {object} BsLoadingOverlayOptions
 * @property {Element} [target] - An existing `.modal` element to drive. Without
 *   one the wrapper builds its own and removes it on `destroy`.
 * @property {Content} [message] - Text beside the spinner. Escaped by default.
 * @property {string} [spinnerLabel='Loading…'] - The spinner's status text
 *   (NFR-21).
 * @property {number} [minVisibleMs=400] - Passed to the F50 gate.
 * @property {import('./dom-components.js').OverlayFocusOptions} [focus]
 * @property {boolean} [html=false] - Treat `message` as markup.
 * @property {((html: string) => string) | false} [sanitize] - Required with
 *   `{ html: true }` (F52).
 * @property {ClassOption} [class] - Extra classes on the built modal.
 * @property {Record<string, unknown>} [bootstrap]
 * @property {AbortSignal} [signal]
 * @property {Document} [document]
 */

/**
 * A reference-counted loading overlay presented as a Bootstrap modal (spec 04
 * F71).
 *
 * The gate is F50's, unchanged and not reimplemented: reference counting, the
 * minimum-visible clock, focus save/restore, the idempotent release. This
 * wrapper supplies only the presentation pair — a static-backdrop,
 * keyboard-disabled modal holding a spinner — and resolves each hook's promise
 * on the matching Bootstrap lifecycle event. That last detail is what makes the
 * anti-flicker floor honest: the clock starts when the dialog has actually
 * finished appearing, not when `show()` was called.
 *
 * The peer is resolved in `show`/`wrap` **before** the gate is engaged. F50
 * contains a failing presentation hook by design (a presentation that cannot
 * render must not fail the operation it decorates, ADR-0032), so a missing peer
 * resolved inside `onShow` would be swallowed into a silent no-overlay. Resolved
 * at the call, it surfaces as `EGL_PEER_MISSING` where the caller can see it —
 * NFR-18's promise beats the containment rule here, and only here.
 *
 * @example
 * const overlay = bsLoadingOverlay({ message: 'Caricamento…' });
 * await overlay.wrap(() => api.get('/slow'));
 *
 * @param {BsLoadingOverlayOptions} [options]
 * @returns {LoadingOverlayInstance}
 * @throws {TypeError} On a malformed or unknown option.
 * @throws {DomContractError} If there is no document to build in.
 * @throws {PeerMissingError} From `show`/`wrap`, if `Modal` is unreachable.
 */
export function bsLoadingOverlay(options = {}) {
  const api = 'bsLoadingOverlay';
  assertPlainObject(options, 'options', api);
  assertSignal(options, api);

  const {
    target,
    message,
    spinnerLabel = 'Loading…',
    minVisibleMs,
    focus,
    html,
    sanitize,
    signal,
    bootstrap,
    class: extraClass,
    document: explicitDocument,
    ...unknown
  } = options;
  assertNoUnknownOptions(unknown, api);

  if (target !== undefined && !isElement(target)) {
    throw new TypeError(`${api}: options.target must be an Element`);
  }

  const doc = resolveDocument({ document: explicitDocument }, api);
  const owned = target === undefined;
  const element = owned ? buildOverlayElement() : /** @type {Element} */ (target);

  /**
   * The modal Bootstrap will drive, built to its documented markup.
   *
   * @returns {Element}
   */
  function buildOverlayElement() {
    const el = doc.createElement('div');
    applyClasses(el, ['modal', 'fade'], extraClass, api);
    el.setAttribute('tabindex', '-1');
    el.setAttribute('aria-hidden', 'true');

    const dialog = doc.createElement('div');
    dialog.className = 'modal-dialog modal-dialog-centered modal-sm';
    const content = doc.createElement('div');
    content.className = 'modal-content';
    const body = doc.createElement('div');
    body.className = 'modal-body text-center';

    body.append(bsSpinner({ ariaLabel: spinnerLabel, document: doc }));
    if (message !== undefined) {
      const text = doc.createElement('div');
      text.className = 'mt-2';
      appendContent(text, message, { html, sanitize }, api);
      body.append(text);
    }

    content.append(body);
    dialog.append(content);
    el.append(dialog);
    return el;
  }

  /** @type {BootstrapInstanceLike | undefined} */
  let resolved;

  function instance() {
    if (resolved === undefined) {
      if (owned && element.parentNode === null) doc.body.append(element);
      resolved = instantiate(resolveComponent({ bootstrap }, api, 'Modal'), element, {
        backdrop: 'static',
        keyboard: false,
      });
    }
    return resolved;
  }

  /**
   * Run a Bootstrap show/hide and settle when the transition has finished.
   *
   * @param {'show' | 'hide'} method
   * @param {string} settledEvent
   * @returns {Promise<void>}
   */
  function transition(method, settledEvent) {
    return new Promise((resolve) => {
      const done = () => {
        element.removeEventListener(settledEvent, done);
        resolve();
      };
      element.addEventListener(settledEvent, done);
      invoke(instance(), method);
    });
  }

  const gate = loadingOverlay({
    onShow: () => transition('show', 'shown.bs.modal'),
    onHide: () => transition('hide', 'hidden.bs.modal'),
    ...(minVisibleMs === undefined ? {} : { minVisibleMs }),
    focus: { ...focus, root: focus?.root ?? element },
  });

  function destroy() {
    gate.destroy();
    const current = resolved;
    resolved = undefined;
    if (current !== undefined) invoke(current, 'dispose');
    if (owned) element.remove();
    if (signal !== undefined) signal.removeEventListener('abort', destroy);
  }

  if (signal !== undefined) {
    if (signal.aborted) destroy();
    else signal.addEventListener('abort', destroy);
  }

  return {
    show: () => {
      // Ahead of the gate: see the note on containment above.
      instance();
      return gate.show();
    },
    wrap: (operation) => {
      instance();
      return gate.wrap(operation);
    },
    isShown: gate.isShown,
    destroy,
  };
}
