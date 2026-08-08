# ADR-0039: A facade with a door — the borrowed pipeline, the cell that refuses to guess, and what the table costs

- **Status:** Accepted
- **Date:** 2026-08-08
- **Deciders:** Daniel Polo
- **Related:** [spec 04 §2 F66, §3 NFR-17/NFR-19/NFR-20/NFR-21](../specs/04_spec_bootstrap_toolkit.md),
  ROADMAP 15.1, [ADR-0037](0037-builder-contract-nodes-escape-and-the-atom-budget.md) (the
  builder contract the cells obey), [ADR-0038](0038-composites-compose-and-what-a-frozen-constant-costs.md)
  (compose, never reimplement), [ADR-0034](0034-one-owner-one-derivation-and-the-pipeline-budget.md)
  (the F42 pipeline this renders), [ADR-0035](0035-the-controls-bridge-and-the-dom-budget.md)
  (the F51 bindings 15.2 will wire), [ADR-0029](0029-delegation-teardown-and-setter-symmetry.md)
  (delegation and structural teardown), [ADR-0015](0015-final-size-budgets-and-the-httpclient-exception.md)
  (measure, then amend the budget with a named row)

## Context

`bsTable` is the toolkit's flagship and the first export in the wave that composes a whole
subsystem rather than a component. Everything under it exists: derivation (F42), delegation
(F44), the builder contract (F52). What 15.1 has to decide is what a *facade* owes its
caller — and four questions only appear once a facade of this size is real.

**Does the facade own the pipeline, or borrow it?** Spec 04 says `bsTable` "owns a
`tablePipeline` instance exposed as `.pipeline`". That covers the common case and blocks a
real one: spec 03 §4's own argument for a pure pipeline is that the same instance can
pre-derive page one during a server render and be adopted by the browser afterwards, and an
application may already hold a pipeline shared with a chart or a summary panel. A facade
that can only build its own forbids exactly the composition the layer below was designed
for.

**What does a cell do with a value that is not a string?** Every hand-written table answers
this by accident — `${value}` in a template literal — and the accident is visible in
production as `[object Object]` in a column, or a date rendered in whatever format the
runtime happened to pick.

**Whose markup decision governs a header?** A column that renders rich cells needs
`{ html, sanitize }`. Its header label is a different piece of content, authored by the
developer rather than drawn from a record.

**Is a clickable row a control?** `onRowClick` is the most requested table feature and the
most common accessibility defect: a row that responds to a pointer and to nothing else.

## Decision

**1. The pipeline is borrowed when it is given, owned when it is built, and public in both
cases.** `options.pipeline` renders an existing F42 instance; `destroy()` then unsubscribes
and removes the nodes but leaves the instance running for whoever else holds it. Combining
`pipeline` with `data`, `pageSize` or `locale` is a `TypeError` rather than a silent
precedence rule. `.pipeline` is the instance itself in both cases — the door out of the
facade is the same object the facade uses.

**2. A cell renders primitives and refuses to guess at anything else.** Without a `format`,
`null`/`undefined` render blank, strings/numbers/booleans/bigints render as themselves, a
node renders as itself — and any other value throws a `TypeError` naming the column and
asking for a `format`. A `Date` is the case that matters: `String(date)` is a
human-readable string this library would be choosing on the caller's behalf, which NFR-21
reserves for the caller.

**3. A column's `{ html, sanitize }` governs its cells; the header takes the table's.** A
rich header is a `label` node, which needs no markup decision at all. The pair is
per-column rather than per-table so enriching one column does not open the eleven beside it
(NFR-19).

**4. A row that can be clicked can be operated from the keyboard.** With `onRowClick`, rows
carry `tabindex="0"` and Enter/Space activate them; a key pressed inside a cell's own
control is that control's, and a click on an `a`/`button`/`input`/`select`/`textarea`/
`label` (or anything marked `data-egl-no-row-click`) inside the row does not also fire the
row. Activation is one delegated listener above the `tbody`, matching direct children only.

**5. Budgets, measured.** `{ bsTable }` is **5324 B** against the 6.5 kB row spec 04
pre-declared for it — inside the clause, so nothing is amended. The `/bootstrap` entry
re-baselines from 6195 B to **10525 B**, still inside its unchanged 15 kB clause.

**6. Spec 04's F66 clause is amended in this PR** to state the borrowed-pipeline option,
the `table` property beside `element`, the `sortable` column flag (markup now, behaviour in
15.2), `captionTop`/`stripedColumns`, the per-column markup pair, the non-primitive rule
and the keyboard contract — the house rule that a diverging implementation updates the spec
rather than drifting from it.

## Alternatives Considered

- **Own the pipeline always, no injection** — the literal reading of the original clause.
  Rejected because it forecloses the SSR-adoption story spec 03 §4 uses to justify the pure
  pipeline in the first place, and because "then don't use the facade" is a poor answer to a
  caller who wants Bootstrap markup *and* a shared instance. The ownership rule (borrowed
  instances are not destroyed) costs one branch.
- **Hide the pipeline behind delegating methods** (`table.setFilter(...)`, `table.sort(...)`).
  Rejected: it re-publishes an API that already exists, doubles the SemVer surface, and
  would inevitably lag the pipeline's own. Exposing the instance is both smaller and more
  honest.
- **`String(value)` for any non-primitive cell.** Rejected: it is exactly the defect this
  toolkit replaces, silently. `[object Object]` and a runtime-default date format are
  wrong in a way tests rarely catch and users always see.
- **A `dateFormat`/`locale` option to render dates for the caller.** Rejected as policy the
  library must not own (NFR-21, the F51 `formatStatus` precedent): every project's date
  format is a product decision, and `format` already expresses it in one line.
- **Let a column's `html`/`sanitize` cover its header too** — simpler to describe. Rejected
  after the test caught it: it means enabling rich cells silently reinterprets that
  column's own label, so a configured column name containing `<` becomes markup. A node
  label is the escape hatch, and it needs no flag.
- **A table-wide `html: true` only.** Rejected: one rich column would open every column,
  which is the widest possible door for the narrowest requirement.
- **Keyed row diffing instead of rebuilding the body.** Rejected for 15.1: the spec asks
  for a fragment re-render, the pipeline already pages the row set down to what fits a
  screen, and a diff is a correctness surface (key stability, focus retention) that has to
  earn its place with a measurement rather than a preference.
- **Leave `onRowClick` pointer-only, documenting that a real control belongs in a cell.**
  Rejected: the advice is right, but shipping the inaccessible version *and* the advice
  means the inaccessible version is what gets used.

## Consequences

- An application can adopt `bsTable` for the markup and keep whatever it already does with
  its pipeline, including deriving the first page on the server (proved in the Node
  matrix test, which renders a paged table with no ambient document).
- A column holding dates or objects **must** declare a `format`. This is a deliberate,
  loud, one-line migration cost; the error names the column and says what to add.
- `element` and `table` differ exactly when `responsive` is set. `element` is what was
  appended and what `destroy()` removes; `table` is the `<table>` for callers that need it.
- `data-sort-key` is stamped now and inert until 15.2 wires F51 to it — markup ahead of
  behaviour, so the header is not rebuilt when the bindings arrive.
- The `/bootstrap` entry's full import is now dominated by the pipeline the table pulls in.
  That cost falls only on consumers who import `bsTable`: the per-import rows show every
  builder still measuring in hundreds of bytes.
- `closestWithin` moved from `bootstrap-composites.js` to `bootstrap-elements.js`, where the
  shared builder internals live, so the three delegating builders keep one implementation.

## References

- [spec 04 §2 F66](../specs/04_spec_bootstrap_toolkit.md) — the clause, as amended here
- [`bootstrap-table.js`](../../src/main/javascript/it/d4np/utils/bootstrap-table.js)
- [`bootstrap-table.test.js`](../../src/test/javascript/it/d4np/utils/bootstrap-table.test.js)
- [ADR-0034](0034-one-owner-one-derivation-and-the-pipeline-budget.md) — the pipeline whose
  read model this renders
