# 2026-08-21 — A set of keys, and the page it can see (19.3)

## What got done

- **`table-selection.js`** — `tableSelection` (F94), keyed, observable, Node-safe, re-exported
  from `/table`.
- **`bsTable({selection})`** (F95) — the opt-in column: checkboxes or radios, a tri-state
  header, `data-egl-selected` + `.table-active`, `instance.selection`.
- **62 tests** across a node suite and a jsdom suite, plus **4 Playwright cases** for the three
  things jsdom cannot establish, and a **bench** for NFR-27's two millisecond budgets.
- **ADR-0065**, spec 06 F95 corrected, five size rows moved or added, three F87 routes
  re-pinned, README section, changeset.

## The requirement was mostly about one bug

F94 spends its words on a hazard rather than a data structure: *"select all, then filter, then
act" silently acting on invisible rows is a data-loss bug in every application that has ever
shipped it.* The `Set` of keys was already settled by spec 06 §4. What needed deciding was what
the selection is **allowed to answer**.

The honest answer turned out to be narrower than the requirement's wording and better than
reaching for the wider one. "The count of what is selected outside the current filter" needs the
filtered key set, and no read model in this library exposes it — `TableView` carries the page
and a count, not keys. Two ways out: give the selection a pipeline reference, or reshape the
question. I reshaped it. `stats(rows)` reports `offPage` — selected and **not among the rows you
passed** — which under an active filter includes the rows the filter hides. It is a superset of
what F94 asked for, it is the number a confirmation dialog actually needs, and it costs no
coupling: the selection imports no pipeline and knows nothing about filters, so the same
instance serves `tablePipeline`, `remotePipeline`, or neither.

The other two decisions the requirement asked to be made rather than discovered:

- **`rowKey` is required.** Index and identity are exactly what F94 forbids, so there is nothing
  to fall back to, and a default would produce a selection that breaks on the first sort in
  silence.
- **Rows leaving the source are KEPT.** A selection is intent: they ticked forty rows. Pruning
  would make "select forty, narrow the filter, act" act on eleven — the same bug the requirement
  opens by naming. `prune()` exists and has to be asked for.

## Two defects the tests found on the way

**The radio group name was not unique across tables.** I minted it with `uniqueId(doc, 'egl-sel')`
and never wrote it into the document — and `uniqueId` proves a string is free by asking the
document for that *id*, so the second table got the same string. Two single-select tables on one
page would have formed **one radio group**, and selecting in the second would have silently
cleared the first. Found by a test written for the boring reason ("two tables should have
different names"), which is the kind of test that pays for itself. Fixed by stamping the minted
string on the header cell as its `id`, which is what makes ADR-0042's registry real.

**A dead NaN branch**, deleted rather than mock-covered (the M2.4 precedent): a malformed
`data-egl-index` makes the parsed index `NaN`, and `rendered[NaN]` is `undefined`, so the line
that rejects a foreign row already rejects an unreadable one. The ternary guarding it could
never run. Coverage found it; the fix was removing code.

## A spec sentence I had to correct — my own wave's, again

F95 says selection is *"off by default: a table nobody selects in pays nothing (the NFR-02
rule)"*. That is true of the runtime and false of the bundle. NFR-02 is about one **export**
pulling zero unrelated modules, and `bsTable` is one export: an option cannot be tree-shaken out
of a function. So the column's code and the model it composes land on `{bsTable}` whether the
option is used or not — **+2222 B**, 1433 B of it `tableSelection` itself.

I considered the design that would have made the sentence true: refuse to construct the model,
require the caller to pass one, and keep `tableSelection` out of `bsTable`'s import graph. It
saves every non-selecting `bsTable` consumer 1433 B and costs `selection: true`. Rejected,
because it contradicts the facade contract ADR-0040 already settled — `bsTable` imports
`tablePipeline` and `bindTableControls` the same way, and a caller passing their own pipeline
already pays for the one they did not use. Recorded as the rejected alternative, so the day the
`bsTable` row becomes the binding constraint, the option is on the shelf rather than needing to
be rediscovered.

## Measured

- Surface **118 → 119**, one addition, run as a diff of live bindings (NFR-25).
- NFR-27, both clauses, on the benchmark machine: `selectAll` over 10,000 rows **3.77 ms** mean
  against a 10 ms budget — and that figure includes the `clear()` the bench does every iteration
  — and `getSelection()` with 10,000 keys held **0.040 ms**, 250× inside the same budget. Both
  recorded against the collapse floor. The memory clause is asserted structurally rather than
  timed: one key held over a 10,000-row source, then the rows dropped without the selection
  noticing.
- `{bsTable}` 8842 → **11064 B**; `/bootstrap` full import 19163 → **22032 B**, still 3 kB
  inside ADR-0041's 25 kB entry clause; `{tableSelection}` **1433 B**, which is what a `/table`
  consumer pays for selection without any of Bootstrap.
- **The artifact is on a trajectory worth naming**: 31444 B at M18, 33982 B after 19.2, **35671 B
  now**, against NFR-22's 40 kB authoring ceiling. Three more items at this rate cross it. Better
  to write that down now than to meet it as a red build in 19.6.

## What could not be verified here

Firefox will not launch on this machine — `browserType.launch: spawn UNKNOWN`, for every
Playwright test including ones this item never touches. Chromium and WebKit pass all four new F95
cases (the tri-state header, keyboard-only operation, accessible names asked of the engine's own
accessibility tree, and the styleable row). CI runs all three engines, so Firefox is verified
there rather than not at all — stated rather than quietly skipped.

## Where the project stands

v1.1.0 released; **M19: 19.1, 19.2, 19.3 and 19.8 done, 19.4–19.7 open**. `.changeset/` holds
three minor entries, so the next release is v1.2.0. ADRs through 0065, next free 0066. Bug
ledger through BUG-0004. 2662 tests, every gate green locally except the Firefox project noted
above.

## How the next session resumes

1. Wait for this PR to merge (one item per PR).
2. **19.4, export** (spec 06 F96–F97) is next, and it is the wave's security item: a CSV opened
   in a spreadsheet is a code-execution surface, so **formula injection is neutralized by
   default**, documented and defeatable. It also brings the async Clipboard API, which means an
   api-floor amendment — now under a gate that can actually see it (19.8).
3. Watch the artifact ceiling. If 19.4 pushes it past ~37 kB, the NFR-22 decision is that item's
   to take, with a measured argument either way.
