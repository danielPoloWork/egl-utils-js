---
'egl-utils-js': minor
---

**Column reorder** (ROADMAP 19.7, spec 06 F100,
[ADR-0069](docs/adr/0069-an-order-is-a-permutation-and-the-ceiling-held.md)).

`bsTable({ reorder })` makes the column order caller-visible and authoritative, with a handle
on every header that works by **drag and by keyboard**.

```js
const table = bsTable(host, {
  columns: [{ key: 'host' }, { key: 'ip' }, { key: 'seen' }],
  data: rows,
  reorder: { onReorder: (order) => save(order) },
});
table.setColumnOrder(load()); // and back again
table.getColumnOrder(); // → ['seen', 'host', 'ip']
```

Drag a handle and the columns swap as the pointer passes each neighbour — no drop indicator,
because the table can show the result instead of a promise of it. The handle is also a
focusable `role="button"`, so `ArrowLeft` / `ArrowRight` move a column one slot per press. Or
use neither: `setColumnOrder` reaches the same model without any affordance, which is what
F100 means by the programmatic order being authoritative.

**The pipeline never sees the order** — which column a filter or a sort addresses has nothing
to do with where it is drawn, so reordering is presentational and the derived view is
untouched. **No row is rebuilt**: cells are moved, not re-created.

`setColumnOrder` takes a full permutation; a partial list is a `TypeError` naming what is
missing. New on a column: `movable`, which withholds the handle from a user without
withholding the position from the caller. Reorder and resize compose — the move handle takes
the header's leading edge, the F99 resize grip the trailing one.

This supersedes spec 03's "drag-and-drop column reordering" non-goal, on F100's condition:
the drag exists, and it is not the only way in.
