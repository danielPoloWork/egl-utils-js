# 2026-08-08 — Ids are the accessibility (roadmap 16.2)

## What got done

- **`bsCollapse`, `bsAccordion`, `bsDropdown`, `bsTabs`, `bsNavbar`** in a new
  `bootstrap-nav.js` — spec 04 F72–F76, fixed by
  [ADR-0042](../../../adr/0042-ids-are-the-accessibility-and-a-ceiling-derived-not-guessed.md).
  Two wrap; three build markup when given items and adopt existing markup when not.
- **The 16.1 lifecycle extracted** into `behaviourWrapper`, with `bsModal` refactored onto
  it — five copies of a subtle close-then-dispose teardown were the alternative.
- 44 jsdom cases and 4 real-engine cases; `bootstrap-nav.js` at 100% lines, global coverage
  100% lines / 99.5% branches, 2157 tests.
- Budgets: `bsDropdown` 1160 B (inside the wrapper clause), `bsCollapse` 1380 B,
  `bsTabs` 2050 B, `bsAccordion` 2490 B, `bsNavbar` 2770 B, entry 17334 B (inside the
  25 kB clause ADR-0041 sized for the whole catalogue, so no clause moved there).

## Decisions taken

- **Ids come from the document, never from a counter.** A module-level counter is shared
  mutable state, and two copies of the library on one page would each restart it and
  collide — the dual-package case spec 01 §4 exists for. A random suffix is probabilistic
  where an exact answer is available.
- **Managers build or adopt through the same selector** their own output satisfies, so the
  two paths cannot drift; `destroy()` removes what was built and leaves what was adopted.
- **Exclusivity, keyboard roving and positioning stay Bootstrap's** — `parent` for the
  accordion, the Tab plugin for arrow keys, Popper for dropdowns. A second implementation
  of any of them would fight the first.
- `bsCollapse` passes `toggle: false`, deviating from Bootstrap's default, because lazy
  resolution means the constructor runs at the first `show()` — where the default would
  fire the action twice.

## Findings worth carrying forward

- **The reservation set was found by a test, not by reasoning.** Ids are minted before the
  nodes are appended, so `getElementById` cannot see them yet: every pane in one accordion
  took the same id and every `aria-controls` resolved to the first one. The assertion that
  caught it — `document.getElementById(pane.id) === pane`, per item — is the only shape
  that could have; asserting "the attribute is set" would have passed happily. When the
  thing under test is a *relationship*, assert that it resolves, not that it exists.
- **A convention I broke in 16.1, corrected here.** `bsToast` resolved the ambient document
  while `bsTable` and `bsPagination` use the container's own. For a container in an iframe
  that builds in the wrong document. Caught by writing the same test for the new managers
  and noticing the older one could not pass it.
- **`append` adopts.** A test asserting that an explicitly-named foreign document survives
  into a container elsewhere was wrong, not the code: appending moves the node into the
  container's document. Which is itself the argument for defaulting to the container's.
- **The budget rule from ADR-0041 paid off immediately.** Four ceilings were derived from
  the rows of their parts before measuring rather than re-estimated, and `bsNavbar`'s
  prediction (2540 B of parts plus its own glue) matched at 2770 B.
- jsdom's `iframe.contentDocument` swaps documents asynchronously;
  `document.implementation.createHTMLDocument()` is the synchronous way to get a second
  document in a jsdom test.

## Where the project stands

M14 and M15 complete; **M16 two of five items in** (16.1, 16.2 done; 16.3, 16.4, 16.5
open). v0.7.0 is the released version and **v0.8.0 is still uncut** — three changesets now
pending (15.1, 15.2 from M15, plus 16.1 and this one), so whichever release comes next
carries M15 and part of M16 unless M15's is cut first. ADRs through **0042, next free
0043**. Local Firefox still cannot launch; Chromium and WebKit are green.

## How the next session resumes

1. Wait for this PR to merge (one item per PR).
2. Then **16.3** on `feat/bootstrap-overlays`: `bsOffcanvas`, `bsCarousel`, `bsScrollspy`
   (spec 04 F77–F79). `bsOffcanvas` is a `behaviourWrapper` configuration and should be
   nearly free; `bsCarousel` builds slides/controls/indicators and will want the id
   discipline above; `bsScrollspy` is the odd one — it observes rather than opens, so its
   `on('activate')` maps an event the shared wrapper does not model.
3. Still open and independent: 16.5 (BUG-0003), and the v0.8.0 release decision.
