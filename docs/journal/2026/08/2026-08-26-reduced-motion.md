# 2026-08-26 — One query point, and a seam that crossed a boundary (roadmap 20.6)

## What got done

- **`reducedMotion` on `egl-utils-js/dom`** (F111): the last capability in M20.
  [ADR-0075](../../adr/0075-one-query-point-and-a-seam-that-crossed-a-boundary.md).
- **The `matchMedia` seam relocated** from `ui-media.js` (`/ui`-internal) to `dom-media.js`
  (`/dom`-internal), with `ui-theme.js` and `ui-breakpoints.js` repointed at the new path.
- **A 4 kB accidental dependency found and removed**: a first draft imported
  `bootstrap-elements.js`'s `assertPlainObject` for one validation check.
- 20 unit tests plus 1 three-engine browser test; `dom-motion.js` and `dom-media.js` both at 100%
  on every dimension.
- NFR-22 re-derived a **sixth** time (62 kB, 61 938 B) — the first re-derivation this wave that a
  `/dom` change caused rather than `/ui`.
- 132 exports become 133. No new `exports` path, no new error code, nothing renamed.
- **All of spec 07 (F101–F111) is now delivered.** The six spec-coverage rows for spec 07 flip to
  done in this PR; only ROADMAP 20.7 — a verification-infrastructure item, not a spec item —
  remains open in M20.

## The helper was small; the interesting problem was where things live

F111 asks for the smallest thing in the wave: one boolean, one subscribe. ADR-0046 already
drew the boundary it has to stay inside — a `MotionManager` (an animation-preset system) was
rejected, and only *"a reduced-motion policy helper"* was adopted. That made the helper itself
close to mechanical.

What was not mechanical: spec 07 §4 puts F111 on `/dom`, next to F109 and F110, because it
*"needs no component library at all"* — while the seam it needs (`mediaResolver`, extracted in
20.4) lived on `/ui`, because its first two consumers (F106, F108) were both there. Third
consumer, wrong side of the boundary.

The dependency direction settled it: `/ui` already depends on `/dom` primitives —
`ui-dialogs.js` composes `dom-a11y.js`'s `focusTrap` — and never the reverse. A module `/ui`
needs has to be one `/dom` could also own without pulling in anything Bootstrap-flavoured, and
`mediaResolver` qualifies exactly: no peer, no builder contract, just the platform seam. So it
moved — `ui-media.js` → `dom-media.js` — rather than being copied a third time. Three call sites
now share one answer to "what does an absent `matchMedia` mean" instead of splitting
two-and-one across a boundary that would have made the third copy plausible.

## The measurement discipline caught a real mistake

The first draft of `reducedMotion` reached for `bootstrap-elements.js`'s `assertPlainObject` for
one options-bag check — every `/ui` manager in this wave used it, so it was the obvious import
to reach for out of habit.

Measuring the deep-ESM route caught it immediately: `/dom`'s served bytes jumped from 15 495 B
to **19 723 B** — over 4 kB — for a helper that itself measures under 300 B. `bootstrap-elements.js`
is the whole atom builder contract: `applyClasses`, `renderContent`, the icon-set machinery, and
everything else fourteen builders share. That is precisely the dependency spec 07 §4 sends this
item to `/dom` to avoid, arriving by accident through a convenience import rather than through a
design decision.

The fix was three lines — the same inline `options === null || typeof options !== 'object'`
check `dom-a11y.js`'s primitives already use. Served bytes dropped to 16 419 B, which is the true
cost of the helper and the chunk re-split around it, not of a component library it never needed.

Worth naming plainly: this is exactly what the F87 served-byte gate is for, and it caught the
mistake before merge rather than after — before "why is `/dom` so much bigger than it should be"
became a question someone had to debug months later.

## Two small design calls

**`on()` passes the new boolean directly, not `{current, previous}`.** F108's pair exists
because a caller might want the breakpoint's old name; for one boolean, "was" is always the
logical negation of "is", so passing both would be data with no information. "Same subscribe
shape as F108" was read as the *idiom* — `on(handler)` returning an unsubscribe, firing only on
an actual change — not as a literal payload shape.

**Naming follows `/dom`'s convention, not `/ui`'s.** `focusTrap`, `saveFocus`, `liveRegion` are
bare nouns; the `/ui` managers are `create*`-prefixed. `reducedMotion` took the bare-noun form,
which also says "helper" as loudly as the architecture does.

## Where the project stands

v1.2.0 released. **M20's capability work is complete**: 20.5, 20.1, 20.2, 20.3, 20.4 and 20.6 are
all done. Only **20.7** (Playwright suite flakiness, filed by 20.1, not a spec item) remains open
in the milestone. `.changeset/` holds six minor entries; `[Unreleased]` has all six. ADRs through
0075, next free 0076. Every gate green.

## How the next session resumes

1. Wait for this PR to merge (one item per PR).
2. **20.7** is the only thing left before M20 can close. It is infrastructure, not a feature: bound
   the Playwright workers, or serve the peer assets from memory instead of the repo's static
   server, and decide whether the same contention shape can bite CI.
3. Once 20.7 lands, M20 is done and a **v1.3.0** release is due — six changesets are already
   queued (20.5, 20.1, 20.2, 20.3, 20.4, 20.6), each a minor bump.
4. Spec 07 is now fully delivered (F101–F111); no further items reference it.
