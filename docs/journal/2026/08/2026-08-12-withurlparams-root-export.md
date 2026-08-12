# 2026-08-12 — `withUrlParams` moves to the root (roadmap 17.10)

## What got done

- **`withUrlParams` re-exported from the root entry**, per
  [ADR-0052](../../../adr/0052-withurlparams-moves-to-the-root.md). The `egl-utils-js/dom`
  binding is kept — nothing is removed, nothing breaks for an existing consumer.
- The NFR-01 root full-import budget is **amended from 6 kB to 6.05 kB**, in the same PR,
  because the addition was not free: +138 B in the aggregate bundle, 50 B over the original
  clause.
- README (Web section gains the example, the `/dom` section trims its duplicate and points
  at the root), spec 03 §5 (notes the dual export), ROADMAP 17.10 checked, CHANGELOG,
  `.size-limit.json` (new root scenario + amended aggregate row), and a test asserting the
  root and `/dom` bindings are the same function reference.

## The measurement that mattered

The roadmap item called this "the cheap answer" — additive, no exports-map shape change,
fast/low route. That's true of the **API shape**. It was not true of the **byte budget**:
building after the one-line `export { withUrlParams } from './dom-fragment.js';` addition
pushed the root full-import from 5864 B to 6002 B, which is *over* NFR-01's literal 6 kB
ceiling, not just over the tightened `.size-limit.json` row (5.9 kB) that used to sit inside
it with ~36 B of headroom. Every prior root addition either arrived with a ceiling that
already expected growth (a genuinely new capability) or, in 17.2, shrank the bundle. This is
the first time a function moved onto the root **without ever leaving** its origin entry, and
the marginal cost — 138 B, smaller than either entry's isolated `single:` measurement (277 B
`/dom`, 281 B root) because the two share code paths — was real and had nowhere to hide.

The response follows the ADR-0015 precedent (`httpClient`'s named budget exception): measure
first, then amend the clause with the number that reflects the measurement, not a round
figure guessed in advance. NFR-01 now reads 6.05 kB, and the `.size-limit.json` row's
comment carries the exact byte delta so the next person who touches the root budget can see
the two-line story without re-deriving it.

## Where the project stands

M17 in progress: 17.1, 17.2, 17.7, 17.8, 17.9, 17.10, 17.11 done; 17.3, 17.4, 17.5, 17.6,
17.12, 17.13, 17.14 open. ADRs through 0052, next free 0053. `[Unreleased]` in CHANGELOG.md
carries this PR's line alongside the not-yet-released 17.2/17.7/17.8/17.9/17.11 entries —
none of them has shipped a version bump yet, since pre-1.0 versioning is milestone-driven
(17.5 cuts the release).

## How the next session resumes

1. Wait for this PR to merge.
2. The remaining open items with no dependency on each other: **17.3** (publish the API
   reference), **17.4** (the NFR-01 per-function clause — note this is the *single-function*
   1 kB ceiling ADR-0015 already exempts by name, a different clause from the aggregate this
   session amended), **17.6** (the `/sanitize` peer contract), **17.12** (the two
   documentation gaps), **17.13** (descriptor-shape option checking), **17.14** (the
   `#webcrypto` shim, now vestigial after the 17.2 floor). None blocks another; pick by
   owner priority. **17.5** cuts the release and stays last regardless.
