/**
 * egl-utils-js — the unknown-option-key contract (ADR-0047).
 *
 * Every function in this library that takes an options object **rejects a key
 * it does not know**, with a `TypeError` naming the offending key. A typo is a
 * programming error, and this library has never let one of those pass: a
 * malformed `variant` throws, `{ html: true }` without `sanitize` throws, an
 * icon-only button with no accessible name throws. Accepting `varient` in
 * silence was the one hole in that posture, and the silence is what makes it
 * expensive — the caller believes they configured something.
 *
 * **The accepted set is the destructuring pattern, not a list.** Callers pass
 * their bag, the function destructures the keys it implements with a rest
 * element, and this helper asserts the rest is empty:
 *
 * ```js
 * const { variant = 'secondary', pill = false, ...unknown } = options;
 * assertNoUnknownOptions(unknown, 'bsBadge');
 * ```
 *
 * A hand-maintained array of names would drift from the implementation the
 * first time an option was added; a rest element cannot, because it *is* the
 * complement of what the function reads. It also costs almost nothing: no key
 * strings survive minification, where a literal array's would.
 *
 * **The escape hatch stays open.** Where a caller legitimately needs to pass
 * something this library does not model, there is a typed channel for it —
 * `bootstrap` on every behaviour wrapper (vendor config), `operators` on the
 * filter compiler, `classes` on the alert engine. Strictness closes the
 * accidental door, not the deliberate one.
 *
 * @module egl-utils-js
 */

/**
 * Reject the leftovers of an options destructuring.
 *
 * Only **own enumerable** keys are seen — the same set the rest element
 * collects, so the check is exactly as precise as the reading it complements.
 * A key inherited from a prototype is invisible to both.
 *
 * @param {object} unknown - The rest element of an options destructuring.
 * @param {string} api - Public function name, for the message (`'bsBadge'`,
 *   `'bsToast.show'`).
 * @param {string} [noun='option'] - What the bag holds, where it is not an
 *   options bag — `'column property'`, `'item property'`.
 * @returns {void}
 * @throws {TypeError} When `unknown` has any own enumerable key.
 */
export function assertNoUnknownOptions(unknown, api, noun = 'option') {
  for (const key of Object.keys(unknown)) {
    throw new TypeError(`${api}: unknown ${noun} '${key}'`);
  }
}
