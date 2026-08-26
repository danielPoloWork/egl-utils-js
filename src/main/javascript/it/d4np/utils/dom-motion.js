/**
 * egl-utils-js/dom — one reduced-motion query point (spec 07 §2 item F111).
 *
 * **A helper, not a manager.** ADR-0046 triaged and rejected a `MotionManager` —
 * an animation-preset system that would have let a caller register named
 * transitions and durations and have this library choose among them. That is
 * design-system territory, and this library does not have one: `bsCarousel`
 * takes `fade` as a boolean, `bsCollapse` takes Bootstrap's own transition
 * classes, and neither should learn a second vocabulary for the same idea. What
 * every component in this wave *does* need is the same one bit of information —
 * does the visitor want less motion — asked in the same place instead of five
 * separate `matchMedia` calls that could each get the query string slightly
 * wrong.
 *
 * **On `/dom`, not `/ui`**, for the reason F109 and F110 are: it needs no
 * component library at all (spec 07 §4). Putting a media-query read behind a
 * Bootstrap-flavoured entry would make a consumer take a component catalogue to
 * ask the platform a question.
 *
 * **Composes the seam `/ui`'s theme manager and breakpoint observer already
 * use.** `dom-media.js`'s `mediaResolver` is `/dom`-internal for exactly this:
 * `/ui` already depends on `/dom` primitives (the F101–F103 dialogs compose
 * `focusTrap`), never the other way, so the shared seam has to live on the side
 * of that boundary both can reach. Three call sites now share one answer to
 * "what does an absent `matchMedia` mean" instead of three.
 *
 * @module egl-utils-js/dom
 */

import { isAbortSignal } from './dom-helpers.js';
import { mediaResolver } from './dom-media.js';
import { assertNoUnknownOptions } from './option-keys.js';

/**
 * @typedef {import('./dom-media.js').MediaQueryLike} MediaQueryLike
 */

/** The query Bootstrap's own CSS checks (`scss/mixins/_transition.scss`). */
const REDUCE_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * @typedef {object} ReducedMotionOptions
 * @property {(query: string) => MediaQueryLike} [matchMedia] - The media seam,
 *   shared with the F106/F108 `/ui` helpers. **Absent entirely** (Node, an
 *   exotic host) means `prefersReduced()` reports `false` — no evidence of a
 *   preference is not evidence of one, and the safe default is to animate as
 *   designed rather than to assume every host wants less motion.
 * @property {AbortSignal} [signal] - Destroys the helper when aborted (NFR-15).
 */

/**
 * @typedef {object} ReducedMotionInstance
 * @property {() => boolean} prefersReduced - Whether the visitor has asked for
 *   less motion, read live — the query F111 exists to centralise.
 * @property {(handler: (prefersReduced: boolean) => void) => () => void} on -
 *   Called when the preference changes. Returns an unsubscribe.
 * @property {() => void} destroy - Detaches the media listener.
 */

/**
 * The one place a component asks whether to animate less (F111).
 *
 * @example
 * const motion = reducedMotion();
 *
 * bsCarousel(el, { items, ride: !motion.prefersReduced() });
 *
 * @example
 * // React to a mid-session preference change — a user can flip this OS
 * // setting without reloading the page.
 * const off = motion.on((reduced) => {
 *   carousel.cycle(); // pause or resume, whichever `reduced` now means
 * });
 *
 * @param {ReducedMotionOptions} [options]
 * @returns {ReducedMotionInstance}
 * @throws {TypeError} On a malformed or unknown option.
 */
export function reducedMotion(options = {}) {
  const api = 'reducedMotion';
  // Checked inline rather than through `bootstrap-elements.js`'s
  // `assertPlainObject`: this entry needs no component library at all (spec 07
  // §4), and importing that helper for one validation would pull the whole
  // Bootstrap builder contract into `/dom`'s chunk graph — measured at over
  // 4 kB served on the deep-ESM route for a helper that itself costs under
  // 300 B. `dom-a11y.js`'s primitives take the same inline shape for the same
  // reason.
  if (options === null || typeof options !== 'object') {
    throw new TypeError(`${api}: options must be an object`);
  }
  const { matchMedia: mediaSeam, signal, ...unknown } = options;
  assertNoUnknownOptions(unknown, api);
  if (signal !== undefined && !isAbortSignal(signal)) {
    throw new TypeError(`${api}: options.signal must be an AbortSignal`);
  }

  const resolve = mediaResolver(mediaSeam, api);
  const query = resolve?.(REDUCE_QUERY);

  /** @returns {boolean} */
  const prefersReduced = () => query?.matches === true;

  /** @type {Set<(prefersReduced: boolean) => void>} */
  const subscribers = new Set();
  let last = prefersReduced();
  let destroyed = false;

  const onQueryChange = () => {
    const next = prefersReduced();
    if (next === last) return;
    last = next;
    for (const handler of [...subscribers]) handler(next);
  };
  query?.addEventListener('change', onQueryChange);

  /** @returns {void} */
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    query?.removeEventListener?.('change', onQueryChange);
    subscribers.clear();
    signal?.removeEventListener('abort', destroy);
  }

  signal?.addEventListener('abort', destroy, { once: true });
  if (signal?.aborted === true) destroy();

  return {
    // A query, not a command: it keeps answering after destroy() the way
    // `screen.names` and `theme.resolved()` do (ADR-0049), because "does the
    // visitor want less motion" does not stop being true just because this
    // helper stopped listening for changes to it.
    prefersReduced,
    on: (handler) => {
      if (destroyed) throw new TypeError(`${api}: on() was called after destroy()`);
      if (typeof handler !== 'function') {
        throw new TypeError(`${api}: handler must be a function`);
      }
      subscribers.add(handler);
      let off = () => {
        subscribers.delete(handler);
        off = () => {};
      };
      return () => off();
    },
    destroy,
  };
}
