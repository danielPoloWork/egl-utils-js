# ADR-0034: One owner, one derivation — and what the pipeline costs

- **Status:** Accepted
- **Date:** 2026-08-07
- **Deciders:** Daniel Polo
- **Related:** [spec 03 §2 F42, §3 NFR-12/NFR-13](../specs/03_spec_dom_ui_table.md),
  ROADMAP 13.1, [ADR-0006](0006-typed-event-emitter-contract.md) (emitter contract),
  [ADR-0021](0021-filter-expression-grammar.md) (filter grammar),
  [ADR-0022](0022-comparator-total-order-semantics.md) (comparison semantics),
  [ADR-0015](0015-final-size-budgets-and-the-httpclient-exception.md) (named-exception
  budget rows), [ADR-0031](0031-component-instances-and-the-alert-budget.md) (the same
  measure-then-amend move in 12.1)

## Context

A table needs four operations — filter, search, sort, paginate — and the obvious way to
build them is four components. That is the arrangement this library's own primitives
(F33–F35) invite, and it is the arrangement that fails: each component ends up owning a
copy of the rows and rebuilding it from the original, so applying one **discards** the
other. The bug is invisible in isolation and appears the first time a user filters *and*
sorts. It is the single defect the tabular wave exists to prevent, and no amount of
per-component correctness prevents it — it is a question of who owns the state.

Three further decisions had to be made once ownership was settled: how state changes are
announced, what a "command" costs when it changes two things at once, and how the derived
rows are computed cheaply enough to honour NFR-13 (10,000 rows, 3 filters, a 2-key sort,
≤ 50 ms).

## Decision

**One owner, one derivation, one event.** `tablePipeline` owns the row set. Every read
goes through `view()`, which derives in a fixed order —
`source → filters (AND) → search (OR) → sort → paginate` — and is memoized on an internal
version counter, so repeated reads between commands return the *identical* object.
Filtering and sorting cannot discard each other because neither owns anything to discard.

**Commands are transactions.** Each command validates, mutates, and emits exactly one
`'change'` carrying the derived view — including when it changes two things at once
(setting a filter also returns to page 1, since the page the user was on describes a list
that no longer exists). `batch(fn)` makes several commands one transaction. A batch whose
`fn` throws still announces: the commands that ran before the throw did change the state,
and a subscriber left rendering the old one is worse than one that sees a partial update.

**Observation is delegated, not inherited.** The pipeline holds an `EventEmitter` (F6) and
re-exposes `on`/`once`/`off`; `emit` stays inside the closure. Extending the emitter would
have published `emit` and let any holder announce a state change the pipeline never made.

**Sorting decorates.** Each sort key's values are read once per row, the *positions* are
sorted, and the rows are re-materialised from that order. This is what makes the budget:
it also fixes a trap in the naive form, where a column with a `getValue` callback runs the
caller's function once per *comparison* — about 86,000 calls on a 10,000-row sort instead
of 10,000.

**The `/table` budget is amended to 3.5 kB, and `tablePipeline`'s row pinned at 3.4 kB.**
Measured: entry 3273 B, `{ tablePipeline }` alone 3250 B, primitives alone 1714 B.

## Alternatives Considered

- **Four independent components sharing a convention** — the arrangement the wave was
  written to replace. Rejected: composition-by-convention is composition by luck; the
  failure is silent and only reproduces under two user actions at once.
- **A base class with overridable stages (Template Method)** — rejected in the wave's
  planning and again here: inheritance freezes the stage skeleton, publishes protected
  surface to SemVer, and fights tree-shaking. Stage variation is served by Strategy slots
  (per-column `compare`, `getValue`) instead.
- **`class TablePipeline extends EventEmitter`** — rejected: it makes `emit` public. A
  subscriber able to fake a `'change'` turns the read model into a rumour.
- **Granular `filtered` / `sorted` / `paged` events** — rejected: subscribers would
  reconstruct state from event order and drift from it. One event carrying the whole
  derived view cannot drift.
- **Emitting only when the derived rows actually changed** — rejected: it requires
  comparing derivations to decide whether to announce one, and a filter box that types
  `a`, `ab`, `a` would emit unpredictably. "One command, one event" is a rule a caller can
  hold in their head.
- **A render callback option instead of events** — rejected: a second way to do the same
  thing, with one subscriber where a table needs three (rows, pagination status, URL sync).
- **Trimming below 3 kB to protect the indicative budget** — attempted and stopped. Real
  fat came out (decorate-sort, one shared array assertion, bound emitter methods, ~80 B);
  what remained was diagnostic error messages and contract behaviour. Per ADR-0031's
  lesson, an estimate written before the contract existed is not worth degrading the
  contract for. The measured figure and its justification go in the row name instead.
- **Splitting the pipeline onto its own entry to keep `/table` under 3 kB** — rejected: it
  would import the primitives anyway, so nothing shrinks; only the number of entries, and
  the number of imports a consumer must remember, would grow.

## Consequences

- Filtering and sorting compose in either application order — proved by property test, not
  by inspection.
- `view()` is referentially stable between commands, so a subscriber can use identity as a
  render guard.
- NFR-13 is met with real headroom: **21.1 ms mean** for the full 10k-row derivation
  against a 50 ms budget (p99 30.3 ms), down from 45.8 ms before the decorate-sort change.
  The isolated 2-key sort fell from 116.6 ms to 38.1 ms.
- `{ tablePipeline }` costs essentially the whole entry (3250 B vs 3273 B). That is the
  honest shape of a composing facade and the reason spec 03 exempts it from the 1 kB
  per-function clause: the clause would measure the composition, not the component.
- A consumer who only wants the primitives still pays 1714 B — the tree-shaking scenario
  row is permanent, so a future pipeline change cannot silently tax them.
- The `'change'` payload is the same object `view()` returns, so a subscriber that stores
  it and a caller that asks for it can compare with `===`.

## References

- [`src/main/javascript/it/d4np/utils/table.js`](../../src/main/javascript/it/d4np/utils/table.js) — the pipeline and the primitives it composes
- [`src/test/javascript/it/d4np/utils/table-pipeline.property.test.js`](../../src/test/javascript/it/d4np/utils/table-pipeline.property.test.js) — the composition, transaction, and memo invariants
- [`src/bench/javascript/it/d4np/utils/table.bench.js`](../../src/bench/javascript/it/d4np/utils/table.bench.js) — the NFR-13 measurement
- [`docs/benchmarks/2026-08-07-table-pipeline-derivation.md`](../benchmarks/2026-08-07-table-pipeline-derivation.md) — the recorded run
