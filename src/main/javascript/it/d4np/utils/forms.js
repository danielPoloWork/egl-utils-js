/**
 * egl-utils-js/forms — the form engine (spec 08).
 *
 * **Why this entry rather than `/dom` or `/ui`.** The three existing homes each
 * fail the same test for different reasons (ADR-0077). `/ui` orchestrates
 * *components* — its charter is that a symbol belongs there if it would still
 * make sense with a different component library underneath, and a form engine
 * needs no component library at all. `/bootstrap` had 473 B under ADR-0041's
 * 25 kB clause, which was sized for the finished catalogue. `/dom` is a bag of
 * small primitives kept small on purpose, and the wave spec 08 plans — binding,
 * validation, submission, dirty tracking — is a subsystem rather than a
 * primitive. So `/forms` is a **subject entry**, the shape `/table` and `/net`
 * already are: everything about one subject, at every level, behind one import.
 *
 * A normal subpath in every other respect: named exports only, no default
 * aggregate object, `sideEffects: false`, no bare specifier at module scope, and
 * both no-bundler routes carry it (spec 05). Every options bag here **rejects a
 * key it does not know**, with a `TypeError` naming it — the destructuring is the
 * schema (ADR-0047).
 *
 * The single-element read primitive this composes is deliberately **not** here:
 * `getValue` is on `egl-utils-js/dom`, beside the `setValue` it completes, because
 * reading one control is not a form concern and nobody should import a form
 * engine to do it (spec 08 §4).
 *
 * @module egl-utils-js/forms
 */

// Value binding and serialization (spec 08 §2 items F112-F115, ADR-0077).
export { createForm } from './forms-values.js';

// The validation engine (spec 08 §2 items F116-F119, ADR-0078). It TAKES a form
// rather than being one, so a caller who needs values and no validation links
// none of this (NFR-02).
export { createValidator } from './forms-validate.js';
