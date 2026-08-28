---
'egl-utils-js': minor
---

**One tab stop, and the arrows move inside it** (ROADMAP 23.3, spec 09 F130–F131,
[ADR-0086](docs/adr/0086-one-tab-stop-and-a-clause-that-stopped-working.md)). No new export: one
option on `bsTable`, opt-in, and **spec 09 closes with it**.

```js
const table = bsTable(host, {
  columns,
  data: rows,
  resize: true,
  reorder: true,
  selection: true,
  keyboard: true, // ← one tab stop for the whole grid
});
```

**The problem was not the missing arrow keys.** A twelve-column table with resize, reorder and a
selection checkbox per row puts twenty-four header widgets and one checkbox per row into your page's
tab order. Reaching the resize grip on column nine takes seventeen `Tab` presses; getting *past* the
table takes a hundred. Those grips were accessible in isolation and unreachable in practice.

With `keyboard`, the table takes **one** position in the tab order and the arrows move a cell focus
inside it — `Home`/`End` for the row's ends, `Ctrl+Home`/`Ctrl+End` for the table's,
`PageUp`/`PageDown` by the visible viewport (measured, or `keyboard: { pageRows: 20 }` for a fixed
jump). Movement clamps at every edge, so the navigation never turns the page: an arrow key that
fetches data is a surprise.

**`Enter` enters a cell's control, `Escape` comes back**, and `Tab` inside an entered cell is the
browser's. That is how the selection checkbox, the resize grip, the reorder handle and your own
row-action buttons stay reachable — every control the table renders is demoted to `tabindex="-1"`
and reached through its cell instead.

**This takes your controls too**, and only under `keyboard`: a link a `format` returned or a button
you put in a cell stops being a tab stop and becomes an `Enter` away. One row-action button left in
the tab order would break the single promise the option makes. A row with `onRowClick` also stops
being a tab stop; `Enter` on a cell with no control of its own activates it instead.

**The browser keeps what is the browser's.** The moving focus is a roving `tabindex`, not a painted
highlight, so `focus()` scrolls the cell into view and the screen reader reads what it lands on —
this library calls neither, and three engines assert that it happens.

**A table without `keyboard` is byte-for-byte the table it was.**

**Budgets.** `/bootstrap` reaches 26 767 B (+647 B) under an amended 27.5 kB clause and `bsTable`
15 419 B — no new dependency, because the whole feature is `tabindex` and `focus()`. No new chunk
and no new request on any documented no-bundler route. 141 exports across twelve entries, unchanged.
