---
'egl-utils-js': patch
---

**Fixed: every filter sat under its neighbour when a table had both a selection column and a
filter row** (ROADMAP 19.9,
[BUG-0005](docs/bugs/2026/08/BUG-0005-filter-row-misaligned-under-a-selection-column.md)).

`bsTable({ selection, controls: { filterRow: true } })` rendered the filter row one cell
short: the header row and every body row prepend a cell for the F95 checkbox column and the
F67 filter row did not, so each filter input was drawn one column to the left of the column
it filters, and the last column appeared to have no filter at all.

Silent and visual: the wiring is by column key and stayed correct, so typing in the box under
the checkboxes really did filter the first column — a sighted user and a screen-reader user
were reading different tables.

The filter row now prepends an empty `<td>` carrying the selection column's own class. A
`<td>` rather than a `<th scope="row">`, because the cells beside it are `<td>` for a stated
reason — they hold controls, and a header cell there would attach itself to the data below —
and an empty cell does not change that.

No released version was affected: the selection column arrived in the same unreleased wave.
