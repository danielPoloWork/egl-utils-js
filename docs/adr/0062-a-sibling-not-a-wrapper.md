# ADR-0062: A sibling, not a wrapper — where remote rows enter the table

- **Status:** Accepted
- **Date:** 2026-08-21
- **Deciders:** Daniel Polo (owner), agent (senior project architect persona)
- **Related:** [spec 06](../specs/06_spec_table_data.md) §2 F88–F91, §3 NFR-25/NFR-26/NFR-29,
  §4 (which deferred this decision) and §3 NFR-30 (corrected here), ROADMAP 19.1,
  [spec 03](../specs/03_spec_dom_ui_table.md) F42 (the local pipeline this stands beside),
  [ADR-0025](0025-resource-repository-over-an-injected-client.md) (injection over import),
  [ADR-0039](0039-a-facade-with-a-door-and-what-the-table-costs.md) (the facade-with-a-door
  precedent, and why it does not apply here),
  [ADR-0047](0047-an-unknown-option-key-is-a-typeerror.md) (the option-key contract the new
  bags inherit), [ADR-0015](0015-final-size-budgets-and-the-httpclient-exception.md)

## Context

Spec 06 §4 named this decision and refused to make it: *"an adapter that owns a pipeline, or
a new option on `tablePipeline` that swaps the derivation for a server round-trip"* — both
defensible, differing in what "the pipeline's state" means once the server did the
filtering. F88–F91 fixed the observable contract and left the mechanism here, the way spec 05
F82 left the sanitizer's peer mechanism to ADR-0055.

Three forces, and the third is the one that settles it.

**The 1.0 promise (NFR-25).** `tablePipeline` is frozen: spec 03 F42 states its options, its
commands, its read model, and — explicitly — that *"derivation order is fixed: source →
per-column filters (AND) → global search (OR over searchable columns) → sort (stable,
multi-key) → paginate"*. In remote mode none of that sentence is true. Making it conditionally
untrue is not an addition; it is a change to what an existing export means, which is what a
major is for.

**Reuse is genuinely attractive.** `tablePipeline` already validates keys, rejects unknown
options, coalesces `batch` into one `'change'`, and exposes the F6 observer surface. A remote
sibling reimplements a slice of that. Nobody enjoys writing the second one.

**And reuse has one failure mode that is unacceptable.** If the server returns page 3 —
twenty rows, already filtered and sorted — and those rows are handed to a pipeline that
filters, sorts and paginates, the pipeline derives *again* over the twenty. The user sees
page 1 of a re-filtered subset of an already-filtered page. Nothing throws. The rows look
plausible. That is not a bug you find in review; it is a bug you find when someone notices a
total that never matches the list, months later.

## Decision

**1. `remotePipeline` is a sibling of `tablePipeline`, not a wrapper around it.** It owns its
own query state (filters, search, sort, page, page size) and its own read model. It does not
construct, hold, or delegate to a `tablePipeline`. `tablePipeline` is untouched — same file,
same tests, same measured size, same spec clause.

The duplication is real and bounded: key validation, the sort cycle, the batch depth counter.
It is accepted because the alternative's failure is silent wrong data, and **a design whose
misuse is invisible is worse than a design with eighty duplicated lines**.

**2. They share the command vocabulary, deliberately.** `setFilter`, `setSearch`,
`toggleSort`, `setSort`, `setPage`, `setPageSize`, `batch`, `on`/`once`/`off`, `view()` —
same names, same argument shapes, same page-reset rule. Moving a table from local rows to a
server changes where the data comes from and nothing the calling code has to relearn. That is
the payoff reuse would have bought, taken without the hazard.

**3. `refresh()` and `destroy()` are the two additions.** `refresh()` because F89 coalesces
identical queries, so there must be a deliberate way to ask the same question again — it is
also the retry after a failure. `destroy()` because this is the first `/table` export that
owns something needing teardown (an in-flight request), and NFR-15 requires it.

**4. A predicate is not a filter here, and the refusal is loud.** `tablePipeline` accepts
`setFilter(key, fn)`, which is right for local rows and impossible for remote: a function
cannot be serialized. `remotePipeline.setFilter` rejects one with a `TypeError` naming why,
and `tableQuery` rejects one too, so neither path can produce a query that silently asks the
server a *different* question than the caller set.

**5. The race rule compares identity at apply time, not just at abort time.** Every state
change computes the query; an identical query does not re-issue; a superseded load is
**aborted**; and only the load whose token is still current may apply its result. That last
clause is the one that matters: `AbortSignal` stops a `fetch`, but it cannot un-resolve a
promise that already settled in a microtask, so "we aborted it" and "it cannot arrive" are
different statements and only the second is safe to rely on.

**6. The transport is injected, never imported** (ADR-0025). `load` is any function. `/table`
gains no `fetch`, no `httpClient`, no `createResource`, and stays Node-safe and DOM-free
(NFR-29).

**7. Spec 06 NFR-30 is corrected in this PR** — see its amendment. The clause said entry
ceilings would be re-derived once at wave end; the size gate runs on every PR, so the rows
must move per PR. The prose clause in spec 03 NFR-12 is what gets its final number once.

## Alternatives Considered

- **An option on `tablePipeline`** (`{remote: {load}}` or a `source` that accepts an object).
  Rejected on the double-derivation failure above, and on NFR-25: F42's fixed derivation
  order is a documented, frozen property, and a mode where it does not hold changes what the
  export means. A `source` that accepts either an array or an object would additionally
  redefine an existing option — a major by any reading.
- **A binder over a caller-supplied pipeline** — `remoteSource(pipeline, {load})`, watching
  `'change'`, serializing the state, and calling `setSource(rows)` with the server's page.
  The most attractive on first look, and the most dangerous: `setSource` is exactly the door
  through which server-filtered rows meet a pipeline that filters again. It would have reused
  the most code and shipped the exact bug this ADR exists to prevent.
- **A pipeline used only as a state container**, with rows never set and derivation running
  over an empty array. Avoids the double-derivation, and pays for it in incoherence: the
  inner `view()` would report `total: 0` and `pageCount: 1` while the outer one reported the
  server's numbers, so two read models with the same name would disagree — and `pageSize` is
  not even present in F42's `TableView`, so the wrapper could not read back the state it had
  just set. A container you have to remember not to believe is not a container.
- **Exposing the internals as a "door"** (ADR-0039's precedent, where `bsTable` keeps its
  `tablePipeline` public). Deliberately **not** applied: there is no inner object worth
  exposing, and the door pattern earns its keep when the facade wraps something the caller
  might legitimately drive directly. Here that thing does not exist, and inventing it to
  match a precedent would be cargo-culting our own catalogue.
- **`AbortSignal` alone as the race mechanism**, trusting that an aborted request cannot
  deliver. Rejected on the microtask argument in Decision 5 — and a property test over
  randomized interleavings fails after one case when the identity check is removed, which is
  how that claim is kept honest rather than argued.

## Consequences

- **Two pipelines on `/table`, sharing a vocabulary.** A consumer learns one and can read the
  other. The cost is that "which one am I holding" is now a real question; the JSDoc on each
  answers it in its first paragraph.
- **`/table`'s full-import row grows 3 291 B → 4 666 B** (+42%), re-pinned to 4.95 kB. A
  consumer who does not import `remotePipeline` pays none of it: the `{tablePipeline}` row is
  **unchanged at 3 389 B**, which is the NFR-02 claim measured rather than asserted. The
  query-primitives row did move — 1 714 B → 1 786 B, 72 B of re-export wiring — and that is
  recorded in the row's own name rather than rounded away.
- **A `TypeError`, not a new `EGL_*` code**, for a malformed source result — and a transport
  failure is surfaced **as the caller's own error object**, not wrapped. Wrapping an
  `HttpError` in a class of ours would hide the status code the caller needs to decide
  whether to retry. The `EGL_*` registry is unchanged by this item.
- **Failures leave the previous rows in place** (F91). An error banner over stale data is
  recoverable; an empty table that does not say why is not.
- **Nothing here touches the DOM**, so 19.2's history binding and 19.3's selection wiring
  attach to this the same way they would to `tablePipeline`.
- **Not covered:** what the server's parameter names are. The query is transport-neutral, and
  translating it is the caller's `load`, which is the only place that knows.

## References

- [spec 06](../specs/06_spec_table_data.md) F88–F91, NFR-25/NFR-26/NFR-29/NFR-30 (corrected);
  ROADMAP 19.1.
- [spec 03](../specs/03_spec_dom_ui_table.md) F42 (the frozen local contract),
  [ADR-0025](0025-resource-repository-over-an-injected-client.md),
  [ADR-0039](0039-a-facade-with-a-door-and-what-the-table-costs.md),
  [ADR-0047](0047-an-unknown-option-key-is-a-typeerror.md).
