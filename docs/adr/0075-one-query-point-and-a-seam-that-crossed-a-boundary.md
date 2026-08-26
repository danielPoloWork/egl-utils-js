# ADR-0075: One query point, and a seam that crossed a boundary

- **Status:** Accepted
- **Date:** 2026-08-26
- **Deciders:** Daniel Polo
- **Related:** [spec 07](../specs/07_spec_application_ux.md) §2 F111, §4, §6,
  NFR-31/NFR-33/NFR-35; ROADMAP 20.6;
  [ADR-0046](0046-one-proposal-triaged-and-the-no-bundler-wave-adopted.md) (the MotionManager
  rejection this helper stays inside),
  [ADR-0074](0074-bootstraps-own-mixins-five-queries-and-a-seam-written-once.md) (the
  `matchMedia` seam this item relocates, and the F108 shape this mirrors),
  [ADR-0070](0070-two-primitives-extracted-and-a-ceiling-recomputed.md) (F109/F110, the other
  two `/dom` items spec 07 §4 groups this with),
  [ADR-0049](0049-commands-throw-queries-answer.md) (commands throw, queries answer),
  [ADR-0037](0037-builder-contract-nodes-escape-and-the-atom-budget.md) (the builder contract
  whose accidental leak into `/dom` this item found and closed)

## Context

Spec 07 §4 places F111 deliberately: *"the two accessibility primitives and the motion helper
go to `/dom` instead, because they need no component library at all."* F109 and F110 already
live there (ADR-0070); F111 is the third and smallest.

ADR-0046 already drew the boundary this item has to stay inside: a `MotionManager` — an
animation-preset system letting a caller register named transitions and durations — was
**rejected** as design-system territory, with only *"a reduced-motion policy helper"* adopted.
`bsCarousel` takes `fade` as a boolean and `bsCollapse` takes Bootstrap's own transition
classes; neither should learn a second vocabulary for the same idea. What every component
*does* need is the same one bit of information — does the visitor want less motion — asked in
one place instead of five separate `matchMedia` calls that could each get the query string
slightly wrong.

The interesting problem this item actually posed was not the helper. It was **where the
`matchMedia` seam ADR-0074 extracted should live**, now that a third consumer needed it and
that consumer sat on the other side of an entry boundary from the first two.

## Decision

**1. `reducedMotion(options)` on `/dom`**, named and shaped like its `/dom` siblings
(`focusTrap`, `saveFocus`, `liveRegion`) rather than like the `/ui` `create*` managers:
`prefersReduced()`, `on(handler)`, `destroy()`. No presets, no per-component configuration —
exactly the helper ADR-0046 adopted and nothing beyond it.

**2. The seam moves to `dom-media.js`.** ADR-0074's `ui-media.js` was `/ui`-internal, which
was correct *at the time* — its only two consumers (F106, F108) were both on `/ui`. F111 broke
that: `/ui` already depends on `/dom` primitives (`ui-dialogs.js` composes `dom-a11y.js`'s
`focusTrap`) and never the reverse, so a module `/ui` needs has to be one `/dom` could also own
without pulling in anything Bootstrap-flavoured — and `mediaResolver` qualifies exactly: no
peer, no builder contract, just the platform seam. Renamed `ui-media.js` → `dom-media.js`,
`ui-theme.js` and `ui-breakpoints.js` repointed at it, no behaviour change.

Three call sites now share one answer to "what does an absent `matchMedia` mean" rather than
splitting two-and-one across a boundary that would have made the third copy plausible.

**3. `prefersReduced()` defaults to `false` when there is no way to ask.** Node, or an exotic
host: no evidence of a preference is not evidence of one, and the safe default is to animate as
designed rather than assume every host wants less motion — the same "absence is documented
degradation" rule ADR-0074 established, applied to a helper where the wrong default would be
the opposite kind of mistake (assuming reduction nobody asked for, rather than assuming a
breakpoint nobody has).

**4. `on()` reports the new boolean directly, not `{current, previous}`.** F108's pair exists
because a caller might want to know what the breakpoint *was*; for a single boolean, "was"
is always the logical negation of "is", so passing both would be redundant rather than
symmetrical. "Same subscribe shape as F108" is read as *the idiom* — an `on(handler)` returning
an unsubscribe, firing only on an actual change — not as a payload shape that would carry a
value with no information in it.

**5. A `bootstrap-elements.js` import was found and removed from `/dom`.** The first draft
reached for that module's `assertPlainObject` for one options-bag check, because every `/ui`
manager in this wave used it. Measuring the deep-ESM route caught it immediately: `/dom`'s
served bytes jumped from 15 495 B to 19 723 B — **over 4 kB** — for a helper that itself
measures under 300 B, because `bootstrap-elements.js` is the whole atom builder contract
(`applyClasses`, `renderContent`, the icon-set machinery, and everything else fourteen builders
share). That is precisely the dependency spec 07 §4 sends this item to `/dom` to avoid, arriving
by accident through a convenience import rather than through a design decision. Replaced with
the same three-line inline check `dom-a11y.js`'s primitives already use. Served bytes dropped
to 16 419 B — the true cost of the helper and the chunk re-split around it, not of a component
library it never needed.

**6. NFR-22 re-derived a fifth time, to 62 kB** (61 938 B). Recorded because the input that
moved this time is `/dom`, not `/ui` — the first re-derivation in this wave that a Bootstrap
entry did not cause and `/ui` did not directly grow either.

## Alternatives Considered

- **Leaving `mediaResolver` on `/ui` and writing a second, `/dom`-local copy for F111.** Smaller
  diff. Rejected: it is exactly the drift ADR-0074 extracted the first seam to prevent — two
  answers to "does absence throw or degrade" is worse than the one copy this avoids duplicating,
  and a third copy is where such drift stops being hypothetical.
- **Passing `{current, previous}` from `on()`, matching F108's payload literally.** Rejected per
  decision 4: `previous` is always `!current` for a boolean, so it would be data with no
  information, printed for consistency's sake rather than for a caller's benefit.
- **A `create*`-prefixed factory (`createReducedMotion`)**, matching the `/ui` managers'
  naming. Rejected: `/dom`'s existing primitives are bare nouns (`focusTrap`, `liveRegion`), and
  F111 is explicitly a helper rather than a manager — the naming should say so as loudly as the
  architecture does.
- **A plain function returning a boolean, no instance at all** (`prefersReducedMotion(): boolean`,
  read fresh each call, no subscription). Simplest possible surface. Rejected: it cannot satisfy
  the subscribe half F111 explicitly asks for — *"components consult, with a subscribe API"* —
  and a component that only polls will miss a mid-session OS change, which a user can make
  without reloading the page.
- **Keeping the `assertPlainObject` import and accepting the 4 kB.** Rejected outright once
  measured: an architecture note in a doc comment is not worth 4 kB served on the entry that
  spec 07 §4 exists specifically to keep component-library-free. The fix cost three lines.

## Consequences

- **The public surface goes from 132 exports to 133** — `reducedMotion` on `/dom` — with **no
  new `exports`-map path**. NFR-31 holds.
- **`dom-media.js` is now `/dom`-internal infrastructure with two external-looking consumers.**
  A reader of `/ui`'s source who wonders why a `/dom` module appears in its import graph finds
  the answer in this ADR and in `dom-media.js`'s own module comment, which states the
  dependency direction explicitly.
- **M20's last capability item is the smallest by shipped code and the one that found the
  largest single mistake** — a 4 kB accidental dependency caught by the same F87 measurement
  discipline the wave has followed since 20.1. That the measurement caught it before merge,
  rather than being noticed later as "why is `/dom` so much bigger than it should be," is the
  argument for keeping the served-byte gate at every item rather than only at milestone
  boundaries.
- **The `/ui` served figure moved by −38 B with no `/ui` source touched**, purely from the
  shared-chunk re-split around the fix to `/dom`. Recorded rather than left as unexplained
  noise, per the standing rule this wave has kept since ADR-0071.
- **20.7** (the Playwright flakiness item) and the M20 release are what remain after this PR;
  no further capability items are open.

## References

- [spec 07](../specs/07_spec_application_ux.md) §2 F111, §4, §6, NFR-33/NFR-35.
- [ADR-0046](0046-one-proposal-triaged-and-the-no-bundler-wave-adopted.md) §46 — the
  MotionManager rejection and the helper this item is scoped to.
- `src/test/browser/dom-motion.spec.js` — the one wiring claim spec 07 §6 asks a browser for,
  using Playwright's `emulateMedia({ reducedMotion })` rather than a stub.
