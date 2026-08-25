/**
 * egl-utils-js/ui — the application-UX entry (spec 07).
 *
 * **Why this entry exists rather than more of `/bootstrap`.** `/bootstrap`
 * *builds* components: given data and options, return nodes, or an instance
 * wrapping one Bootstrap component's lifetime. This entry *orchestrates* them —
 * state that outlives any single component: a pending question, a queue, a
 * persisted preference, a media query. The boundary is testable rather than
 * aesthetic (spec 07 §4): **a symbol belongs here if it would still make sense
 * with a different component library underneath.** A dialog that resolves a
 * promise would; `bsBadge` would not.
 *
 * There was also an arithmetic reason, and it is the one that forced the split
 * now: ADR-0041 sized the `/bootstrap` entry clause at 25 kB *for the finished
 * catalogue*, the catalogue is finished at 24 406 B, and `bsModal` and `bsToast`
 * alone — the two components this wave wraps — measure 1 266 B and 2 473 B. The
 * wave does not fit and no care makes it fit (spec 07 NFR-32). Stretching a
 * clause written for something else would have been the cheap move and the wrong
 * one.
 *
 * A normal subpath in every other respect: named exports only, no default
 * aggregate object, `sideEffects: false`, the Bootstrap peer resolved at first
 * use and failing typed when absent (ADR-0041), and both no-bundler routes carry
 * it (spec 05). Every options bag here **rejects a key it does not know**, with a
 * `TypeError` naming it — the destructuring is the schema (ADR-0047).
 *
 * The accessibility primitives this entry composes are deliberately **not** here:
 * `focusTrap`, `saveFocus` and `liveRegion` are on `egl-utils-js/dom`, because
 * nobody should take a component catalogue to announce a message (spec 07 §4).
 *
 * @module egl-utils-js/ui
 */

// Promise-based dialogs (spec 07 §2 items F101-F103, ADR-0071).
export { createDialogs } from './ui-dialogs.js';
