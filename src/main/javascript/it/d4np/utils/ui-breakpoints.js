/**
 * egl-utils-js/ui — breakpoint observation (spec 07 §2 item F108).
 *
 * A component that needs to know whether it is on a narrow screen has three bad
 * options and one good one. It can read `window.innerWidth` on a resize listener
 * — which fires dozens of times a drag and forces a layout read each time. It can
 * write its own `matchMedia('(min-width: 768px)')` — which puts a magic number in
 * the JavaScript that has to agree with the CSS forever. Or every component can
 * do one of those *separately*, which is the state F108 exists to replace: **ask
 * once, be told when it changes.**
 *
 * **Bootstrap's own names and Bootstrap's own semantics.** The breakpoint map is
 * `$grid-breakpoints` — `xs: 0, sm: 576, md: 768, lg: 992, xl: 1200, xxl: 1400` —
 * and the four predicates are its four SCSS mixins, with the meanings its source
 * gives them rather than the ones the names suggest:
 *
 * - `up('md')` — 768 and wider. `up('xs')` is always true, because xs has no
 *   query (Bootstrap emits none).
 * - `down('md')` — **narrower than md**, not "md and narrower". That is the
 *   Bootstrap 5 change people trip over, and it is deliberate here for the same
 *   reason it is there: `-down` is the complement of `-up`.
 * - `only('md')` — md and nothing wider.
 * - `between('md', 'xl')` — md up to but **not including** xl.
 *
 * **Five queries, not eleven.** Because BS5's `-down` is the complement of `-up`,
 * and `-only`/`-between` are intersections of two `-up`s, the whole vocabulary is
 * derivable from one `min-width` query per non-zero breakpoint. Two consequences
 * worth stating: the observer opens five listeners rather than one per predicate,
 * and **the 0.02px subtraction never appears in this file** — which is where a
 * hand-rolled version gets its off-by-one, since `max-width: 767.98px` is easy to
 * mistype and impossible to notice.
 *
 * The one place this deliberately refuses to mirror the mixins is
 * `media-breakpoint-down(xs)`, which Bootstrap makes unconditionally true because
 * its `@if $max` falls through rather than because anything is narrower than the
 * base. Nothing is narrower than the base, so asking is a mistake, and a mistake
 * that returns a plausible boolean is worse than one that throws.
 *
 * @module egl-utils-js/ui
 */

import { assertPlainObject } from './bootstrap-elements.js';
import { isAbortSignal } from './dom-helpers.js';
import { mediaResolver } from './dom-media.js';
import { assertNoUnknownOptions } from './option-keys.js';

/**
 * @typedef {import('./dom-media.js').MediaQueryLike} MediaQueryLike
 */

/**
 * Bootstrap 5.3's `$grid-breakpoints`, in ascending order — read from its own
 * `scss/_variables.scss` rather than remembered.
 *
 * Frozen data, not configuration: a caller whose SCSS changed these passes their
 * own map, and one who did not gets Bootstrap's.
 *
 * @type {Readonly<Record<string, number>>}
 */
export const BOOTSTRAP_BREAKPOINTS = /* @__PURE__ */ Object.freeze({
  xs: 0,
  sm: 576,
  md: 768,
  lg: 992,
  xl: 1200,
  xxl: 1400,
});

/**
 * @typedef {object} BreakpointsOptions
 * @property {Record<string, number>} [breakpoints] - Name → minimum width in
 *   pixels, ascending. Defaults to {@link BOOTSTRAP_BREAKPOINTS}. Pass your own
 *   **only** if your SCSS changed `$grid-breakpoints`: getting this wrong means
 *   silently correct-looking answers, which is why the default is Bootstrap's own
 *   map rather than a guess.
 * @property {(query: string) => MediaQueryLike} [matchMedia] - The media seam,
 *   shared with the F106 theme manager. **Absent entirely** (Node, an exotic
 *   host) means every query reads as not matching, so `current()` reports the
 *   smallest breakpoint — a documented degradation, not a throw.
 * @property {AbortSignal} [signal] - Destroys the observer when aborted
 *   (NFR-15).
 */

/**
 * @typedef {object} BreakpointChange
 * @property {string} current - The active breakpoint now.
 * @property {string} previous - What it was. The handler runs only when these
 *   differ: a resize that crosses no boundary is not a breakpoint change, and
 *   notifying on one would put the debouncing problem back in the caller's lap.
 */

/**
 * @typedef {object} BreakpointsInstance
 * @property {() => string} current - The largest breakpoint whose minimum the
 *   viewport meets. The current-value read F108 asks for.
 * @property {(name: string) => boolean} up - `name` and wider — Bootstrap's
 *   `media-breakpoint-up`. Always true for the smallest breakpoint.
 * @property {(name: string) => boolean} down - **Narrower than** `name`, which is
 *   what Bootstrap 5's `media-breakpoint-down` means. Throws for the smallest
 *   breakpoint, where the question has no answer.
 * @property {(name: string) => boolean} only - `name` and nothing wider.
 * @property {(lower: string, upper: string) => boolean} between - `lower` up to
 *   but not including `upper`, as Bootstrap's mixin does.
 * @property {(handler: (change: BreakpointChange) => void) => () => void} on -
 *   Called when the active breakpoint changes, with the new and previous names.
 *   Returns an unsubscribe.
 * @property {readonly string[]} names - The breakpoint names in ascending order,
 *   so a caller can iterate without hardcoding Bootstrap's vocabulary.
 * @property {() => void} destroy - Detaches every media listener.
 */

/**
 * Observe Bootstrap's breakpoints (F108).
 *
 * @example
 * const screen = createBreakpoints();
 *
 * if (screen.down('md')) collapseTheSidebar();
 * screen.current(); // 'lg'
 *
 * @example
 * // Ask once, be told when it changes — rather than a resize listener per
 * // component, each re-deriving the same query.
 * const off = screen.on(({ current, previous }) => {
 *   console.log(`${previous} → ${current}`);
 *   table.setDensity(screen.up('lg') ? 'comfortable' : 'compact');
 * });
 *
 * @example
 * // A project whose SCSS changed $grid-breakpoints passes the same map:
 * createBreakpoints({ breakpoints: { xs: 0, tablet: 700, desktop: 1100 } });
 *
 * @param {BreakpointsOptions} [options]
 * @returns {BreakpointsInstance}
 * @throws {TypeError} On a malformed or unknown option, including a breakpoint
 *   map that is empty, not ascending, or does not start at zero.
 */
export function createBreakpoints(options = {}) {
  const api = 'createBreakpoints';
  assertPlainObject(options, 'options', api);
  const {
    breakpoints = BOOTSTRAP_BREAKPOINTS,
    matchMedia: mediaSeam,
    signal,
    ...unknown
  } = options;
  assertNoUnknownOptions(unknown, api);

  assertPlainObject(breakpoints, 'options.breakpoints', api);
  const entries = Object.entries(breakpoints);
  if (entries.length === 0) {
    throw new TypeError(`${api}: options.breakpoints must have at least one entry`);
  }
  for (const [name, width] of entries) {
    if (typeof width !== 'number' || !Number.isFinite(width) || width < 0) {
      throw new TypeError(
        `${api}: options.breakpoints.${name} must be a non-negative finite number of pixels`,
      );
    }
  }
  // Ascending and starting at zero, both asserted rather than assumed: the whole
  // derivation below — `current` as the largest match, `down` as a complement —
  // rests on the set being nested, and an out-of-order map would produce answers
  // that look plausible and are wrong. Bootstrap asserts the same thing about
  // `$grid-breakpoints` (`_assert-ascending`), for the same reason.
  for (let at = 1; at < entries.length; at += 1) {
    if (entries[at][1] <= entries[at - 1][1]) {
      throw new TypeError(
        `${api}: options.breakpoints must ascend — '${entries[at][0]}' is not wider than '${entries[at - 1][0]}'`,
      );
    }
  }
  if (entries[0][1] !== 0) {
    throw new TypeError(
      `${api}: options.breakpoints must start at 0 — '${entries[0][0]}' is ${entries[0][1]}`,
    );
  }
  if (signal !== undefined && !isAbortSignal(signal)) {
    throw new TypeError(`${api}: options.signal must be an AbortSignal`);
  }

  const names = Object.freeze(entries.map(([name]) => name));
  const resolve = mediaResolver(mediaSeam, api);

  /**
   * One `min-width` query per breakpoint above zero. The zero one needs none —
   * Bootstrap emits no query for it either — which is also why `up` on it is
   * unconditionally true rather than a query that happens to always match.
   *
   * @type {Map<string, MediaQueryLike>}
   */
  const queries = new Map();
  if (resolve !== undefined) {
    for (const [name, width] of entries) {
      if (width > 0) queries.set(name, resolve(`(min-width: ${width}px)`));
    }
  }

  let destroyed = false;

  /**
   * @param {string} method
   * @returns {void}
   * @throws {TypeError} When the observer has been destroyed.
   */
  function assertAlive(method) {
    if (destroyed) throw new TypeError(`${api}: ${method}() was called after destroy()`);
  }

  /**
   * @param {string} name
   * @param {string} method
   * @param {string} [label='name']
   * @returns {void}
   * @throws {TypeError} On a name this map does not have.
   */
  function assertName(name, method, label = 'name') {
    if (!names.includes(name)) {
      throw new TypeError(
        `${api}.${method}: ${label} must be one of ${names.join(', ')} — got ${JSON.stringify(name)}`,
      );
    }
  }

  /**
   * `name` and wider.
   *
   * @param {string} name
   * @returns {boolean}
   */
  function up(name) {
    assertName(name, 'up');
    const query = queries.get(name);
    // No query means the zero breakpoint (always) or no `matchMedia` at all
    // (never) — the two cases the map's absence covers, distinguished by whether
    // the name has a width.
    if (query === undefined) return breakpoints[name] === 0;
    return query.matches === true;
  }

  /** @returns {string} */
  function current() {
    let active = names[0];
    for (const name of names) {
      if (up(name)) active = name;
    }
    return active;
  }

  /** Subscribers, and the value they were last told about. @type {Set<(change: BreakpointChange) => void>} */
  const subscribers = new Set();
  let last = current();

  const onQueryChange = () => {
    const next = current();
    // Only on a real crossing. A drag that resizes from 800 to 900 px changes no
    // breakpoint, and telling every subscriber it did would hand the debouncing
    // problem straight back to them.
    if (next === last) return;
    const previous = last;
    last = next;
    for (const handler of [...subscribers]) handler({ current: next, previous });
  };
  for (const query of queries.values()) query.addEventListener('change', onQueryChange);

  /** @returns {void} */
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    for (const query of queries.values()) {
      query.removeEventListener?.('change', onQueryChange);
    }
    subscribers.clear();
    signal?.removeEventListener('abort', destroy);
  }

  signal?.addEventListener('abort', destroy, { once: true });
  if (signal?.aborted === true) destroy();

  return {
    current: () => {
      assertAlive('current');
      return current();
    },
    up: (name) => {
      assertAlive('up');
      return up(name);
    },
    down: (name) => {
      assertAlive('down');
      assertName(name, 'down');
      if (breakpoints[name] === 0) {
        throw new TypeError(
          `${api}.down: nothing is narrower than '${name}', the smallest breakpoint — ` +
            `Bootstrap's own mixin answers true here only because its @if falls through`,
        );
      }
      // The exact complement of `up`, which is what Bootstrap 5's `-down` mixin
      // means. It differs from that mixin by the 0.02px it leaves unmatched
      // between `max-width: 767.98px` and `min-width: 768px`; closing that gap is
      // deliberate, since a fractional viewport width should land somewhere.
      return !up(name);
    },
    only: (name) => {
      assertAlive('only');
      assertName(name, 'only');
      const next = names[names.indexOf(name) + 1];
      return up(name) && (next === undefined || !up(next));
    },
    between: (lower, upper) => {
      assertAlive('between');
      assertName(lower, 'between', 'lower');
      assertName(upper, 'between', 'upper');
      if (names.indexOf(upper) <= names.indexOf(lower)) {
        throw new TypeError(
          `${api}.between: upper must be wider than lower — got '${lower}' to '${upper}'`,
        );
      }
      // Bootstrap's own bounds: inclusive of `lower`, exclusive of `upper`.
      return up(lower) && !up(upper);
    },
    on: (handler) => {
      assertAlive('on');
      if (typeof handler !== 'function') {
        throw new TypeError(`${api}.on: handler must be a function`);
      }
      subscribers.add(handler);
      let off = () => {
        subscribers.delete(handler);
        off = () => {};
      };
      return () => off();
    },
    names,
    destroy,
  };
}
