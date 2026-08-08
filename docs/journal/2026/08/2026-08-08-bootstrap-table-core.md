# 2026-08-08 — The table, and the door left in the facade (roadmap 15.1)

## What got done

- `bsTable` on `egl-utils-js/bootstrap` (spec 04 F66): a complete Bootstrap 5 table
  rendered from column descriptors over an F42 `tablePipeline`, with the header built once,
  the body re-rendered from each `'change'` view through one `DocumentFragment`, style flags
  mapped to the documented `table-*` classes, and `responsive` wrapping.
- [ADR-0039](../../../adr/0039-a-facade-with-a-door-and-what-the-table-costs.md) fixes the
  four decisions the implementation forced, and spec 04's F66 clause was **amended in the
  same PR** to match.
- `closestWithin` moved from `bootstrap-composites.js` to `bootstrap-elements.js`, where the
  shared builder internals live — three delegating builders, one implementation.
- 43 new tests (100% lines and branches on the new file; 2050 green overall), the bypass
  corpus extended to the table's six content paths, a Node-matrix case that renders a paged
  table server-side, patterns row 19 (Facade), and the threat model's tabulated-record row.

## Decisions taken

- **The pipeline is borrowed when given, owned when built, public in both cases.** The
  original clause said the facade *owns* one, which would have foreclosed the SSR-adoption
  story spec 03 §4 uses to justify a pure pipeline. Passing `pipeline` alongside
  `data`/`pageSize`/`locale` is a `TypeError`, not a silent precedence rule.
- **A cell refuses to guess.** No `format`: primitives render, nullish blanks, a node is
  itself — anything else throws naming the column. `String(value)` would ship
  `[object Object]`, and a `Date` would render in the runtime's default format, which is a
  human-readable string NFR-21 reserves for the caller.
- **A column's `{html, sanitize}` governs its cells only**; the header takes the table's.
- **A clickable row is keyboard-operable** (`tabindex`, Enter/Space), and a click on a
  control inside the row belongs to that control.

## Lessons

- **A test caught a real design defect.** The header label was inheriting the *column's*
  markup decision, so enriching a status column silently reinterpreted its own label — a
  narrow injection path from configuration. The `sanitize` spy calling twice instead of once
  is what surfaced it; assert call *counts*, not just effects.
- **`element.querySelector('tbody tr')` does not mean "my tbody's rows".** A descendant
  combinator is matched against the whole document ancestry, so once a table sits inside
  another table's cell, the inner table's *header* row also has a `tbody` ancestor — the
  outer one's — and the selector picks it up. `:scope >` is what actually means "mine".
  Worth remembering for 15.2's `sortHeaders: {root, selector}`.
- **Pre-declaring a budget worked.** `{bsTable}` measured 5324 B against the 6.5 kB row
  spec 04 wrote before the code existed — the first ceiling in this arc that held without
  amendment, because it was set from what the facade *composes* (the pipeline alone is
  3250 B) rather than from an intuition about a component's size.

## Where the project stands

M14 complete and v0.7.0 shipped; 15.1 done, **15.2 (`bsTable` controls, F67) is the last
item in M15**, then v0.8.0. ADRs through 0039, next free 0040. `/bootstrap` full import is
now 10525 B against its unchanged 15 kB clause.

## How the next session resumes

1. Wait for this PR to merge (one PR at a time).
2. Start roadmap **15.2** on `feat/bootstrap-table-controls`: the `controls` option —
   per-column filter row speaking the F33 grammar (custom `{operators}` included), global
   search, page-size select, an F65 pagination bar, all wired through F51
   `bindTableControls` to the pipeline this PR exposed, plus the Playwright end-to-end
   scenario. `data-sort-key` is already stamped by 15.1, so the header is not rebuilt.
