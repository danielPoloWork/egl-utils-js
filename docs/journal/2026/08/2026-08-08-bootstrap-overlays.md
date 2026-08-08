# 2026-08-08 — Three shapes that are not a group (roadmap 16.3)

## What got done

- **`bsOffcanvas`, `bsCarousel`, `bsScrollspy`** in a new `bootstrap-overlays.js` — spec 04
  F77–F79, fixed by [ADR-0043](../../../adr/0043-three-shapes-that-are-not-a-group.md).
- `uniqueId` and `documentOf` moved from `bootstrap-nav.js` to `bootstrap-elements.js`,
  beside `resolveDocument`, so the overlay file does not depend on the navigation file for
  helpers that belong to the builder contract.
- 29 jsdom cases and 3 real-engine cases; global coverage 100% lines, 2184 tests.
- Budgets: `bsOffcanvas` 1150 B and `bsScrollspy` 1040 B inside the unchanged wrapper
  clause; `bsCarousel` 2310 B → clause 1.5 → 2.5 kB; entry 18390 B, **clause unmoved**.

## Decisions taken

- **Each of the three got the treatment it fits, not the one that would look consistent.**
  The offcanvas is a `behaviourWrapper` configuration. The scrollspy is not: it has no open
  state, so routing it through the shared helper would have given it `show`/`hide`/`toggle`
  that throw and `shown`/`hidden` subscriptions that never fire. A shared abstraction is
  worth having exactly while the things sharing it are the same shape.
- **`bsScrollspy` gains `nav`** (Bootstrap's `target`): the frozen clause had no way to name
  the links it marks, so it described a component with no observable output. Amended in the
  spec rather than worked around.
- **`alt` is what declares a slide an image, and required the moment it does** — so an
  image cannot reach the page unlabelled, because the field that makes it an image is the
  field that labels it. ADR-0038's F61 rule, expressed through the field names spec 04 had
  already frozen.
- **Autoplay stays off** unless `ride`/`interval` are given: motion that begins without a
  request is an accessibility decision belonging to the caller.
- **Indicators are numbered by default** — digits say the same thing in every language,
  while `previous`/`next` must be words and so default to English, injectable.

## Findings worth carrying forward

- **Four wrappers, four fits.** `bsOffcanvas` (1150 B) and `bsScrollspy` (1040 B) join
  `bsModal` (1180 B) and `bsDropdown` (1160 B) inside the ≤ 1.25 kB clause, and every
  symbol that has exceeded it — `bsToast`, `bsCollapse`, `bsCarousel` — is one that also
  builds or wires. The clause is now evidenced rather than assumed, and the predictor is
  "does it build?" rather than "is it a wrapper?".
- **The entry ceiling has not moved for three milestones.** ADR-0041 sized it once for the
  finished catalogue instead of amending per PR, and that has now saved three amendments.
  Worth repeating whenever a clause is written against a surface still being built.
- **A synchronous test double hides orderings.** The close-then-dispose assertion passed
  vacuously until the double deferred its `hidden` event: with a synchronous fake, `hide()`
  completes inside `destroy()` and the two states collapse into one. Same lesson as 16.1's
  async double, met from the other direction — this time the test was *green* when it
  should have been red.
- Scrollspy is the first component whose behaviour only a browser can show: it is
  `IntersectionObserver` over real scroll geometry, so jsdom proves the wiring and nothing
  more.

## Where the project stands

M14 and M15 complete; **M16 three of five items in** (16.1–16.3 done; **16.4 and 16.5
open**). v0.7.0 remains the released version and **v0.8.0 is still uncut** — five changesets
now pending (15.1, 15.2, 16.1, 16.2, 16.3). ADRs through **0043, next free 0044**. Local
Firefox still cannot launch; Chromium and WebKit are green.

## How the next session resumes

1. Wait for this PR to merge (one item per PR).
2. Then **16.4** on `feat/bootstrap-popper-overlays`: `bsTooltip` and `bsPopover` (spec 04
   F80–F81) — **the last two components, which close the 24/24 catalogue**. Two things make
   them unlike anything so far: they need `@popperjs/core` as well as `bootstrap`, so the
   F68 failure must name it; and they are the only components that hand content to a
   *third-party renderer*, so the one-sanitizer rule matters — sanitize once, ours, and
   disable Bootstrap's own only on that already-sanitized path.
3. Still open: 16.5 (BUG-0003), and the v0.8.0 release decision. After 16.4 the catalogue
   is complete, which is the natural moment to open the v1.0.0 discussion.
