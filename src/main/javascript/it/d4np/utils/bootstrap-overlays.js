/**
 * egl-utils-js — the Bootstrap overlay and observation set: offcanvas, carousel,
 * scrollspy (spec 04 §2 items F77-F79, ADR-0043).
 *
 * Three components that look like a group and are not one, which is the
 * interesting thing about them:
 *
 * - `bsOffcanvas` is a **wrapper** in the exact shape the shared lifecycle
 *   already models — open, closed, closed-before-disposed — so it is a
 *   configuration of {@link module:egl-utils-js/bootstrap behaviourWrapper} and
 *   nothing more.
 * - `bsCarousel` is a **manager**: it builds slides, controls and indicators, so
 *   it inherits the F52 escape contract and the id discipline of ADR-0042 — an
 *   indicator that does not name the slide it moves to is a button announcing
 *   nothing.
 * - `bsScrollspy` is **neither**. It has no open state, no `show`, no `hide` and
 *   no `hidden` event; it observes a scroll container and marks a nav. Forcing
 *   it into the wrapper would have meant three methods that throw and two events
 *   that never fire, so it is written plainly instead.
 *
 * @module egl-utils-js/bootstrap
 */

import { isElement } from './dom-helpers.js';
import { assertNoUnknownOptions } from './option-keys.js';
import {
  applyClasses,
  appendContent,
  assertPlainObject,
  documentOf,
  renderContent,
  uniqueId,
} from './bootstrap-elements.js';
import {
  assertSignal,
  behaviourWrapper,
  instantiate,
  invoke,
  qualifyEvent,
  resolveComponent,
} from './bootstrap-behaviors.js';

/**
 * @typedef {import('./bootstrap-elements.js').Content} Content
 * @typedef {import('./bootstrap-elements.js').ClassOption} ClassOption
 * @typedef {import('./bootstrap-behaviors.js').BootstrapInstanceLike} BootstrapInstanceLike
 * @typedef {import('./bootstrap-behaviors.js').BehaviourWrapper} BehaviourWrapper
 */

/**
 * @typedef {object} BsOffcanvasOptions
 * @property {boolean} [backdrop] - Bootstrap's own option; `'static'` is also
 *   accepted by Bootstrap and passed through unchanged.
 * @property {boolean} [scroll] - Whether the body scrolls while open.
 * @property {boolean} [keyboard] - Whether Escape closes.
 * @property {Record<string, unknown>} [bootstrap]
 * @property {AbortSignal} [signal]
 */

/**
 * A Bootstrap offcanvas wrapper (spec 04 F77).
 *
 * The same lifecycle a modal has — it opens, it closes, and disposing it while
 * open strands a backdrop — so it is the shared wrapper with a different
 * component name, and gets the close-then-dispose teardown for free.
 *
 * @example
 * const drawer = bsOffcanvas(document.querySelector('#filters'));
 * drawer.show();
 *
 * @param {Element} target - The `.offcanvas` element.
 * @param {BsOffcanvasOptions} [options]
 * @returns {BehaviourWrapper}
 * @throws {TypeError} On a malformed or unknown option or a non-Element target.
 * @throws {PeerMissingError} From the first operation, if `Offcanvas` is unreachable.
 */
export function bsOffcanvas(target, options = {}) {
  const api = 'bsOffcanvas';
  if (!isElement(target)) {
    throw new TypeError(`${api}: target must be an Element`);
  }
  assertPlainObject(options, 'options', api);
  assertSignal(options, api);

  const { backdrop, scroll, keyboard, bootstrap, signal, ...unknown } = options;
  assertNoUnknownOptions(unknown, api);
  /** @type {Record<string, unknown>} */
  const config = {};
  if (backdrop !== undefined) config.backdrop = backdrop;
  if (scroll !== undefined) config.scroll = scroll;
  if (keyboard !== undefined) config.keyboard = keyboard;

  return behaviourWrapper(
    target,
    { bootstrap, signal },
    {
      api,
      component: 'Offcanvas',
      ns: 'bs.offcanvas',
      config,
    },
  );
}

/**
 * @typedef {object} BsCarouselItem
 * @property {Content} content - The slide's content. With `alt` present this is
 *   instead an **image source string** and the slide renders an `<img>`.
 * @property {string} [alt] - Declaring an image. `''` is legitimate and means
 *   decorative; its **absence** means `content` is ordinary content, not an
 *   image — so an image can never reach the page unlabelled (the F61 rule).
 * @property {Content} [caption]
 * @property {boolean} [active=false]
 */

/**
 * @typedef {object} BsCarouselLabels
 * @property {string} [previous='Previous'] - Accessible name of the prev control.
 * @property {string} [next='Next']
 * @property {(index: number, total: number) => string} [slide] - Accessible name
 *   of an indicator. Defaults to the slide's number — digits, so nothing English
 *   is rendered unasked (NFR-21).
 */

/**
 * @typedef {object} BsCarouselOptions
 * @property {BsCarouselItem[]} [items] - Build the structure. Omit to adopt
 *   existing `.carousel-item` markup.
 * @property {boolean} [controls=true] - Render prev/next controls.
 * @property {boolean} [indicators=false] - Render the indicator row.
 * @property {number | false} [interval] - Bootstrap's autoplay interval.
 * @property {boolean | 'carousel'} [ride] - Bootstrap's `ride`.
 * @property {boolean} [wrap] - Whether it cycles past the end.
 * @property {boolean} [fade=false] - Cross-fade instead of slide.
 * @property {boolean} [touch] - Bootstrap's swipe support.
 * @property {BsCarouselLabels} [labels]
 * @property {boolean} [html=false]
 * @property {((html: string) => string) | false} [sanitize]
 * @property {ClassOption} [class]
 * @property {Record<string, unknown>} [bootstrap]
 * @property {AbortSignal} [signal]
 * @property {Document} [document]
 */

/**
 * @typedef {object} BsCarouselInstance
 * @property {(index: number) => void} to
 * @property {() => void} prev
 * @property {() => void} next
 * @property {() => void} cycle
 * @property {() => void} pause
 * @property {(event: string, handler: (event: Event) => void) => () => void} on
 * @property {() => BootstrapInstanceLike} instance
 * @property {Element} element
 * @property {() => void} destroy
 */

/**
 * A Bootstrap carousel (spec 04 F78).
 *
 * Given `items` it builds the slides and, on request, the controls and the
 * indicator row — each indicator naming the slide it moves to, which is the
 * whole reason to build rather than to hand-write: a row of unlabelled buttons
 * is what a carousel usually ships with, and it announces nothing.
 *
 * Autoplay is **off unless asked for**. Bootstrap's markup default (`data-bs-ride`)
 * starts a carousel moving on its own, which is a motion-accessibility decision
 * this library will not make for a caller.
 *
 * @example
 * const gallery = bsCarousel(container, {
 *   items: [
 *     { content: '/one.jpg', alt: 'A harbour at dawn', active: true },
 *     { content: '/two.jpg', alt: '' },            // decorative, declared
 *   ],
 *   indicators: true,
 *   labels: { previous: 'Precedente', next: 'Successiva' },
 * });
 * gallery.next();
 *
 * @param {Element} container
 * @param {BsCarouselOptions} [options]
 * @returns {BsCarouselInstance}
 * @throws {TypeError} On a malformed or unknown option, or an image item whose `alt` is not a string.
 * @throws {PeerMissingError} From the first operation, if `Carousel` is unreachable.
 */
export function bsCarousel(container, options = {}) {
  const api = 'bsCarousel';
  if (!isElement(container)) {
    throw new TypeError(`${api}: container must be an Element`);
  }
  assertPlainObject(options, 'options', api);
  assertSignal(options, api);

  const {
    items,
    controls = true,
    indicators = false,
    interval,
    ride,
    wrap,
    fade = false,
    touch,
    labels = {},
    html,
    sanitize,
    signal,
    bootstrap,
    class: extraClass,
    document: explicitDocument,
    ...unknown
  } = options;
  assertNoUnknownOptions(unknown, api);
  if (items !== undefined && !Array.isArray(items)) {
    throw new TypeError(`${api}: options.items must be an array`);
  }
  assertPlainObject(labels, 'options.labels', api);

  const {
    previous: previousLabel = 'Previous',
    next: nextLabel = 'Next',
    slide: slideLabel = (index) => String(index + 1),
  } = labels;
  if (typeof slideLabel !== 'function') {
    throw new TypeError(`${api}: options.labels.slide must be a function`);
  }

  const doc = documentOf(container, { document: explicitDocument }, api);
  const contentOptions = { html, sanitize };
  /** @type {Element} */
  let root;

  if (items === undefined) {
    root = container;
    if (root.id === '') root.id = uniqueId(doc, 'egl-carousel');
  } else {
    /** @type {Set<string>} */
    const reserved = new Set();
    root = doc.createElement('div');
    applyClasses(root, ['carousel', 'slide', fade === true && 'carousel-fade'], extraClass, api);
    root.id = uniqueId(doc, 'egl-carousel', reserved);

    const inner = doc.createElement('div');
    inner.className = 'carousel-inner';
    const slides = doc.createDocumentFragment();
    const indicatorRow = doc.createElement('div');
    indicatorRow.className = 'carousel-indicators';

    for (const [index, item] of items.entries()) {
      if (item === null || typeof item !== 'object') {
        throw new TypeError(`${api}: items[${index}] must be { content, alt?, caption?, active? }`);
      }
      const active = item.active === true;

      const slide = doc.createElement('div');
      applyClasses(slide, ['carousel-item', active && 'active'], undefined, api);

      if (item.alt === undefined) {
        appendContent(slide, item.content, contentOptions, api);
      } else {
        // `alt` is what declares this an image, and it is required the moment it
        // does — an image whose alt is merely forgotten reads its file name
        // aloud (the F61 rule, applied here).
        if (typeof item.alt !== 'string') {
          throw new TypeError(
            `${api}: items[${index}].alt must be a string — pass '' to declare the image decorative`,
          );
        }
        if (typeof item.content !== 'string' || item.content === '') {
          throw new TypeError(
            `${api}: items[${index}].content must be an image source string when alt is given`,
          );
        }
        const img = doc.createElement('img');
        img.className = 'd-block w-100';
        img.setAttribute('src', item.content);
        img.setAttribute('alt', item.alt);
        slide.append(img);
      }

      if (item.caption !== undefined) {
        const caption = doc.createElement('div');
        caption.className = 'carousel-caption d-none d-md-block';
        appendContent(caption, item.caption, contentOptions, api);
        slide.append(caption);
      }
      slides.append(slide);

      if (indicators === true) {
        const button = doc.createElement('button');
        button.setAttribute('type', 'button');
        button.setAttribute('data-bs-target', `#${root.id}`);
        button.setAttribute('data-bs-slide-to', String(index));
        // The reason this manager builds: an indicator row is otherwise a line
        // of identical unlabelled buttons.
        button.setAttribute('aria-label', slideLabel(index, items.length));
        if (active) {
          button.className = 'active';
          button.setAttribute('aria-current', 'true');
        }
        indicatorRow.append(button);
      }
    }

    inner.append(slides);
    if (indicators === true) root.append(indicatorRow);
    root.append(inner);

    if (controls === true) {
      for (const [direction, label] of [
        ['prev', previousLabel],
        ['next', nextLabel],
      ]) {
        if (typeof label !== 'string' || label === '') {
          throw new TypeError(`${api}: options.labels.${direction} must be a non-empty string`);
        }
        const button = doc.createElement('button');
        button.className = `carousel-control-${direction}`;
        button.setAttribute('type', 'button');
        button.setAttribute('data-bs-target', `#${root.id}`);
        button.setAttribute('data-bs-slide', direction);
        const icon = doc.createElement('span');
        icon.className = `carousel-control-${direction}-icon`;
        icon.setAttribute('aria-hidden', 'true');
        const name = doc.createElement('span');
        name.className = 'visually-hidden';
        renderContent(name, label, {}, api);
        button.append(icon);
        button.append(name);
        root.append(button);
      }
    }

    container.append(root);
  }

  /** @type {Record<string, unknown>} */
  const config = {};
  if (interval !== undefined) config.interval = interval;
  if (ride !== undefined) config.ride = ride;
  if (wrap !== undefined) config.wrap = wrap;
  if (touch !== undefined) config.touch = touch;

  /** @type {BootstrapInstanceLike | undefined} */
  let resolved;
  /** @type {Array<() => void>} */
  const subscriptions = [];
  let destroyed = false;

  function instance() {
    if (destroyed) throw new TypeError(`${api}: this manager has been destroyed`);
    if (resolved === undefined) {
      resolved = instantiate(resolveComponent({ bootstrap }, api, 'Carousel'), root, config);
    }
    return resolved;
  }

  /**
   * @param {'prev' | 'next' | 'cycle' | 'pause'} method
   * @returns {void}
   */
  function call(method) {
    const current = instance();
    const fn = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (current))[method];
    if (typeof fn === 'function') fn.call(current);
  }

  /**
   * @param {string} event
   * @param {(event: Event) => void} handler
   * @returns {() => void}
   */
  function on(event, handler) {
    if (destroyed) throw new TypeError(`${api}: this manager has been destroyed`);
    if (typeof handler !== 'function') {
      throw new TypeError(`${api}: handler must be a function`);
    }
    const name = qualifyEvent(event, 'bs.carousel', api);
    root.addEventListener(name, handler);
    let off = () => {
      root.removeEventListener(name, handler);
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
    const current = resolved;
    resolved = undefined;
    if (current !== undefined) invoke(current, 'dispose');
    if (items !== undefined) root.remove();
    if (signal !== undefined) signal.removeEventListener('abort', destroy);
  }

  if (signal !== undefined) {
    if (signal.aborted) destroy();
    else signal.addEventListener('abort', destroy);
  }

  return {
    to: (index) => {
      if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) {
        throw new TypeError(`${api}: index must be a non-negative integer`);
      }
      const current = instance();
      const fn = /** @type {{ to?: unknown }} */ (current).to;
      if (typeof fn === 'function') fn.call(current, index);
    },
    prev: () => call('prev'),
    next: () => call('next'),
    cycle: () => call('cycle'),
    pause: () => call('pause'),
    on,
    instance,
    element: root,
    destroy,
  };
}

/**
 * @typedef {object} BsScrollspyOptions
 * @property {Element | string} [nav] - The nav whose links are marked active,
 *   as Bootstrap's `target` config. Added in 16.2's successor because without it
 *   ScrollSpy has nothing to highlight.
 * @property {string} [rootMargin] - Bootstrap's observer margin.
 * @property {boolean} [smoothScroll] - Whether clicking a link scrolls smoothly.
 * @property {string} [threshold] - Bootstrap's observer thresholds.
 * @property {Record<string, unknown>} [bootstrap]
 * @property {AbortSignal} [signal]
 */

/**
 * @typedef {object} BsScrollspyInstance
 * @property {() => void} refresh - Recompute the observed targets, after the
 *   spied content changed.
 * @property {(event: string, handler: (event: Event) => void) => () => void} on
 * @property {() => BootstrapInstanceLike} instance
 * @property {Element} element
 * @property {() => void} destroy
 */

/**
 * A Bootstrap scrollspy wrapper (spec 04 F79).
 *
 * The one component in this wave with no open state: it observes a scroll
 * container and marks the matching nav link, emitting `activate.bs.scrollspy` as
 * it goes. So it has no `show`, no `hide`, and no closed-before-disposed
 * teardown — writing it plainly is smaller and more honest than a shared shape
 * with three methods that would throw.
 *
 * `refresh()` is the method worth having: ScrollSpy computes its targets once,
 * so content added afterwards is invisible to it until told.
 *
 * @example
 * const spy = bsScrollspy(document.body, { nav: '#toc', smoothScroll: true });
 * const off = spy.on('activate', (event) => history.replaceState(null, '', event.relatedTarget.hash));
 *
 * @param {Element} target - The scrollable element being spied on.
 * @param {BsScrollspyOptions} [options]
 * @returns {BsScrollspyInstance}
 * @throws {TypeError} On a malformed or unknown option or a non-Element target.
 * @throws {PeerMissingError} From the first operation, if `ScrollSpy` is unreachable.
 */
export function bsScrollspy(target, options = {}) {
  const api = 'bsScrollspy';
  if (!isElement(target)) {
    throw new TypeError(`${api}: target must be an Element`);
  }
  assertPlainObject(options, 'options', api);
  assertSignal(options, api);

  const { nav, rootMargin, smoothScroll, threshold, signal, bootstrap, ...unknown } = options;
  assertNoUnknownOptions(unknown, api);
  if (nav !== undefined && typeof nav !== 'string' && !isElement(nav)) {
    throw new TypeError(`${api}: options.nav must be an Element or a selector string`);
  }

  /** @type {Record<string, unknown>} */
  const config = {};
  if (nav !== undefined) config.target = nav;
  if (rootMargin !== undefined) config.rootMargin = rootMargin;
  if (smoothScroll !== undefined) config.smoothScroll = smoothScroll;
  if (threshold !== undefined) config.threshold = threshold;

  /** @type {BootstrapInstanceLike | undefined} */
  let resolved;
  /** @type {Array<() => void>} */
  const subscriptions = [];
  let destroyed = false;

  function instance() {
    if (destroyed) throw new TypeError(`${api}: this wrapper has been destroyed`);
    if (resolved === undefined) {
      resolved = instantiate(resolveComponent({ bootstrap }, api, 'ScrollSpy'), target, config);
    }
    return resolved;
  }

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
    const name = qualifyEvent(event, 'bs.scrollspy', api);
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
    const current = resolved;
    resolved = undefined;
    if (current !== undefined) invoke(current, 'dispose');
    if (signal !== undefined) signal.removeEventListener('abort', destroy);
  }

  if (signal !== undefined) {
    if (signal.aborted) destroyed = true;
    else signal.addEventListener('abort', destroy);
  }

  return {
    refresh: () => {
      const current = instance();
      const fn = /** @type {{ refresh?: unknown }} */ (current).refresh;
      if (typeof fn === 'function') fn.call(current);
    },
    on,
    instance,
    element: target,
    destroy,
  };
}
