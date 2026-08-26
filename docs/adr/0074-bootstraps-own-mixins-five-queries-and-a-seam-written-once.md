# ADR-0074: Bootstrap's own mixins, five queries instead of eleven, and a seam written once

- **Status:** Accepted
- **Date:** 2026-08-26
- **Deciders:** Daniel Polo
- **Related:** [spec 07](../specs/07_spec_application_ux.md) §2 F108, §6, NFR-31/NFR-33/NFR-34/NFR-35;
  ROADMAP 20.4;
  [ADR-0073](0073-bootstraps-own-attribute-and-a-snippet-that-cannot-drift.md) (the media seam
  this extracts, and the floor amendment it already landed),
  [ADR-0071](0071-a-manager-not-three-globals-and-a-dismissal-is-an-answer.md) and
  [ADR-0072](0072-a-queue-a-rule-nobody-has-to-guess-and-one-toast-per-story.md) (the `/ui`
  entry and the manager shape), [ADR-0017](0017-platform-api-floor-gate.md) (the context guard
  absence is declared under), [ADR-0049](0049-commands-throw-queries-answer.md) (commands throw,
  queries answer), [ADR-0037](0037-builder-contract-nodes-escape-and-the-atom-budget.md) (frozen
  data presets, not configuration)

## Context

A component that needs to know whether it is on a narrow screen has three bad options. A
`resize` listener reading `innerWidth` fires dozens of times a drag and forces a layout read
each time. A hand-written `matchMedia('(min-width: 768px)')` puts a number in the JavaScript
that has to agree with the CSS forever. And doing either of those *per component* is the state
F108 exists to replace: **ask once, be told when it changes.**

Two things made this item smaller and one made it more interesting.

**Smaller:** the NFR-34 floor amendment this item was written to owe [already
landed](0073-bootstraps-own-attribute-and-a-snippet-that-cannot-drift.md) in 20.3, because
"follow the system" is a media query and F106 needed one first. `matchMedia`,
`MediaQueryList.matches` and `MediaQueryList.change` are declared and the scanner polices the
global, so what remained here was the vocabulary and the shape.

**More interesting:** Bootstrap's breakpoint mixins do not mean what their names suggest, and
the difference is a documented source of bugs. `media-breakpoint-down(md)` is
`max-width: 767.98px` — **narrower than md**, excluding md itself. That is a deliberate
Bootstrap 5 change from Bootstrap 4, and any wrapper that guesses from the name gets it
backwards.

## Decision

**1. The map is Bootstrap's `$grid-breakpoints`, read from its source.** `xs: 0, sm: 576,
md: 768, lg: 992, xl: 1200, xxl: 1400`, taken from `scss/_variables.scss` rather than
remembered, and exported as frozen data (`BOOTSTRAP_BREAKPOINTS`) so a caller can read the same
numbers the observer does. Frozen data rather than configuration is the ADR-0037 rule for
presets.

A `breakpoints` option exists for the one case that needs it — a project whose SCSS changed
`$grid-breakpoints` — because without it such a project gets *silently plausible wrong answers*,
which is the worst failure mode available.

**2. The predicates are Bootstrap's four mixins, with Bootstrap's meanings.** `up`, `down`,
`only`, `between`, each matching `media-breakpoint-*` as its source defines it rather than as
its name reads:

- `up('md')` — md and wider. `up` on the smallest is **always true**, because Bootstrap emits
  no query for a zero minimum.
- `down('md')` — **narrower than md**. The gotcha, mirrored deliberately.
- `only('md')` — md and nothing wider.
- `between('md', 'xl')` — md up to but **not including** xl.

Mirroring rather than improving is the point: a caller reading their SCSS and their JavaScript
side by side must not have to hold two vocabularies.

**3. Five queries, not eleven — and the 0.02px never appears.** Because BS5's `-down` is the
complement of `-up`, and `-only`/`-between` are intersections of two `-up`s, the whole
vocabulary derives from **one `min-width` query per non-zero breakpoint**. No `max-width` query
is opened, so `max-width: 767.98px` — the expression a hand-rolled version mistypes, and the
one nobody notices is wrong — is absent from the implementation entirely. The observer holds
five listeners rather than one per predicate, and `current()` is simply the largest matching
minimum.

This buys a second property worth naming: because the matching set is **nested**, `current()`
fully determines every predicate. That is what makes decision 5's notification rule sound.

**4. Two places this refuses to mirror, and both are refusals rather than guesses.**
`media-breakpoint-down(xs)` is unconditionally true in Bootstrap — not because anything is
narrower than zero, but because its `@if $max` falls through to the unguarded branch. And
`between('lg', 'md')` compiles to a query that can never match. Both are caller mistakes that
would otherwise return a plausible boolean, so both **throw**, naming why. That is the
`bsButton`-refuses-an-unnamed-icon-button posture (ADR-0037) applied to a predicate.

The breakpoint map is validated for the same reason: ascending, and starting at zero. Every
derivation above rests on the set being nested, and an out-of-order map would produce answers
that look right. Bootstrap asserts the same property (`_assert-ascending`) for the same reason.

**5. `on()` fires on a *crossing*, not on a media change.** A drag from 800 px to 900 px changes
no breakpoint; notifying would hand the debouncing problem straight back to the caller, which is
the problem F108 exists to take away. And a widening from 500 to 1500 flips four of the five
queries at once — reported as **one** crossing, with `{current, previous}`. Sound because of
decision 3: the set is nested, so the active breakpoint changes exactly when the set does.

**6. The `matchMedia` seam is extracted, on its third use.** `ui-media.js` now owns resolving it
(injected first, ambient second), validating what it opens, and treating **absence** as a legal
state. The theme manager was rewritten onto it in this PR rather than left with its own copy.

The behaviour that would otherwise have drifted is precisely the interesting one: whether an
absent `matchMedia` throws or degrades, and whether a caller's fake is validated at all. Written
twice, those two answers diverge; written once, F111's reduced-motion helper (20.6) inherits them
for free.

The validation is **per query** rather than once per instance, because the observer opens five
and a fake that answers one but not another is a fake with a gap in it.

**7. Absence degrades; a malformed injection throws.** With no `matchMedia`, every query reads as
not matching and `current()` reports the smallest breakpoint — which is the honest answer, since
nothing has claimed a minimum width. A seam that returns something unsubscribable is a
programming error and says so. The two must not look the same.

**8. NFR-22 re-derived a fifth time, to 61 kB** (61 685 B). `/ui` grew 771 B, all of it this
item; nothing else moved.

## Alternatives Considered

- **`current()` alone, with no predicates.** The literal reading of F108's "current-value read".
  Rejected: it forces every caller to write `['md','lg','xl','xxl'].includes(current())`, which
  *is* the "every component re-deriving the same query" the requirement exists to stop — just
  moved one level up.
- **`down(name)` meaning "name and narrower"**, which is what the name suggests and what
  Bootstrap 4 meant. Rejected: it would disagree with the SCSS a caller is reading in the same
  project, and a wrapper whose vocabulary silently differs from the framework's is worse than no
  wrapper.
- **Opening a `max-width` query per breakpoint** so `down` is a query rather than a complement.
  Rejected: eleven listeners instead of five, and it puts the 0.02px subtraction into this
  library where it can be mistyped. The complement is exact and free.
- **Returning Bootstrap's `true` for `down('xs')`.** Maximum fidelity. Rejected: fidelity to an
  artefact is not fidelity to an intent, and a plausible boolean hides the caller's mistake.
  Where a mixin degenerates, refusing is more useful than agreeing.
- **Notifying on every media change rather than every crossing.** Simpler, and arguably more
  "honest" about what happened. Rejected per decision 5: it makes the subscriber debounce, which
  is the work F108 is supposed to remove.
- **Leaving the theme manager's seam where it was and writing a second one here.** Smaller diff,
  no refactor inside a feature PR. Rejected: two copies of "what does an absent `matchMedia`
  mean" is exactly the kind of pair that answers differently within a release, and 20.6 would
  have made it three.
- **A `resize`-based observer with a debounce**, avoiding `matchMedia` and the floor amendment
  entirely. Rejected before 20.3 made it moot: it reads layout on the hot path of a drag, and it
  cannot express `only`/`between` without arithmetic the browser already does.

## Consequences

- **The public surface goes from 130 exports to 132** — `createBreakpoints` and
  `BOOTSTRAP_BREAKPOINTS` — with **no new `exports`-map path**. NFR-31 holds.
- **20.6 inherits a settled seam.** F111's reduced-motion helper is one query through
  `mediaResolver` and the same subscribe shape; the decisions it would otherwise have had to
  make about absence and validation are made.
- **`/ui` is now four capabilities deep and still shakeable**: `createBreakpoints` measures
  **1 237 B against a 9 567 B entry** — 13% — which is NFR-02 as a number rather than an
  assertion, and the reason it earned a per-function size row.
- **A dependency on Bootstrap's source, not its documentation.** The map and the four semantics
  were read from `scss/_variables.scss` and `scss/mixins/_breakpoints.scss`. Worth re-reading on
  a major Bootstrap bump — and the browser suite would catch a changed pixel, because it asserts
  the crossing happens at 768 rather than merely that it happens.
- **One inline comment in Bootstrap's own source is wrong**, and the code is what was followed:
  `media-breakpoint-down`'s comment says "the given breakpoint and narrower" while
  `breakpoint-max` computes `$min - .02`, which excludes it. Recorded here so the next reader
  does not have to re-derive which of the two to trust.

## References

- [spec 07](../specs/07_spec_application_ux.md) §2 F108, §6, NFR-33/NFR-34/NFR-35.
- Bootstrap 5.3 `scss/_variables.scss` (`$grid-breakpoints`) and
  `scss/mixins/_breakpoints.scss` (`breakpoint-min`, `breakpoint-max`, and the four mixins) —
  the source of every number and every boundary here.
- `src/test/browser/ui-breakpoints.spec.js` — the wiring claim spec 07 §6 asks a browser for,
  including the 767/768 boundary.
