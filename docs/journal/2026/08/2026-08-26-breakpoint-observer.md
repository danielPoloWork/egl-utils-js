# 2026-08-26 — Five queries, and a seam written once (roadmap 20.4)

## What got done

- **`createBreakpoints` and `BOOTSTRAP_BREAKPOINTS` on `egl-utils-js/ui`** (F108).
  [ADR-0074](../../adr/0074-bootstraps-own-mixins-five-queries-and-a-seam-written-once.md).
- **The `matchMedia` seam extracted** into `ui-media.js` on its third use, with the F106 theme
  manager rewritten onto it.
- 41 unit tests including a property test over every width from 0 to 4000, plus 3 three-engine
  browser tests for the wiring claim; `ui-breakpoints.js` and `ui-media.js` both at 100% on every
  dimension.
- NFR-22 re-derived a **fifth** time (61 kB, 61 685 B); a per-function size row for
  `createBreakpoints` (1 237 B against a 9 567 B entry).
- 130 exports become 132. No new `exports` path, no new error code, nothing renamed.

## The item was smaller than the roadmap said, and more interesting than it looked

Smaller because 20.3 already landed the NFR-34 floor amendment this item was written to owe —
"follow the system" is a media query, so F106 needed `matchMedia` first. What remained was the
vocabulary and the shape.

More interesting because **Bootstrap's breakpoint mixins do not mean what their names say**, and
the gap is a documented source of bugs. `media-breakpoint-down(md)` compiles to
`max-width: 767.98px` — *narrower than* md, excluding md itself. That is a deliberate Bootstrap 4
→ 5 change, and a wrapper that guesses from the name gets it backwards for every caller reading
their SCSS beside their JavaScript.

Worse: `_breakpoints.scss`'s own inline comment for that mixin says *"the given breakpoint and
narrower"*, which contradicts the `$min - .02` its `breakpoint-max` computes two functions above.
The code was followed and the discrepancy recorded in the ADR, so the next reader does not have
to re-derive which of the two to trust.

## Five queries instead of eleven

The observation that shaped the implementation: because BS5's `-down` is the *complement* of
`-up`, and `-only`/`-between` are intersections of two `-up`s, the entire four-predicate
vocabulary derives from **one `min-width` query per non-zero breakpoint**. Five listeners, not
one per predicate.

The consequence worth more than the byte saving: **`max-width: 767.98px` appears nowhere in this
library.** That expression is where a hand-rolled version gets its off-by-one, and it is
invisible when wrong — 767.8, 767.98, 768 all look plausible in review.

It also buys the soundness of the notification rule. Because the matching set is nested,
`current()` fully determines every predicate — so "the active breakpoint changed" and "the
matching set changed" are the same event, which is what lets `on()` fire exactly once for a
resize that flips four queries at once.

## Two refusals rather than two guesses

`media-breakpoint-down(xs)` is unconditionally true in Bootstrap — not because anything is
narrower than zero, but because its `@if $max` falls through to the unguarded branch. And
`between('lg','md')` compiles to a query that can never match.

Both are caller mistakes that would otherwise come back as a plausible boolean, so both throw and
name why. Fidelity to an artefact is not fidelity to an intent. The breakpoint map is validated
for the same reason — ascending, starting at zero — because every derivation rests on the set
being nested, and an out-of-order map produces answers that look right. Bootstrap asserts the
same property about `$grid-breakpoints`, for the same reason.

## The seam, on its third use

The theme manager (20.3) resolved `matchMedia` itself. This item needed the same three things —
injected first, ambient second, absence legal — and 20.6's reduced-motion helper will need them a
third time. So `ui-media.js` now owns it and `ui-theme.js` was rewritten onto it in this PR.

The behaviour that would have drifted is precisely the interesting one: **whether an absent
`matchMedia` throws or degrades**, and whether a caller's fake gets validated at all. Written
twice, those two answers diverge inside a release. One difference from the theme manager's
original: validation is now **per query** rather than once per instance, because the observer
opens five and a fake that answers one but not another is a fake with a gap in it.

## What the tests are for, and who owns which claim

Spec 07 §6 divides this precisely — *"the fake proves the logic and only an engine proves the
wiring"* — so:

- The **fake models a viewport width**, not five independent booleans. A test says "the window is
  800 px" and every query answers consistently; hand-setting flags would let a test assert a
  viewport that cannot exist (`up('lg')` true while `up('md')` false) and then pass.
- The **property test** runs every width from 0 to 4000 and asserts the four invariants a caller
  actually assumes: `up` is exactly "at or below the active breakpoint", `down` is its exact
  complement, `only` is true for exactly one name, and `between` contains the active breakpoint
  iff it lies in the half-open interval.
- The **browser tests** make only the claims a fake cannot: that the emitted queries are ones a
  real engine understands, that a real resize fires a real `change`, and that the boundary is
  **768 rather than 767** — which is what would catch a changed pixel on a future Bootstrap bump.
  One of them asserts the observer needs no peer and no stylesheet, which is true and easy to
  break by accident.

## What it cost

| | before | after |
|---|---:|---:|
| `/ui` size-limit row | 8 796 B | 9 567 B |
| `/ui` served, deep ESM | 22 499 B / 8 req | 23 462 B / 8 req |
| artifact (size-limit) | 43 460 B | 44 210 B |
| artifact served | 43 430 B | 44 214 B |
| NFR-22 derivation | 60 914 B → 60 kB | 61 685 B → **61 kB** |

No new requests on any route — the observer landed inside files `/ui` already pulled. And
`createBreakpoints` alone measures **1 237 B against a 9 567 B entry**, 13% of it, which is the
NFR-02 shakeability claim as a number rather than an assertion: a page that wants only breakpoints
pays for the observer, the shared seam and the option check, and for none of the three managers.
That is why it earned its own size row.

No new pattern for the catalogue. The extraction is composition rather than a pattern, and the
seam is the Dependency Injection rows 10 and 16 already record — the policy says never force-fit.

## Where the project stands

v1.2.0 released. M20 in progress: 20.5, 20.1, 20.2, 20.3 and 20.4 done; **20.6 and 20.7 open**.
`.changeset/` holds five minor entries; `[Unreleased]` has all five. ADRs through 0074, next free
0075. Every gate green.

## How the next session resumes

1. Wait for this PR to merge (one item per PR).
2. **20.6** is the last capability in the wave and the smallest: F111's reduced-motion helper, one
   query through the seam this item extracted, on the same subscribe shape. ADR-0046 rejected a
   MotionManager, so it is explicitly a *helper* — worth deciding early whether it is a factory
   returning an instance (consistent with the wave) or a plain function returning a boolean plus a
   subscribe (consistent with being "one query point"). The tension is real and the ADR should
   name it.
3. **20.7** is the browser-suite flakiness, unrelated to the wave's features, and the only thing
   left in M20 that is not a capability.
4. After both, M20 closes and the release item is a v1.3.0 cut — five changesets are already
   queued.
