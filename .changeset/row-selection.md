---
'egl-utils-js': minor
---

**Row selection** (ROADMAP 19.3, spec 06 F94–F95,
[ADR-0065](docs/adr/0065-a-set-of-keys-and-the-page-it-can-see.md)).

- **`tableSelection({rowKey, mode, initial})`** on `egl-utils-js/table` — a selection held as a
  **set of row keys**, never as a flag on a row, an index, or an object reference: keys survive
  a re-sort, a re-page and a server round-trip, which is also what makes the memory cost
  O(selected) rather than O(source). `rowKey` is required, because keying by index or identity
  is the thing that breaks silently. Pure and Node-safe: it imports no pipeline and knows
  nothing about filters, so the same selection serves `tablePipeline`, `remotePipeline`, or
  neither.
- **`bsTable({ selection: true })`** — an opt-in leading column: checkboxes (or radios in
  `'single'` mode), a select-all header with a real **indeterminate** state, keyboard
  operability from the native control, an accessible name per row that is the row's key rather
  than "checkbox", and `data-egl-selected` plus `.table-active` on each selected row so CSS can
  style it **without the caller re-rendering**. `instance.selection` exposes the model.

**Select-all means the current page, and only the current page.** Never "everything matching
the filter" and never "everything in the source" — both are guesses about intent that have
shipped as data-loss bugs. `selection.stats(rows)` reports `offPage`: how many selected rows
are *not* among the rows passed, which under an active filter includes rows the filter excludes.
That is the number an "apply to selection" confirmation owes the user, and it is readable at any
moment rather than something the caller has to track.

**Rows that leave the source are kept, not pruned.** A selection is the user's intent; filtering
or reloading changes what is on screen and must not change what they asked to act on. `prune()`
is the named opt-out for the caller who genuinely wants the other policy.

Also: `'single'` mode **refuses** `selectAll()` rather than picking a row for you, a re-select of
an already-selected row emits nothing, and the `'change'` event carries `{keys, added, removed}`
so a renderer can update what changed instead of everything.
