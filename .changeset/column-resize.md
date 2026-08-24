---
'egl-utils-js': minor
---

**Column resize** (ROADMAP 19.6, spec 06 F99,
[ADR-0068](docs/adr/0068-a-colgroup-a-separator-and-a-ceiling-in-sight.md)).

`bsTable({ resize })` puts a grip on every header, driven by a pointer **and by the keyboard**,
with widths a caller can read and restore.

```js
const table = bsTable(host, {
  columns: [
    { key: 'host', label: 'Host', width: 240, minWidth: 120 },
    { key: 'act', label: '', resizable: false },
  ],
  data: rows,
  resize: { onResize: (widths) => save(widths) },
});
table.setColumnWidths(load()); // and back again
```

**No row is re-rendered, ever.** Widths live on a `<colgroup>` — one `<col>` per column — so a
resize writes one style property on one node that is not a row; a ten-thousand-row table costs
what a ten-row one does, and the tests assert it by node identity rather than by counting.

The grip is a `role="separator"` with a tab stop and `aria-valuenow`/`aria-valuemin`, the
platform's own window-splitter pattern: arrow keys resize, `Shift` takes a coarser step, and the
same node handles the drag — one control carrying one state, rather than a mouse affordance
beside a keyboard one that can drift out of step.

`table-layout: fixed` is applied at the **first change**, not when the option is enabled, so
switching the capability on does not re-lay-out a table nobody has touched. `getColumnWidths()`
reports the width the table *enforces* rather than the pixel the engine painted — under a
`width: 100%` table those differ by the container, and only the declared figure round-trips
through `setColumnWidths` and survives a different window size. `resizable: false` withholds the
affordance from your user, not the width from you.

Also new on a column: `width`, `minWidth` and `resizable`. Sticky headers and resize compose.
