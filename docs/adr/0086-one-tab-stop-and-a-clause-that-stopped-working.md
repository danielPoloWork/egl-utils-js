# ADR-0086: One tab stop, the browser keeps the parts that are its, and a clause that stopped working

- **Status:** Accepted
- **Date:** 2026-08-28
- **Deciders:** Daniel Polo
- **Related:** [spec 09](../specs/09_spec_hardening.md) §2 F130-F131, §3 NFR-45/NFR-47/NFR-49,
  ROADMAP 23.3 (and 22.2, which this record files);
  [ADR-0068](0068-a-colgroup-a-separator-and-a-ceiling-in-sight.md) (F99, whose grip this demotes
  and whose arrow keys it leaves alone),
  [ADR-0069](0069-an-order-is-a-permutation-and-the-ceiling-held.md) (F100, same),
  [ADR-0085](0085-visibility-is-rendering-and-the-clause-moved-again.md) (F128, whose re-render this
  hooks, and the second of the three clause amendments),
  [ADR-0084](0084-a-url-is-not-text.md) (the first),
  [ADR-0041](0041-a-peer-looked-up-not-imported.md) (**the clause amended here for the third and
  last time**), [ADR-0049](0049-commands-throw-queries-answer.md),
  [ADR-0082](0082-a-figure-nobody-checks-is-prose.md) (the gate that caught both rows)

## Context

Bootstrap owns the keyboard behaviour of tabs, dropdowns, navbars and modals, which is why this
library ships none: the peer is the accessible implementation. **A data grid has no vendor behind
it.** `bsTable` is the one component where this library already writes keyboard code of its own —
the F99 resize grip and the F100 reorder handle are arrow-key operable — and what was missing is
the pattern those grips sit inside.

The gap is worse than "no arrow keys". A table with twelve columns, resize, reorder and a selection
checkbox per row puts **twenty-four header widgets and one checkbox per row** into the page's tab
order. Reaching the grip on column nine means pressing `Tab` seventeen times, and a keyboard user
who wants to get *past* the table has to press it a hundred times. The grips were accessible in
isolation and unreachable in practice.

This also resolves the source proposal's §50, "roving tabindex for groups and menus" — adopted
**here**, where it has a consumer. An audit found arrow-key handling in exactly one file of
`src/main`, so a free-standing primitive would have been a correct implementation with nothing to
call it: the mirror image of the F109 lesson, and just as expensive.

## Decision

**1. `keyboard` is opt-in, like every other `bsTable` capability.** A table that does not want a
single tab stop must not silently get one — the same rule as `sticky`, `resize`, `reorder` and
`selection`, and the reason is stronger here: this changes the tab order of a page that already
works.

**2. The role goes on the table and nowhere else.** `role="grid"` on the `<table>`, and nothing on
rows or cells: HTML-AAM already exposes a `<td>` inside a grid as a `gridcell` and a `<tr>` as a
`row`. Stamping either per node would be one attribute per cell — O(rows × columns) of DOM writes
and of bytes — to say what the mapping says for free.

**3. Every control the table renders is demoted to `tabindex="-1"`, and so is the caller's.** This
is the decision the whole item turns on. `Enter` on a cell reaches the control (F131), so it is
exactly as operable as before and is no longer in the way of somebody tabbing past the table. It
takes the caller's own controls too — a link a `format` returned, a row-action button — because the
grid pattern is about the *table*, not about who authored what sits inside it, and one row-action
button left as a tab stop breaks the single promise F130 makes. One `querySelectorAll` per **row**,
inside the loop that already builds rows, and only under `keyboard`.

**4. The row stops being a tab stop, and `Enter` on a cell replaces it.** `onRowClick` gives every
row `tabindex="0"` today, which is N tab stops and is exactly what the grid pattern exists to
remove. Under `keyboard` the row takes none, and `Enter` on a cell that has **no control of its
own** activates the row instead — so the "open the record" case keeps a keyboard path, and a cell
with a checkbox in it does the checkbox rather than two things at once.

**5. Movement clamps, and that is what makes "the navigation does not turn pages" true.** There is
no branch that reaches for the next page, because an arrow key that fetches data is a surprise. The
column index clamps to the target row's cell count as well, so the F128 empty-state row — a single
`colspan` cell — is a place the arrows can land rather than a hole. `Home`/`End` take the row's
ends, `Ctrl`/`Meta` with them the table's.

**6. `PageUp`/`PageDown` measure, once per key press.** The scroll container's height over a row's,
read at the moment of the press and never per frame — the F98/F99 rule about layout reads, applied
to a keyboard. Where there is no layout to read (jsdom, a detached tree, a server render) it falls
back to a documented **10** rather than to a `0` that would make the key silently do nothing, and a
caller who wants a fixed jump passes `pageRows`.

**7. The active cell is a node, not a pair of indices.** A body render replaces every row, and a
stale `(row, column)` pair would point at whatever moved into that position — the wrong cell,
silently. Holding the node means the check after a render is `isConnected`: a header cell survives
and the user stays where they were, a body cell does not and the stop returns to the first cell,
because **a grid with no tab stop is unreachable**.

**8. Inside an entered cell, this grid takes exactly one key.** The rule is one line — if the
event's target is not the active cell, handle `Escape` and nothing else — and it does three jobs at
once. `Tab` inside an entered cell is the browser's, which is F131's requirement met by *doing
nothing*. The F99 grip and the F100 handle keep their own arrow keys, because their target is the
widget and never the cell. And no state has to be tracked to know whether the grid is "entered":
the DOM already knows.

**9. The browser keeps the parts that are its.** `focus()` scrolls the cell into view and the
screen reader reads the cell it lands on. This library calls neither `scrollIntoView` nor an
announcement, and F130's "a roving `tabindex` rather than a rendered highlight" is what buys that: a
painted highlight would have been a second, competing source of truth for both. The browser suite
asserts the scroll actually happens, because "this is the engine's job" is a claim about an engine.

**9b. Firefox gives a scrollable container its own tab stop, and this declines it.** Found by the
browser suite rather than reasoned about, which is the reason that suite exists: `Tab` reached the
F71 `.table-responsive` wrapper before the grid on Firefox, so the table was **two** tab stops there
and one on Chromium and WebKit. Firefox does that so a keyboard user can scroll a region they could
not otherwise reach — a reason that stops applying the moment this navigation exists, because moving
the cell focus is what scrolls this container now. An explicit `tabindex="-1"` on the wrapper, under
`keyboard` only, is how that is declined. Three engines, one assertion, one line of source: this is
the case NFR-49 had in mind when it put the grid's tab-stop count in a real engine.

**10. ADR-0041's `/bootstrap` clause is amended a third time — and 22.2 is filed to stop the
fourth.** Measured 26 767 B against the 26.75 kB clause ADR-0085 set one item ago: **17 B over**.
Each of the three amendments was correct under its own rule, and three in a row means the
instrument is wrong rather than the changes:

| | measured | clause | over by |
|---|---:|---:|---:|
| before 23.1 | 24 632 B | 25 kB | — |
| 23.1 (ADR-0084) | 24 902 B | 25.5 kB | 3 B |
| 23.2 (ADR-0085) | 26 120 B | 26.75 kB | 520 B |
| 23.3 (this) | 26 767 B | **27.5 kB** | 17 B |

The diagnosis is in the measurements beside it: **`single: bsTable` is 15 419 B of the entry's
26 767 B — 58%**. A per-entry ceiling cannot tell a data-grid capability from an eleventh builder,
and only the second is the catalogue sprawl ADR-0041 was written against. ROADMAP 22.2 carries the
replacement, and the candidate is named there: a row measuring the catalogue *without* `bsTable`,
with the flagship bounded by its own per-function row as it already is. This ADR amends rather than
redefines, deliberately — quietly re-scoping a clause in the item whose number does not fit it is
how a budget stops meaning anything.

## Alternatives Considered

| Option | Why not |
|---|---|
| **A rendered highlight instead of a roving `tabindex`** | Then the library owns the scroll into view and the announcement, and both would be a second source of truth beside the one the browser already maintains. F130 asks for the roving version for exactly this reason. |
| **Leave the F99/F100 grips as tab stops** | Twenty-four tab stops on a twelve-column table is what makes them unreachable in practice. The item exists because they were accessible in isolation and not in use. |
| **Demote only the controls this library renders** | A row-action button the caller put in a cell would still be a tab stop, and "one tab stop" would be true of a table with nothing in it and false of every real one. |
| **Keep the row a tab stop under `onRowClick`** | N + 1 stops rather than one, and two competing keyboard vocabularies for the same table. `Enter` on a cell is the grid pattern's own answer. |
| **`role="gridcell"` on every `<td>`** | O(rows × columns) attributes to restate what HTML-AAM already maps. The role on the table is the whole of what a grid needs. |
| **Arrow keys turn the page at the edge** | An arrow key that fetches data is a surprise, and on a remote pipeline it is a request. F130 says so explicitly; clamping is how it is enforced without a rule to remember. |
| **A fixed `PageUp`/`PageDown` jump** | "By the visible viewport" is what the requirement says, and a fixed ten rows is wrong on both a three-row table and a fifty-row one. Measured, with the fixed number available as an option and as the no-layout fallback. |
| **A free-standing `rovingTabindex` export (proposal §50)** | One file in `src/main` contains arrow-key handling. A primitive with no caller is the F109 mistake; the pattern is adopted where it has a consumer. |
| **Track an `entered` flag for F131** | The DOM already knows: if the event's target is not the active cell, the keyboard belongs to whatever is. A flag would be a second copy of that fact, and copies drift. |
| **Squeeze 17 B out to hold the clause** | Would have made the clause bind by accident rather than by design, and left the real finding — three amendments in three items — unwritten. |
| **Re-scope the clause in this ADR to exclude `bsTable`** | The right instrument, and the wrong item to decide it in: a clause redefined inside the change whose number does not fit is indistinguishable from moving the goalposts. Filed as 22.2, with the evidence. |

## Consequences

- **`/bootstrap` reaches 26 767 B (+647 B)** under an amended 27.5 kB clause, row pinned at
  27.27 kB; **`single: bsTable` 15 419 B (+644 B)**, pinned at 16.21 kB. No other row moved by more
  than the shared-chunk band, and **no new dependency**: the feature is `tabindex` and `focus()`.
- **NFR-22's derivation moved and its bound did not** — 72 679 B still rounds to the 73 kB set in
  23.2. The distinction the rule is about, and the second time it has held (21.5 was the first).
- **F87: no new chunk, no new request** on any of the thirteen routes, for the second item running.
  `/bootstrap` served grows 936 B against 647 B bundled, the usual whole-file gap; its budget is
  unchanged because it still holds with 1 193 B to spare.
- **The surface is additive (NFR-45).** 141 exports, unchanged. One optional option (`keyboard`)
  with one optional field (`pageRows`). No instance method: the grid is a behaviour, and a caller
  who wants to place focus has the DOM.
- **A behaviour change under `keyboard`, and only there**: the F99 grip, the F100 handle, the F95
  checkbox, the F67 filter inputs, the caller's own cell controls and — on Firefox — the F71
  scroll wrapper stop being tab stops, and an `onRowClick` row stops being one too. Every one of them stays operable through its cell. A table
  that does not pass `keyboard` is byte-for-byte the table it was.
- **Spec 09 is closed.** F126–F131 and NFR-45–NFR-49 are all delivered across 23.1–23.3, and the
  coverage map reads ✅.
- **ROADMAP 22.2 is filed** with the arithmetic above, per AGENTS.md §10: the clause needs a
  different instrument, and that decision is its own item rather than a paragraph in this one.

## References

- `src/main/javascript/it/d4np/utils/bootstrap-table.js` (the `keyboard` block, `demoteTabStops`,
  `FOCUSABLE`, `DEFAULT_PAGE_ROWS`)
- `src/test/javascript/it/d4np/utils/bootstrap-table-keyboard.test.js` (the movement matrix),
  `src/test/browser/bootstrap-table-keyboard.spec.js` (one Tab in and one out, focus, the scroll,
  the F131 round trip — three engines)
- [spec 09](../specs/09_spec_hardening.md) §2 F130-F131, §3 NFR-45/NFR-47/NFR-49, §6
