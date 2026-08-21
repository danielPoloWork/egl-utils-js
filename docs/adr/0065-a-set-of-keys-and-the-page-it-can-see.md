# ADR-0065: A set of keys, and the page it can see

- **Status:** Accepted
- **Date:** 2026-08-21
- **Deciders:** Daniel Polo
- **Related:** [spec 06](../specs/06_spec_table_data.md) §2 F94–F95, §3
  NFR-25/NFR-27/NFR-29/NFR-30 (F95 amended here), ROADMAP 19.3;
  [ADR-0062](0062-a-sibling-not-a-wrapper.md) (a sibling rather than a change to the
  pipeline — the same reasoning, applied again),
  [ADR-0034](0034-one-owner-one-derivation-and-the-pipeline-budget.md) (the F42 pipeline whose
  rows this keys, and which is untouched),
  [ADR-0040](0040-one-grammar-one-pager-and-a-ceiling-below-its-own-parts.md) (the `bsTable`
  facade contract and its budget row, amended here),
  [ADR-0042](0042-ids-are-the-accessibility-and-a-ceiling-derived-not-guessed.md) (the id
  registry that turned out to matter for radio groups),
  [ADR-0047](0047-unknown-option-keys-are-rejected.md) and
  [ADR-0056](0056-descriptors-are-checked-too.md) (the descriptor bags checked here),
  [ADR-0006](0006-typed-event-emitter-contract.md) (the F6 observer shape)

## Context

F94 asks for a selection, and it spends most of its words on one hazard rather than on the
data structure: **"select all, then filter, then act" silently acting on invisible rows is a
data-loss bug in every application that has ever shipped it.** The requirement then names
three more decisions it wants made rather than discovered — what a selection is keyed by,
what select-all means when a filter is active, and whether rows leaving the source are kept
or pruned.

The data structure itself is not in doubt. Spec 06 §4 already settled it: a `Set` of row keys,
because rows arrive from a server, get replaced wholesale, and are never mutated by this
library. A flag on each row dies at the next reload; an index dies at the next sort; an object
reference dies in JSON. That is also what makes NFR-27's memory clause true — O(selected), not
O(source).

What needed deciding is the *shape of the seam*: what the selection knows, what it is told,
and what it is allowed to answer. Three forces:

**A selection that knows the pipeline can answer more, and couples more.** "How many selected
rows are outside the current filter" is answerable only by something holding the filtered set,
which no read model in this library exposes — `TableView` carries the page and a count, not
the keys. So either the selection reaches into a pipeline, or the question gets reshaped.

**`bsTable` has to render it, and `bsTable` is a facade with a budget.** ADR-0040 pinned its
size row on the argument that a facade costs about what its parts cost. An opt-in feature is
not tree-shakeable — an option cannot be shaken out of a function — so whatever the column
costs lands on every `bsTable` consumer, including the ones who never select anything. F95's
own words are *"off by default: a table nobody selects in pays nothing"*, and in bytes that is
not quite true.

**A checkbox is where accessibility claims get tested.** F95 asks for the indeterminate state,
keyboard operability, and a name that is not "checkbox" — three things jsdom cannot establish,
and one of which (`indeterminate`) has no HTML attribute at all.

## Decision

**1. `tableSelection({rowKey, mode, initial})` on `egl-utils-js/table`, holding a `Set` of
string keys and nothing else.** It imports no pipeline, subscribes to nothing, and knows
nothing about filters. `tablePipeline` is untouched — the third time NFR-25 has ruled out the
design that would otherwise have been chosen (ADR-0062 was the first).

**2. `rowKey` is required, with no default.** Identity and index are precisely what F94
forbids, so there is nothing to fall back to; guessing would produce a selection that breaks
on the first sort, silently. Keys normalize through `String()`, which makes `1` and `'1'` one
row — deliberately the same normalization `bsTable` already applies when it stamps `data-key`,
because a selection disagreeing with the DOM about what a key is would be worse than one that
conflates two types nobody mixes.

**3. Every operation that needs rows is *given* rows.** `selectAll(rows)` selects exactly
those; `stats(rows)` describes exactly those. That is the whole answer to the coupling
question, and it makes the same selection work for `tablePipeline`, `remotePipeline`, or no
pipeline at all.

**4. Select-all means *this page*, and the invisible remainder is a number the caller can
always read.** `stats(rows)` returns `onPage`, `offPage` and `total`, where **`offPage` is
selected-and-not-among-the-rows-passed** — under an active filter that includes rows the filter
excludes. The requirement asked for "the count of what is selected outside the current filter"
to remain reportable; what a selection can honestly know is the count outside *what it was
shown*, which is a superset and is the number a confirmation dialog actually needs. Naming it
`offPage` and documenting exactly what it counts is the specification F94 asked for. Inventing
a filtered-key oracle by reaching into the pipeline would have bought a smaller number at the
cost of the seam.

**5. Rows that leave the source are KEPT.** A selection is the user's intent: they ticked
forty rows. Filtering, paging or reloading changes what is on screen and must not change what
they asked to act on — pruning would make "select forty, narrow the filter, act" act on eleven,
silently, which is the same class of bug F94 opens by naming. `prune(rows)` exists for the
caller who genuinely wants the other policy after a server-side delete, and it has to be asked
for by name.

**6. `'single'` mode refuses bulk operations rather than reinterpreting them.**
`selectAll()` on a single-mode selection is a `TypeError` naming the mode; so is an `initial`
carrying two distinct keys. Picking one of the caller's rows for them is a coin flip over their
data, and a no-op would be the silence this library has refused since ADR-0047.

**7. A no-op emits nothing.** Re-selecting a selected row does not fire `'change'`, because a
checkbox handler that re-selects would otherwise redraw a table on every click of an
already-ticked box. The event carries `{keys, added, removed}` — the delta as well as the
state, which is what lets `bsTable` reflect in O(changed) instead of re-rendering.

**8. `bsTable({selection})` renders it, opt-in, and imports the model statically.** The same
treatment `tablePipeline` and `bindTableControls` already get (ADR-0040): a facade imports what
it composes. The cost is stated rather than hidden — see the consequences — and **spec 06 F95
is amended** so its "pays nothing" clause reads as the runtime claim it is.

**9. The accessible name defaults to the row's key.** F95 forbids a name that is merely
"checkbox"; a record id is language-neutral and identifies the row, which is the best default a
library can ship without putting English in every consumer's UI. `labels.select(row, key)`
takes a phrase, and the header's `'Select all'` follows the `bsCloseButton({label: 'Close'})`
precedent — English where a digit cannot serve, and injectable.

**10. A borrowed selection outlives the table.** Pass one in and `destroy()` unsubscribes and
leaves it alive, keys and other subscribers intact; one the table created dies with it. Exactly
the rule an injected `pipeline` already gets, for the same reason: the caller may be rendering
it somewhere else too.

## Alternatives Considered

- **A `selection` option on `tablePipeline`.** Rejected on NFR-25, and on the same reasoning as
  ADR-0062: the pipeline's job is deriving a view from rows, a selection is orthogonal to
  derivation, and a `remotePipeline` user would have got nothing.
- **Giving the selection the pipeline, so it can answer "outside the filter" exactly.**
  Rejected: it buys one more precise number and costs the seam that makes the model reusable,
  testable in Node, and free of an opinion about where rows come from. The number it would have
  bought is available to the caller anyway — they hold the filtered rows if they want to pass
  them.
- **Pruning on source change.** Rejected as the default, kept as `prune()`. Pruning is
  defensible only when the caller *knows* the rows are gone for good; a filter narrowing is not
  that, and a library cannot tell the two apart.
- **Storing selected rows rather than keys.** Rejected: it is the flag-on-a-row design in a
  different coat, breaks on every reload, and turns NFR-27's memory clause from O(selected) into
  O(selected rows retained), pinning objects a server has already replaced.
- **`aria-selected` on the row.** Rejected: valid only inside a grid role, which a plain
  `<table>` is not. `data-egl-selected` plus Bootstrap's own `.table-active` gives CSS a hook,
  and the checkbox's own state is the real accessibility signal.
- **Requiring the caller to construct the selection (`selection: {selection}` only).** It
  would keep `tableSelection` out of `bsTable`'s import graph and save every non-selecting
  `bsTable` consumer 1433 B. Rejected because `selection: true` is the ergonomics most callers
  want and because it contradicts the facade contract ADR-0040 already settled — but it is the
  right thing to revisit if the `bsTable` row ever becomes the binding constraint.

## Consequences

- **Surface 118 → 119**, one addition, proved as a diff of live bindings (NFR-25).
- **NFR-27 met with room, and measured rather than asserted**: `selectAll` over 10,000 rows
  runs in **3.77 ms** mean against a 10 ms budget (and that figure includes the `clear()` the
  bench does each iteration), and `getSelection()` with 10,000 keys held in **0.040 ms**, 250×
  inside the same budget. Both recorded in `docs/benchmarks/baseline.json` against the collapse
  floor. The memory clause is asserted structurally instead of timed — one key held over a
  10,000-row source, then the rows dropped without the selection noticing — because timing an
  allocation measures the collector.
- **`{bsTable}` grew 8842 → 11064 B (+2222)**, of which 1433 B is `tableSelection` itself. That
  is the price of an opt-in option in a language where options are not tree-shakeable, and
  **spec 06 F95's "pays nothing" is amended to say so**: nothing at runtime, nothing in the
  DOM, 2222 B in the bundle. `/bootstrap`'s full import is 22032 B against ADR-0041's 25 kB
  entry clause, which still holds with 3 kB to spare.
- **The artifact is on a trajectory worth naming**: 31444 B at M18, 33982 B after 19.2, **35671
  B now**, against NFR-22's 40 kB authoring ceiling. Three more items at this rate cross it.
  That is a decision to take deliberately in the item that gets there — either amending NFR-22
  with a measured argument or splitting the artifact — and not a thing to discover as a red
  build.
- **Two defects found by the tests that were written for something else.** A radio group name
  minted with `uniqueId` was **not unique across tables**, because `uniqueId` proves a string is
  free by asking the document for that *id*, and a `name` never written into the document is
  handed out again — two single-select tables on one page would have formed one radio group, so
  selecting in the second silently cleared the first. Fixed by stamping the minted string on the
  header cell as its `id`, which is what makes the registry real (ADR-0042). And coverage found
  a dead NaN branch in the reflection helper, deleted rather than mock-covered (the M2.4
  precedent).
- **Firefox could not be verified locally** — `browserType.launch: spawn UNKNOWN` on this
  machine for every Playwright test, pre-existing and unrelated. Chromium and WebKit pass the
  four new F95 cases; CI runs all three.

## References

- Spec 06 §2 F94–F95, §3 NFR-27 (the budgets), NFR-29 (the Node-safety split this respects).
- ADR-0062 — the first time NFR-25 ruled out changing the pipeline; this is the same call.
- ADR-0040 — the `bsTable` facade budget this amends, and the import rule it set.
