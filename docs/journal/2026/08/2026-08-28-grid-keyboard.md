# 2026-08-28 — One tab stop, and a clause that stopped working (23.3)

## What got done

- **`keyboard` on `bsTable`** (spec 09 F130–F131): one tab stop for the grid, a roving `tabindex`
  over the cells, the arrows, `Home`/`End`, `Ctrl+Home`/`Ctrl+End`, `PageUp`/`PageDown`, and
  `Enter`/`Escape` into and out of a cell's own control.
- **[ADR-0086](../../adr/0086-one-tab-stop-and-a-clause-that-stopped-working.md)**, and
  **ADR-0041's `/bootstrap` clause amended a third time** — with ROADMAP 22.2 filed to stop the
  fourth.
- 32 example tests for the movement matrix in jsdom, 4 on three engines for the questions only an
  engine can answer; 3 489 unit tests green.
- **Spec 09 is closed**: F126–F131 and NFR-45–NFR-49 delivered across 23.1–23.3.

## The gap was not "no arrow keys"

It was worse, and the numbers say it plainly. A twelve-column table with resize, reorder and a
selection checkbox per row puts **twenty-four header widgets and one checkbox per row** into the
page's tab order. Reaching the grip on column nine costs seventeen `Tab` presses; getting *past* the
table costs a hundred.

The F99 and F100 grips were accessible in isolation and unreachable in use. So the load-bearing
decision of this item is not the arrow keys — it is that everything the table renders is demoted to
`tabindex="-1"` and reached through its cell instead. Twenty-four stops before, one after.

## Where I went further than the requirement, and why

The demotion takes the **caller's** controls too — a link a `format` returned, a row-action button.
That is a real behaviour change under `keyboard`, and the argument is that the alternative is worse:
one row-action button left as a tab stop and "one tab stop" is true of a table with nothing in it
and false of every real one. It costs one `querySelectorAll` per row, inside the loop that already
builds rows, and it happens only when the option is passed.

The `onRowClick` row loses its own `tabindex="0"` for the same reason, and `Enter` on a cell with no
control of its own activates the row in its place.

## Four things the model got right by being small

- **The active cell is a node, not a pair of indices.** A body render replaces every row; a stale
  `(row, column)` would point at whatever moved into that slot — the wrong cell, silently. Holding
  the node makes the post-render check `isConnected`, and the fallback is what keeps a grid with no
  tab stop from becoming unreachable.
- **Clamping is the "does not turn pages" rule.** There is no branch that reaches for the next page,
  so there is nothing to remember not to do. The column clamps too, which is what lets the F128
  empty-state row — one `colspan` cell — be a place the arrows land rather than a hole.
- **One line handles all of F131.** *If the event's target is not the active cell, take `Escape` and
  nothing else.* `Tab` inside an entered cell is the browser's, met by doing nothing; the F99 grip
  and the F100 handle keep their own arrow keys, because their target is the widget and never the
  cell; and no "entered" flag has to be tracked, because the DOM already knows.
- **The browser keeps what is its.** `focus()` scrolls the cell into view and the screen reader
  reads it. This library calls neither, which is exactly what a roving `tabindex` buys over a
  painted highlight — and the browser suite asserts the scroll really happens, because "the engine
  does it" is a claim about an engine.

## The clause stopped working, and saying so is the point

Measured 26 767 B against the 26.75 kB clause set **one item ago**: 17 B over.

| | measured | clause | over by |
|---|---:|---:|---:|
| before 23.1 | 24 632 B | 25 kB | — |
| 23.1 | 24 902 B | 25.5 kB | 3 B |
| 23.2 | 26 120 B | 26.75 kB | 520 B |
| 23.3 | **26 767 B** | **27.5 kB** | 17 B |

Every one of those three amendments was correct under its own rule — the minimum that restores the
row's margin. Three in a row means the instrument is wrong, not the changes. The diagnosis is in the
row beside it: **`single: bsTable` is 15 419 B of the entry's 26 767 B, 58% of it.** A per-entry
ceiling cannot tell a data-grid capability from an eleventh builder, and only the second is the
sprawl ADR-0041 was written against.

I considered re-scoping the clause here — a row measuring the catalogue *without* `bsTable` is
almost certainly the right instrument. I did not, and that is deliberate: a clause redefined inside
the change whose number does not fit it is indistinguishable from moving the goalposts. It is filed
as **22.2**, with the arithmetic, as its own decision.

Two smaller figures worth keeping: NFR-22's derivation moved (72 679 B) and its bound did **not** —
still 73 kB, the second time that has happened. And for the second item running there is **no new
chunk and no new request** on any of the thirteen F87 routes.

## The Firefox lesson, applied before it cost anything

23.2 shipped a browser assertion that pinned `document.activeElement` after focus had left the
document, and Firefox disagreed with Chromium and WebKit about what that reads. This suite's
fixture puts a focusable sentinel on **both** sides of the table from the start, so "one Tab in, one
Tab out" is a question about the page rather than about browser chrome. Firefox still cannot launch
on this workstation; the difference is that the assertions no longer depend on which engine runs
them.

## What is left

Spec 09 is closed and the roadmap has one open item: **22.2**, the budget instrument. It is a
decision item rather than a feature — the deliverable is which instrument, not which number.
