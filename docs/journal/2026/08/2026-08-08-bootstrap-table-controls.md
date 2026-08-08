# 2026-08-08 — The controls, and M15 complete (roadmap 15.2)

## What got done

- `bsTable` gained its `controls` option (spec 04 F67): a per-column filter row, a global
  search box, a page-size select, an F65 pagination bar and a toolbar slot, wrapped in
  header/footer bands around the table and wired to its pipeline through F51
  `bindTableControls`.
- `tablePipeline` gained `operators` (spec 03 **F42 amended**), the F33 custom-token
  vocabulary, applied to every filter string it compiles.
- [ADR-0040](../../../adr/0040-one-grammar-one-pager-and-a-ceiling-below-its-own-parts.md);
  spec 04 F67 and spec 03 F42 both amended in the same PR; 20 new tests (100% lines and
  branches on the module, 2072 green overall); patterns row 19 extended.

## Decisions taken

- **The operator vocabulary belongs to the pipeline, not to the control.** F67 promised
  filter boxes that speak custom operators; the pipeline forwarded only `locale` to
  `compileFilter`, so no code in the Bootstrap layer could have kept that promise. Fixed
  where compilation happens — which also fixes it for `setFilter` called from application
  code.
- **The pager is wired through F65's own `onPage`/`update`, not F51's prev/next pair**
  (F65 already contains prev and next), and it rides the table's existing `'change'`
  subscription. Only the status element goes through F51.
- **Every human-readable string is injectable**; the defaults render digits. An "all"
  page-size option exists only when the caller supplies its word.
- A column with `filterable: false` gets an empty cell, not a box whose first keystroke
  the pipeline would reject.

## Lessons

- **A pre-declared ceiling can be arithmetically impossible, and saying so is the fix.**
  `bsTable` measured 8842 B against the 6.5 kB spec 04 pre-declared — but the rows of the
  three parts that clause itself names already sum to 6774 B, so nothing could have met
  it. Amended to 9.5 kB with the arithmetic on the record. Exactly the `bsBreadcrumb`
  error of ADR-0038, one wave later: an estimate written beside real numbers that were
  never added up.
- **The same measurement proved the design claim.** The controls added 3518 B against
  3499 B of composed parts — 19 bytes of glue. That is what "composes, does not
  reimplement" looks like when it is true.
- **A component that renders from a subscription needs its initial state pushed too.** The
  pager was built on its own defaults (one page) and only corrected on the first
  `'change'`, so a fresh table showed a one-page bar. Caught by a test asserting the
  button count, not the behaviour after a click.
- **When a promise in one spec depends on a gap in another, fix the gap.** Compiling the
  expression inside `bsTable` would have worked for boxes and left `setFilter` deaf — one
  library, two grammars.

## Where the project stands

**M15 complete**; specs 01–03 delivered, spec 04 at 4 of 8 items. ADRs through 0040, next
free 0041. `/bootstrap` measures 12961 B against its unchanged 15 kB clause. Next is
**v0.8.0**, then M16 — the peer-backed wrappers that close the 24/24 catalog.

## How the next session resumes

1. Wait for this PR to merge, then cut **v0.8.0** (the release recipe is in memory: branch
   off `changeset-release/main`, restore the changelog skeleton, write both the
   `docs/changelog/v0/` and `docs/releases/` files in one commit).
2. Then roadmap **16.1** on `feat/bootstrap-interactive-core`: the F68 resolution contract
   (lazy, injected-first, `globalThis.bootstrap` second, stable `EGL_PEER_MISSING` on
   `egl-utils-js/errors`) plus `bsToast`, `bsModal` and `bsLoadingOverlay` over the F50
   gate. That PR adds `bootstrap` as an optional peer and the real package as a
   devDependency, and extends the Playwright fixture to load `bootstrap.bundle.min.js`.
