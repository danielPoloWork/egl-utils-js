---
id: BUG-0005
title: Every filter sits under its neighbour when a table has both a selection column and a filter row
status: fixed
severity: medium
reporter: internal
discovered: 2026-08-24
affected-versions: none released — the defect is in unreleased M19 code (roadmap 19.3 onwards)
fixed-in: v1.2.0
---

# BUG-0005: Every filter sits under its neighbour when a table has both a selection column and a filter row

## Summary

`bsTable({ selection, controls: { filterRow: true } })` renders a filter row **one cell
short**. The header row and every body row carry the F95 selection cell first; the F67 filter
row does not, so its first input lands under the checkbox column and every filter after it
sits one column to the left of the column it filters.

Reproduced against `main` at v1.1.0:

```js
const table = bsTable(host, {
  columns: [{ key: 'a' }, { key: 'b' }],
  data: [{ a: 1, b: 2 }],
  rowKey: 'a',
  selection: true,
  controls: { filterRow: true },
});
// thead row 1 (headers):   3 cells  — [select] [a] [b]
// thead row 2 (filters):   2 cells  — [filter a] [filter b]
// tbody row:               3 cells  — [checkbox] [1] [2]
```

The input labelled `Filter a` is drawn under the selection column, and `Filter b` under
column `a`. Column `b` has no visible filter at all — the row simply runs out.

## Impact

**Silent and visual.** Nothing throws, and the filters still *work*: each input is wired to
the column its `aria-label` names, so typing in the box under the checkboxes really does
filter column `a`. The defect is that a user cannot tell which box filters what, and the
last column appears to have no filter. For a screen-reader user the labels are correct, so
the two experiences disagree.

It affects any table combining two opt-in features that had never been used together in a
test: `selection` (F95, roadmap 19.3) and `controls.filterRow` (F67, roadmap 15.2). Neither
feature is wrong on its own, which is why it survived both items and the 19.4–19.7 wave.

**No released version is affected.** The report as first filed said `v1.1.0`; that was wrong,
and the correction matters for anyone reading the ledger later. The selection column arrived
in 19.3, and the whole of M19 is still in `[Unreleased]` — v1.1.0 shipped on 2026-08-21,
before it. The defect existed for four days, inside one unreleased wave, and is fixed by
19.9 before that wave is cut.

## Root cause

`buildControls` builds the filter row with one `<td>` per entry in `columns`:

```js
for (const column of columns) {
  const cell = doc.createElement('td');
  …
  row.append(cell);
}
```

The header build and `buildRow` both prepend a selection cell before their column loop when
`options.selection` is set; the filter row's loop has no such prologue. It was written in
15.2, when a selection column did not exist yet, and 19.3 added the column to the two places
it could see.

## How it was found

While deciding how ADR-0069's permutation should compute each row's leading offset. The
reorder code has to know how many cells precede the data columns in a given row, and
inspecting the four kinds of row that mirror the columns showed the filter row disagreeing
with the other three about a table that had a selection column.

Recorded rather than fixed: it predates 19.7, it is visible without reorder, and AGENTS.md
§10 makes an out-of-scope finding a roadmap item in the same PR — **19.9**.

## Fix (roadmap 19.9)

`buildControls` prepends an empty `<td>` to the filter row when the table has a selection
column, carrying that column's own `class` so it lines up even when F99's `<colgroup>` is not
in play.

**A `<td>`, not the `<th scope="row">` the report offered as the alternative.** The cells
beside it are `<td>` for a reason the code already states — they hold controls, and a header
cell there would attach itself to the data below as a header assistive technology announces —
and that reason does not stop applying because a cell is empty. A row header would also claim
the filter row is *about* the selection column, which it is not: the row is a set of controls,
not a record.

**The reorder path needed no change**, as predicted: ADR-0069's permutation computes each
row's leading offset from its own cell count (`kids.length - from.length`) rather than taking
a fixed one, so it was correct while the filter row was a cell short and stays correct now
that it is not. A regression test pins exactly that — reorder a table with `selection` *and*
`filterRow`, and assert each filter is still under its column. Replace the computed offset
with a constant and it fails.

**No other row mirrors the columns without the prologue.** All six per-column loops in
`bootstrap-table.js` were checked: the header row, the body rows and the F99 `<colgroup>` and
grip loops all account for the selection column; the empty-state row spans it through its
`colspan`; the filter row was the only one that did not.
