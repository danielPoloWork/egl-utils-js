# ADR-0052: `withUrlParams` is also a root export

- **Status:** Accepted
- **Date:** 2026-08-11
- **Deciders:** Daniel Polo (owner), agent (senior project architect persona)
- **Related:** ROADMAP 17.10, `docs/releases/v1.0.0-readiness-review.md` §2.7 (the finding
  that filed this item), spec 03 F48, ADR-0018 (the `VERSION` precedent for a root
  re-export added after its origin milestone)

## Context

`withUrlParams(url, params)` shipped on `egl-utils-js/dom` in the M11 DOM-foundation wave
(spec 03 F48), grouped there because it landed alongside `autoGrow` and `injectFragment` in
the same source file and the same roadmap item. Its own JSDoc has said since that PR:
*"Pure and SSR-safe: it never touches `document`, `location`, or the `URL` constructor."*
That sentence has been true the whole time and describes a function with no DOM dependency
sitting on the one entry whose entire reason to exist is fencing DOM-dependent code off the
zero-dependency root (NFR-06).

The 17.1 readiness review's §2.7 named the concrete cost: `urlSearchParams` — its sibling,
sharing the same nullish-skip/array-repeat contract, referenced from `withUrlParams`'s own
JSDoc as "the same contract as `urlSearchParams` (F17)" — sits on the root, one import away.
A Node-only consumer who wants to merge query parameters into a relative URL currently has
no reason to import `egl-utils-js/dom` and must anyway, for a function that never touches a
DOM. **Moving an export between entries after 1.0 is a breaking change** (spec §5's
exports-map freeze), so this is the last moment the fix costs nothing.

## Decision

**Re-export `withUrlParams` from the root entry, and keep the existing `egl-utils-js/dom`
binding rather than removing it.** Concretely:

```js
// index.js
export { withUrlParams } from './dom-fragment.js';
```

The function's implementation does not move — it stays in `dom-fragment.js`, where its
neighbors `autoGrow` and `injectFragment` are — only its export surface grows. The `/dom`
binding is documented as kept for compatibility, with its JSDoc pointing new code at the
root import instead. Nothing is deprecated in the sense of a runtime warning: two import
paths to the same function is a normal, permanent shape (`EglError`/error-class re-exports
already do this, ADR-0003), not a transitional state working toward a removal.

Spec 03 §5's public-interface bullet for `egl-utils-js/dom` is unchanged — `withUrlParams`
is still part of that entry's F48 surface — with a note added that it is also reachable from
the root.

## Alternatives Considered

- **Move it: drop the `/dom` export, keep only the root one.** Rejected outright: this *is*
  the exports-map-shape change ADR-0018 already established as breaking, and it is exactly
  what a review taken *before* the 1.0 freeze exists to avoid inflicting on any consumer who
  already imports from `/dom` (the M11–M16 wave's own README examples do).
- **Leave it on `/dom` only, accept the placement as historical.** This was the option on
  the table before 17.1 filed the finding. Rejected: the placement contradicts the entry's
  own stated purpose (NFR-06's zero-dependency root, and `/dom`'s own module doc: "Every
  export throws `DomContractError` when there is none"), and doing nothing here means doing
  nothing **forever** — the exports map is frozen at 1.0, and this is the one item in this
  batch whose fix is free right now and costs a major afterward.
- **A dedicated `egl-utils-js/url` subpath**, mirroring `/text` and `/net`. Rejected per the
  ADR-0018 precedent for the same reasoning: the separation into subpaths exists for
  browser-leaning or peer-dependent code (`/storage`, `/sanitize`) or for a themed group of
  several functions (`/net`, `/text`); one plain string-in-string-out function with an
  existing zero-cost home is not that, and a second import path for one function is friction
  without a reason.

## Consequences

- **Root entry named-export count grows by one, to 36** (including `VERSION` and the 8
  re-exported error classes); `default` stays absent, so spec §5's "named exports only" is
  unaffected.
- **`egl-utils-js/dom`'s export list is unchanged** — nothing there stops working, and no
  migration is required of any existing consumer.
- A new `single: withUrlParams` size-limit scenario is added at the root entry, alongside
  the existing one on `/dom`; both are measured and gated independently, since they compile
  from different entry points even though the source is shared, and both come in well under
  the 1 kB single-function ceiling (277 B and 281 B respectively).
- **The root full-import budget (NFR-01) is amended**, not merely absorbed: the aggregate
  moved from 5864 B to 6002 B — a marginal 138 B, smaller than either isolated measurement
  because `withUrlParams` shares code paths the root bundle already pays for — which put it
  50 B over the original 6 kB clause. This is the first time the whole-entry ceiling needed
  to grow rather than shrink, because it is the first export ever added to the root without
  being removed from anywhere else: every prior root addition was either new capability
  (the ceiling was set to expect growth) or, in 17.2, a deletion. The clause moves to
  **6.05 kB**, amended in spec 01 NFR-01 alongside this ADR, with headroom sized to the
  same ~40–50 B margin the row has carried historically rather than to the bare minimum.
- `dom-fragment.test.js`/`dom-node-safety.test.js` continue to exercise the implementation
  through the `/dom` import; a new assertion confirms the root export is the same function
  reference, so a future refactor that silently drops either binding fails a test rather
  than a diff review — the ADR-0018 `version.test.js` precedent, applied here.
- Spec 03 §5 gains one clause noting the dual export; no spec section is renumbered, and no
  F-item's identity changes — F48 is still "on `egl-utils-js/dom`", now also reachable
  elsewhere.

## References

- ROADMAP 17.10; `docs/releases/v1.0.0-readiness-review.md` §2.7.
- ADR-0018 (`VERSION` re-exported from the root after its origin milestone — the direct
  procedural precedent for adding a root export without renumbering the spec that defined
  the function).
- Spec 03 §2 F48, §5 (public interface).
