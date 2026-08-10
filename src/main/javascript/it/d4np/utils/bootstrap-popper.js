/**
 * egl-utils-js — the Popper-backed overlays: tooltip and popover (spec 04 §2
 * items F80-F81, ADR-0044). The last two components of the Bootstrap 5 catalogue.
 *
 * These two differ from everything before them in exactly two ways, and both are
 * the whole content of this file:
 *
 * - **They need a second peer.** Bootstrap's tooltips and popovers are positioned
 *   by `@popperjs/core`, which the `bootstrap.bundle` build includes and the
 *   plain `bootstrap` build does not. There is no reliable global to probe for —
 *   a bundled Popper is not exposed anywhere — so absence is detected the only
 *   honest way available: Bootstrap says so itself, at the first `show`, and that
 *   diagnostic is translated into this library's typed failure naming the package
 *   the caller actually has to install.
 * - **They hand content to a third-party renderer.** Every other builder in this
 *   toolkit writes its own nodes; these two pass a string to Bootstrap, which
 *   decides whether to parse it. So the escape contract needs one extra rule —
 *   **one sanitizer, the caller's** — because two half-trusted passes is not
 *   twice the safety, it is an unclear boundary with no owner.
 *
 * @module egl-utils-js/bootstrap
 */

import { PeerMissingError } from './errors.js';
import { isElement } from './dom-helpers.js';
import { assertNoUnknownOptions } from './option-keys.js';
import { assertPlainObject, assertToken } from './bootstrap-elements.js';
import { assertSignal, behaviourWrapper } from './bootstrap-behaviors.js';

/**
 * @typedef {import('./bootstrap-behaviors.js').BootstrapInstanceLike} BootstrapInstanceLike
 * @typedef {import('./bootstrap-behaviors.js').BehaviourWrapper} BehaviourWrapper
 */

const POPPER = '@popperjs/core';

/**
 * Run an operation, translating Bootstrap's own "requires Popper" complaint into
 * this library's typed failure (spec 04 F68).
 *
 * Bootstrap raises a plain `TypeError` naming a documentation URL, from inside
 * `show()` rather than from the constructor — so there is nothing to check up
 * front, and probing for a global would be guesswork besides: the bundle build
 * keeps Popper private. Translating the message is therefore not a shortcut, it
 * is the only detection available, and it converts a stray platform error into
 * the `EGL_PEER_MISSING` contract every other wrapper on this entry keeps.
 *
 * Anything else the operation throws passes through untouched: mistranslating an
 * unrelated failure into a packaging one would send the caller to the wrong fix.
 *
 * @template T
 * @param {string} api
 * @param {() => T} operation
 * @returns {T}
 * @throws {PeerMissingError} If Bootstrap reports Popper missing.
 */
function withPopperDiagnostic(api, operation) {
  try {
    return operation();
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (!/popper/i.test(message)) throw error;
    throw new PeerMissingError(
      `${api} needs Popper, which Bootstrap positions tooltips and popovers with: ` +
        `install ${POPPER} alongside the bootstrap peer, or load Bootstrap's ` +
        '`bootstrap.bundle` build, which carries it.',
      { peer: POPPER, cause: error },
    );
  }
}

/**
 * Prepare one piece of content for Bootstrap, and say how Bootstrap must treat it.
 *
 * The rule this encodes (spec 04 F80): a plain string is handed over with
 * Bootstrap's `html: false`, so Bootstrap writes it as text and no sanitizer is
 * involved on either side. Markup requires the F52 `{html: true, sanitize}` pair,
 * and is sanitized **here, by the caller's sanitizer, before Bootstrap sees it** —
 * after which Bootstrap's own allowlist is switched off. One pass, one owner. Two
 * sanitizers would mean neither is the boundary, and the caller's carefully
 * configured profile would be silently narrowed by a second one they never chose.
 *
 * @param {unknown} value
 * @param {{ html?: boolean, sanitize?: ((html: string) => string) | false }} options
 * @param {string} name - Option path, for the message.
 * @param {string} api
 * @returns {string | Element | undefined}
 * @throws {TypeError} If the value is not a string or element, if `html` is set
 *   without `sanitize`, or if the sanitizer does not return a string.
 */
function prepareContent(value, options, name, api) {
  if (value === undefined) return undefined;
  // An element is handed over as-is: the caller built it, and Bootstrap inserts
  // it without parsing anything.
  if (isElement(value)) return /** @type {Element} */ (value);
  if (typeof value !== 'string') {
    throw new TypeError(`${api}: ${name} must be a string or an Element`);
  }

  const { html = false, sanitize } = options;
  if (html !== true) return value;
  if (sanitize === undefined) {
    throw new TypeError(
      `${api}: options.sanitize is required with { html: true } — pass a sanitizer ` +
        '(sanitizeHtml from egl-utils-js/sanitize fits) or false. There is no default.',
    );
  }
  if (sanitize !== false && typeof sanitize !== 'function') {
    throw new TypeError(`${api}: options.sanitize must be a function or false`);
  }
  const markup = sanitize === false ? value : sanitize(value);
  if (typeof markup !== 'string') {
    throw new TypeError(`${api}: the sanitizer must return a string`);
  }
  return markup;
}

/**
 * @typedef {object} PopperOverlayOptions
 * @property {'auto' | 'top' | 'bottom' | 'left' | 'right' | string} [placement]
 * @property {string} [trigger] - Bootstrap's trigger list, e.g. `'click'` or
 *   `'hover focus'`.
 * @property {Element | string | false} [container] - Where the tip is appended;
 *   `'body'` is the usual answer for a tip inside an overflow-hidden ancestor.
 * @property {number | string | { top?: number, left?: number }} [offset]
 * @property {number | { show: number, hide: number }} [delay]
 * @property {string} [customClass]
 * @property {boolean} [animation]
 * @property {string[]} [fallbackPlacements]
 * @property {Element | string} [boundary]
 * @property {boolean} [html=false] - Treat string content as markup.
 * @property {((html: string) => string) | false} [sanitize] - Required with
 *   `{ html: true }`. **The only sanitizer that runs** (F80).
 * @property {Record<string, unknown>} [bootstrap]
 * @property {AbortSignal} [signal]
 */

/**
 * @typedef {PopperOverlayOptions & { title?: string | Element }} BsTooltipOptions
 */

/**
 * @typedef {PopperOverlayOptions & { title?: string | Element, content?: string | Element }} BsPopoverOptions
 */

/**
 * @typedef {object} PopperOverlayInstance
 * @property {() => void} show
 * @property {() => void} hide
 * @property {() => void} toggle
 * @property {() => void} enable
 * @property {() => void} disable
 * @property {() => void} toggleEnabled
 * @property {() => void} update - Recompute the position, after the anchor moved.
 * @property {(next: { title?: string | Element, content?: string | Element }) => void} setContent
 *   Replace the tip's slots. `content` belongs to a popover only; passing it to a
 *   tooltip is a `TypeError` rather than a silent no-op.
 * @property {(event: string, handler: (event: Event) => void) => () => void} on
 * @property {() => BootstrapInstanceLike} instance
 * @property {Element} element
 * @property {() => boolean} isShown - Whether the tip is up, read from
 *   Bootstrap's own events (ADR-0049: anything with `show`/`hide` answers this).
 * @property {() => void} destroy
 */

/**
 * Shared construction for the two Popper-backed overlays.
 *
 * @param {Element} target
 * @param {BsPopoverOptions} options
 * @param {object} spec
 * @param {string} spec.api
 * @param {'Tooltip' | 'Popover'} spec.component
 * @param {string} spec.ns
 * @param {(prepared: { title?: string | Element, content?: string | Element }) => Record<string, unknown>} spec.slots
 *   Maps prepared content onto the selectors `setContent` addresses.
 * @param {boolean} spec.hasContent - Whether `content` is part of this surface.
 * @returns {PopperOverlayInstance}
 */
function popperOverlay(target, options, spec) {
  const { api, component, ns, slots, hasContent } = spec;
  if (!isElement(target)) {
    throw new TypeError(`${api}: target must be an Element`);
  }
  assertPlainObject(options, 'options', api);
  assertSignal(options, api);

  const {
    title,
    content,
    placement,
    trigger,
    container,
    offset,
    delay,
    customClass,
    animation,
    fallbackPlacements,
    boundary,
    html = false,
    sanitize,
    bootstrap,
    signal,
    ...unknown
  } = options;
  assertNoUnknownOptions(unknown, api);

  if (placement !== undefined) assertToken(placement, 'options.placement', api);
  if (customClass !== undefined && typeof customClass !== 'string') {
    throw new TypeError(`${api}: options.customClass must be a string`);
  }
  if (trigger !== undefined && typeof trigger !== 'string') {
    throw new TypeError(`${api}: options.trigger must be a string`);
  }
  if (!hasContent && content !== undefined) {
    throw new TypeError(`${api}: options.content is not part of a tooltip — use title`);
  }

  const contentOptions = { html, sanitize };
  const preparedTitle = prepareContent(title, contentOptions, 'options.title', api);
  const preparedContent = hasContent
    ? prepareContent(content, contentOptions, 'options.content', api)
    : undefined;

  /** @type {Record<string, unknown>} */
  const config = {};
  if (preparedTitle !== undefined) config.title = preparedTitle;
  if (preparedContent !== undefined) config.content = preparedContent;
  if (placement !== undefined) config.placement = placement;
  if (trigger !== undefined) config.trigger = trigger;
  if (container !== undefined) config.container = container;
  if (offset !== undefined) config.offset = offset;
  if (delay !== undefined) config.delay = delay;
  if (customClass !== undefined) config.customClass = customClass;
  if (animation !== undefined) config.animation = animation;
  if (fallbackPlacements !== undefined) config.fallbackPlacements = fallbackPlacements;
  if (boundary !== undefined) config.boundary = boundary;
  // The two halves of the one-sanitizer rule, always set together: markup has
  // already been through the caller's sanitizer by the time it reaches here, so
  // Bootstrap must neither escape it nor re-filter it.
  if (html === true) {
    config.html = true;
    config.sanitize = false;
  }

  const wrapper = behaviourWrapper(target, { bootstrap, signal }, { api, component, ns, config });

  /**
   * @param {'enable' | 'disable' | 'toggleEnabled' | 'update'} method
   * @returns {void}
   */
  function call(method) {
    withPopperDiagnostic(api, () => {
      const instance = wrapper.instance(method);
      const fn = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (instance))[method];
      if (typeof fn === 'function') fn.call(instance);
    });
  }

  return {
    // Every path that can reach Popper carries the translation: Bootstrap raises
    // its complaint from inside show(), not from the constructor.
    show: () => withPopperDiagnostic(api, wrapper.show),
    hide: () => withPopperDiagnostic(api, wrapper.hide),
    toggle: () => withPopperDiagnostic(api, wrapper.toggle),
    enable: () => call('enable'),
    disable: () => call('disable'),
    toggleEnabled: () => call('toggleEnabled'),
    update: () => call('update'),
    /**
     * Replace the tip's content, under the same one-sanitizer rule as construction.
     *
     * @param {{ title?: string | Element, content?: string | Element }} next
     * @returns {void}
     */
    setContent: (next) => {
      assertPlainObject(next, 'content', `${api}.setContent`);
      if (!hasContent && next.content !== undefined) {
        throw new TypeError(`${api}.setContent: content is not part of a tooltip — use title`);
      }
      const prepared = {
        ...(next.title === undefined
          ? {}
          : { title: prepareContent(next.title, contentOptions, 'title', `${api}.setContent`) }),
        ...(next.content === undefined
          ? {}
          : {
              content: prepareContent(next.content, contentOptions, 'content', `${api}.setContent`),
            }),
      };
      withPopperDiagnostic(api, () => {
        const instance = wrapper.instance('setContent');
        const fn = /** @type {{ setContent?: unknown }} */ (instance).setContent;
        if (typeof fn !== 'function') return;
        const apply = () => fn.call(instance, slots(prepared));

        // On a hidden tip Bootstrap applies this cleanly. On a **shown** one it
        // removes the tip and does not put it back — measured against Bootstrap
        // directly, with no wrapper involved, so it is its behaviour and not
        // ours. Replacing content while a tip is up is a natural thing to ask
        // for and a caller means "change what this says", never "close it", so
        // the change is sequenced instead: hide, replace once the tip is
        // actually gone, show again. The same hide-then-act idiom `destroy`
        // uses, and for the same reason — acting mid-transition is what breaks.
        if (!wrapper.isShown()) {
          apply();
          return;
        }
        const onHidden = () => {
          target.removeEventListener(`hidden.${ns}`, onHidden);
          apply();
          wrapper.show();
        };
        target.addEventListener(`hidden.${ns}`, onHidden);
        wrapper.hide();
      });
    },
    on: wrapper.on,
    instance: () => wrapper.instance(),
    element: wrapper.element,
    isShown: wrapper.isShown,
    destroy: wrapper.destroy,
  };
}

/**
 * A Bootstrap tooltip (spec 04 F80).
 *
 * @example
 * const tip = bsTooltip(button, { title: 'Save the current draft' });
 * tip.show();
 *
 * @example
 * // Markup needs the explicit pair, and the caller's sanitizer is the only one
 * // that runs — Bootstrap's own allowlist is switched off for this content.
 * import { sanitizeHtml } from 'egl-utils-js/sanitize';
 * bsTooltip(el, { title: '<b>Bold</b> hint', html: true, sanitize: sanitizeHtml });
 *
 * @param {Element} target
 * @param {BsTooltipOptions} [options]
 * @returns {PopperOverlayInstance}
 * @throws {TypeError} On a malformed or unknown option, or `{html: true}` without `sanitize`.
 * @throws {PeerMissingError} From the first operation, if `Tooltip` or Popper is unreachable.
 */
export function bsTooltip(target, options = {}) {
  return popperOverlay(target, options, {
    api: 'bsTooltip',
    component: 'Tooltip',
    ns: 'bs.tooltip',
    hasContent: false,
    slots: (prepared) => ({ '.tooltip-inner': prepared.title }),
  });
}

/**
 * A Bootstrap popover (spec 04 F81).
 *
 * The same contract as {@link bsTooltip}, over two slots rather than one: a
 * popover has a header and a body, and both obey the one-sanitizer rule.
 *
 * @example
 * const help = bsPopover(button, {
 *   title: 'Draft saved',
 *   content: 'Your changes are kept locally until you publish.',
 *   trigger: 'focus',
 * });
 *
 * @param {Element} target
 * @param {BsPopoverOptions} [options]
 * @returns {PopperOverlayInstance}
 * @throws {TypeError} On a malformed or unknown option, or `{html: true}` without `sanitize`.
 * @throws {PeerMissingError} From the first operation, if `Popover` or Popper is unreachable.
 */
export function bsPopover(target, options = {}) {
  return popperOverlay(target, options, {
    api: 'bsPopover',
    component: 'Popover',
    ns: 'bs.popover',
    hasContent: true,
    slots: (prepared) => ({
      '.popover-header': prepared.title,
      '.popover-body': prepared.content,
    }),
  });
}
