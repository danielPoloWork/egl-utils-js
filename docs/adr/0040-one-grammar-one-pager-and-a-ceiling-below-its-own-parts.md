# ADR-0040: One grammar, one pager — and a ceiling that sat below its own parts

- **Status:** Accepted
- **Date:** 2026-08-08
- **Deciders:** Daniel Polo
- **Related:** [spec 04 §2 F67, §3 NFR-17/NFR-21](../specs/04_spec_bootstrap_toolkit.md),
  [spec 03 §2 F42](../specs/03_spec_dom_ui_table.md) (amended here: the pipeline gains the
  operator vocabulary), ROADMAP 15.2,
  [ADR-0039](0039-a-facade-with-a-door-and-what-the-table-costs.md) (the table this
  completes), [ADR-0035](0035-the-controls-bridge-and-the-dom-budget.md) (the F51 bindings
  every control is wired through), [ADR-0038](0038-composites-compose-and-what-a-frozen-constant-costs.md)
  (the F65 pager, and the precedent of a ceiling set below what it measures),
  [ADR-0021](0021-filter-expression-grammar.md) (the F33 grammar the inputs speak),
  [ADR-0015](0015-final-size-budgets-and-the-httpclient-exception.md) (measure, then amend
  the budget with a named row)

## Context

15.1 left the table driven only from code. 15.2 adds the controls a user touches — a
filter row, a search box, a page-size select, a pagination bar — and the whole point is
that none of the behaviour behind them is new: debouncing, `aria-sort`, teardown and
one-way reflection are F51; the numbered pager is F65; the filter grammar is F33. Three
questions appear anyway.

**Can a filter box actually reach a project's own operators?** Spec 04 F67 promises inputs
"speaking the F33 grammar including custom `{operators}`". F33 takes an `operators` option;
`tablePipeline` (F42) compiles every filter string it is given — and forwards only
`locale`. So the vocabulary was unreachable from *any* string filter on a pipeline, not
merely from a Bootstrap box: `setFilter('host', '~01')` from application code was equally
deaf to it. The promise in F67 could not be kept by anything written in the Bootstrap
layer.

**How do two pagination models compose?** F51's `pagination` binding is a prev/next pair
plus a status element. F65 is a windowed bar of numbered pages that already contains prev
and next. Wiring the bar *through* F51 would put two controls on one job.

**What does a facade over three subsystems actually cost?** Spec 04 pre-declared
`bsTable ≤ 6.5 kB`, described as "a facade over F42 + F51 + F65 … the NFR-12 lesson,
pre-declared".

## Decision

**1. The operator vocabulary belongs to the pipeline, not to the control.**
`tablePipeline` gains an `operators` option and passes it to **every** `compileFilter` call
it makes — column filters and the global search alike. Spec 03's F42 clause is amended in
this PR to say so. The Bootstrap input then needs no knowledge of the grammar whatsoever:
it hands over text, which is exactly why a custom token works through it.

**2. The pager is wired the way F65 was designed to be, and only the status text goes
through F51.** `bsPagination` gets `onPage: (page) => pipeline.setPage(page)` and its
`update(view)` rides the *same* `'change'` subscription the table body already needs — one
listener for everything the instance draws. F51 keeps `filters`, `search`, `pageSize`,
`sortHeaders` and the status element.

**3. `bsTable`'s budget is amended to 9.5 kB (measured 8842 B), because the 6.5 kB clause
was arithmetically impossible.** The rows for the three parts the clause itself names
already sum to **6774 B** — `tablePipeline` 3275 + `bindTableControls` 2093 +
`bsPagination` 1406 — so no facade over them could have met 6.5 kB before rendering a
single cell. The same class of error ADR-0038 found in `bsBreadcrumb`'s ceiling, and the
same remedy: amend the clause with the arithmetic on the record, never quietly drop the
obligation. The measurement also settles the design claim: the controls added **3518 B**
against **3499 B** of composed parts — **19 bytes of glue**.

**4. Every human-readable string a control emits is injectable, with an English accessible
name as the only default.** The search box, the page-size select and each filter input
carry `aria-label`s (`'Search'`, `'Rows per page'`, `` `Filter ${column}` ``); the status
text keeps F51's language-neutral `'1 / 4'`; page-size options are digits. An "all" choice
exists **only** when the caller supplies its word, because "All" is English and this
library will not put it in a consumer's UI unasked (the F57/F65 precedent under NFR-21).

**5. A column that declared itself unfilterable gets a cell, not a box.** Rendering an
input whose first keystroke would throw `column is not filterable` is worse than rendering
none.

## Alternatives Considered

- **Compile filter text inside `bsTable` with a `controls.operators` option**, calling
  `compileFilter` and passing the resulting predicate to `setFilter`. Rejected: it hides a
  library-wide gap behind one component — code calling `setFilter` with a string would
  still be deaf to the project's own tokens — and it would put grammar knowledge in the
  presentation layer, which is precisely the coupling this architecture exists to avoid.
- **An adapter object wrapping the pipeline, handed to `bindTableControls`**, whose
  `setFilter` compiles with the custom vocabulary. Rejected for the same reason, plus it
  makes the binding reflect a pipeline that is not quite the one the caller holds.
- **Render prev/next ourselves and wire them through F51's pagination binding**, dropping
  F65. Rejected: it discards the numbered pages, which are the reason to have a pager
  component at all.
- **Give the pager its own `'change'` subscription.** Rejected: two subscriptions where one
  suffices, and two teardown paths to keep correct.
- **Ship an "All" page-size option by default.** Rejected under NFR-21: a default that is a
  word is a default that is a language.
- **Trim the facade to fit 6.5 kB** by inlining a smaller pager or hand-rolling the
  debounce. Rejected: it would trade 19 bytes of glue for a second implementation of things
  that already exist and are already tested — the opposite of the wave's rule.

## Consequences

- `tablePipeline` gains one option and 18 bytes; `/table` measures 3291 B against an
  unchanged 3.5 kB clause. Any consumer of the pipeline — Bootstrap or not — can now define
  a filter vocabulary once and have it apply to every string it compiles.
- `bsTable`'s per-import row moves to 9.5 kB and the `/bootstrap` entry to 13.9 kB
  (measured 12961 B), still inside its unchanged 15 kB clause. Consumers who import a badge
  still pay for a badge: every atom's row is untouched.
- `element` is now the outer wrapper when controls are rendered — the rule ADR-0039 set
  ("the node this instance owns") generalises rather than changes, and `table` still names
  the `<table>`.
- `controls` exposes the rendered nodes for the same reason `.pipeline` is public: a facade
  that hides its own markup forces callers to `querySelector` into it.
- The filter row lives inside `<thead>` as `<td>` cells, so it is not announced as headers
  for the data below, and a click on a filter input cannot reach the sort delegation.

## References

- [spec 04 §2 F67](../specs/04_spec_bootstrap_toolkit.md) — the clause, as amended here
- [spec 03 §2 F42](../specs/03_spec_dom_ui_table.md) — the pipeline clause, amended for
  `operators`
- [`bootstrap-table.js`](../../src/main/javascript/it/d4np/utils/bootstrap-table.js)
- [`bootstrap-table.test.js`](../../src/test/javascript/it/d4np/utils/bootstrap-table.test.js)
