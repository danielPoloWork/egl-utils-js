/**
 * egl-utils-js/ui — the shared `matchMedia` seam.
 *
 * Three items on this entry ask the platform the same kind of question — the
 * F106 theme manager reads `prefers-color-scheme`, the F108 breakpoint observer
 * reads a set of `min-width`s, and the F111 reduced-motion helper will read
 * `prefers-reduced-motion` — and each needs the same three things: resolve the
 * seam (injected first, ambient second), refuse a fake that cannot be subscribed
 * to, and treat **absence** of the platform API as a legal state rather than a
 * failure.
 *
 * Written once here on the third use rather than a third time in place. The
 * behaviour it fixes is the part that would have drifted: whether an absent
 * `matchMedia` throws or degrades, and whether a caller's fake is validated at
 * all.
 *
 * **Absence is documented degradation.** Node has no `matchMedia`, and `/ui` is
 * an entry a server render legitimately loads (ADR-0017's context guard, declared
 * in the floor inventory by ADR-0073). So a resolver may be `undefined`, and each
 * caller says what that means for it — the theme manager falls back to an option,
 * the breakpoint observer reports the smallest breakpoint.
 *
 * **A fake that cannot be subscribed to is a mistake, not a host limitation**, and
 * the two must not look the same: absence degrades, a malformed injection throws.
 *
 * @module egl-utils-js/ui
 */

/**
 * The part of `MediaQueryList` this entry uses. Narrower than the platform type
 * on purpose, so a test can supply four lines instead of a fake DOM.
 *
 * @typedef {object} MediaQueryLike
 * @property {boolean} matches
 * @property {(type: string, listener: () => void) => void} addEventListener
 * @property {(type: string, listener: () => void) => void} [removeEventListener]
 */

/**
 * Resolve the `matchMedia` seam, injected first and ambient second.
 *
 * @param {((query: string) => MediaQueryLike) | undefined} injected - The
 *   caller's seam, when they supplied one.
 * @param {string} api - Public function name, for the message (ADR-0049).
 * @returns {((query: string) => MediaQueryLike) | undefined} A resolver that
 *   validates what it opens, or `undefined` when there is no way to ask at all.
 * @throws {TypeError} If `injected` is present and not a function.
 */
export function mediaResolver(injected, api) {
  if (injected !== undefined && typeof injected !== 'function') {
    throw new TypeError(`${api}: options.matchMedia must be a function`);
  }
  const ambient = /** @type {{ matchMedia?: unknown }} */ (globalThis).matchMedia;
  const seam =
    injected ??
    (typeof ambient === 'function'
      ? /** @type {(query: string) => MediaQueryLike} */ (
          (query) => /** @type {any} */ (globalThis).matchMedia(query)
        )
      : undefined);
  if (seam === undefined) return undefined;

  return (query) => {
    const result = seam(query);
    // Validated per query rather than once per manager, because a seam that
    // answers one query and not another is a fake with a gap in it — and the
    // observer opens five.
    if (
      result === null ||
      typeof result !== 'object' ||
      typeof result.addEventListener !== 'function'
    ) {
      throw new TypeError(
        `${api}: options.matchMedia must return a MediaQueryList with addEventListener`,
      );
    }
    return result;
  };
}
