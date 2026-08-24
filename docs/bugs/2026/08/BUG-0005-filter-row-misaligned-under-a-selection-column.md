---
id: BUG-0005
title: Every filter sits under its neighbour when a table has both a selection column and a filter row
status: open
severity: medium
reporter: internal
discovered: 2026-08-24
affected-versions: v1.1.0
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

It affects any table combining two opt-in features that have never been used together in a
test: `selection` (F95, roadmap 19.3) and `controls.filterRow` (F67, roadmap 15.2). Neither
feature is wrong on its own, which is why it survived both items and the 19.4–19.7 wave.

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

## Note for the fix

The permutation ADR-0069 introduced computes its leading offset per row
(`kids.length - from.length`) rather than taking a fixed one, so column reorder is correct
both before and after this is fixed. The fix should therefore not need to touch the reorder
path — and a regression test that reorders a table with `selection` *and* `filterRow` is the
cheap way to prove that.

Two candidate shapes, and the choice is not obvious:

1. **A leading `<td>` in the filter row**, empty, matching the header and body. Simplest,
   and it aligns everything.
2. **A leading `<th scope="row">`** carrying the same accessible name the selection header
   uses. More correct for assistive technology, and a bigger change to the F67 markup
   contract.

The item should decide with the same care 19.3 gave the selection column's own accessible
name, and should check whether any other opt-in pair mirrors the columns without the
prologue.
