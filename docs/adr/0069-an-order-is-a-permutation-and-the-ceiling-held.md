# ADR-0069: An order is a permutation, a drag is a displacement — and the ceiling held

- **Status:** Accepted
- **Date:** 2026-08-24
- **Deciders:** Daniel Polo
- **Related:** [spec 06 §2 F100, §3 NFR-25/NFR-30](../specs/06_spec_table_data.md) (and spec 03
  §1's drag-and-drop non-goal, **superseded** on F100's stated condition), ROADMAP 19.7,
  [ADR-0068](0068-a-colgroup-a-separator-and-a-ceiling-in-sight.md) (the F99 decisions this
  reuses, and the budget question it left open for this item to answer),
  [ADR-0067](0067-five-declarations-and-no-scroll-listener.md) (the F98 header these controls
  share), [ADR-0040](0040-one-grammar-one-pager-and-a-ceiling-below-its-own-parts.md) (the
  F66/F67 composition), [ADR-0041](0041-a-peer-looked-up-not-imported.md) (the 25 kB
  `/bootstrap` entry clause, now the tighter of the two ceilings),
  [ADR-0047](0047-the-unknown-option-key-contract.md), [BUG-0005](../bugs/2026/08/BUG-0005-filter-row-misaligned-under-a-selection-column.md)
  (found while building this, filed rather than folded in)

## Context

F100 asks for a **caller-visible column order** with a user-facing mechanism to change it,
the same keyboard-operable requirement as F99, and one condition attached to superseding spec
03's drag-and-drop non-goal: *drag is permitted as an affordance, never the only one, and the
authoritative interface is the programmatic order* — so a caller can build their own control,
or restore a saved layout, without touching the DOM.

Three things shaped the item.

**Most of the hard questions were answered in 19.6.** One handle for both the pointer and the
keyboard, pointer capture so no listener lands on someone else's node, a click guard so the
gesture does not also sort, a commit callback that fires per gesture rather than per frame:
F99 settled all of them a week ago. An item that re-litigated them would have produced a
second vocabulary for the same ideas inside one component.

**Reorder looks like it should be expensive and is not.** Every row's cells change position,
which sounds like a re-render — until you notice that `append` on a node already in the tree
*moves* it. The whole feature is a permutation applied to four kinds of row.

**The ceiling was the open question.** ADR-0068 measured the artifact at 95% of NFR-22's
40 kB, left this item 1 924 B, observed that F99 had cost 1 165 B for a comparable amount of
feature, and said explicitly that if reorder did not fit the answer was *a decision with
arithmetic behind it* — never a silent breach. This ADR owes that arithmetic.

## Decision

**1. The order is a permutation of column keys, and it is the entire model.** `order` is an
array of keys; `getColumnOrder()` returns a copy of it and `setColumnOrder()` replaces it.
Every render reads it. That is what makes the programmatic interface authoritative rather
than a mirror of whatever the DOM happens to look like, which is F100's stated condition.

**2. The pipeline never learns about it.** Which column a filter or a sort addresses has
nothing to do with where that column is drawn, so reorder is **presentational** and the F42
derivation is untouched — asserted directly: filter, reorder, and the derived view is
identical. That is also why this needed no spec-06 amendment and no new pipeline command.

**3. Applying an order moves nodes; it never rebuilds them.** A row's cells are the same
`<td>` objects afterwards, in a different sequence, so a reorder costs O(rows) moves rather
than O(rows × columns) constructions — and a selected row stays selected with nothing
reflected back onto it. The test asserts it by set-identity: the same nodes, a different
sequence.

**4. The leading offset is computed per row, not passed in.** Four kinds of row mirror the
columns and they do not agree on what comes first: the header row and every body row carry
the F95 selection cell, the F67 filter row does not, and the empty-state row is a single
`colspan` cell that must be left alone. `kids.length - from.length` tells all four apart
without the permutation knowing which is which — and it keeps working after
[BUG-0005](../bugs/2026/08/BUG-0005-filter-row-misaligned-under-a-selection-column.md) is
fixed and the filter row grows its own leading cell. A hard-coded offset would have been
correct today and wrong the week after.

**5. A drag is a displacement, not a position.** The swap threshold is *how far the pointer
has travelled since the gesture began*, against half the neighbour's width. The obvious
alternative — compare the pointer against the neighbour's midpoint in client coordinates —
was written first and **failed in the browser**: the handle sits on the header's leading
edge, so an absolute rule makes a one-slot move cost the column's own width *plus* half the
neighbour's. Nobody would guess that gesture. Displacement makes the grab point irrelevant:
drag half a column, move a column.

**6. Live swaps instead of a drop indicator.** The columns move as the pointer crosses each
threshold, so the drag needs no extra node, no extra CSS and no cleanup — and the table shows
the result rather than a promise of it. Header widths are re-measured at the start of a
gesture and again after each swap: **never per pointer move**, which is the per-frame layout
read F98 refused and F99 inherited. A drag crosses a handful of thresholds and fires hundreds
of moves.

**7. The handle takes the leading edge, because F99's grip has the trailing one.** A table
with both features has one control per edge of every header and they cannot overlap —
asserted geometrically in a real engine rather than reasoned about from the CSS.

**8. `movable: false` withholds the affordance, not the position** — the same rule
`resizable: false` follows for widths (ADR-0068 §7). The caller exempted their user, not
themselves, and `setColumnOrder` still places the column.

**9. A partial order is refused, naming what is missing.** "The rest, in some order" is two
answers to one question. Unknown keys are reported before missing ones, so a typo reads as a
typo rather than as the column it happens to displace.

**10. The ceiling held, and NFR-22 is not amended.** Measured:

| Row | 19.6 | 19.7 | Δ | limit |
|---|---:|---:|---:|---:|
| `{bsTable}` | 12 591 B | **13 356 B** | +765 B | 14.2 kB |
| `/bootstrap` full import | 23 505 B | **24 391 B** | +886 B | 24.9 kB |
| artifact (served, NFR-22) | 38 076 B | **38 898 B** | +822 B | 39 000 B |

**1 102 B remain under NFR-22's 40 kB**, and this is the wave's last *capability*: the only
item left in M19 is 19.9, a defect fix worth a handful of bytes. Reorder came in at 822 B served against F99's 1 165 B for a comparable
amount of user-visible feature — the difference being decisions 1–9's reuse of ADR-0068, and
the fact that moving nodes needs no markup of its own.

**The tighter constraint is now the sibling one, and it is worth naming while it is cheap:
ADR-0041's 25 kB `/bootstrap` entry clause has 609 B left.** M20 puts promise-based dialogs,
a toast manager and a theme manager on that same entry. The first M20 item to grow it
inherits that figure and owes the same kind of decision this one owed — amend the clause with
arithmetic, or split the entry — and finding that out before the wave starts is the whole
value of having measured it here.

## Alternatives Considered

- **Re-render the body on each reorder.** One line instead of a permutation function.
  Rejected: O(rows × columns) node constructions per swap, and a drag performs several swaps
  — on an unpaginated ten-thousand-row table that is visible. Moving nodes costs the same
  traversal and builds nothing.
- **Reorder the `columns` array and let the pipeline see it.** Tempting because it makes
  "the order" one thing. Rejected: the pipeline's column configuration is *what* each column
  is, and display order is *where* it is. Coupling them would make a cosmetic drag invalidate
  a derivation, and F42's `NFR-13` budget would start depending on how a user arranged their
  screen.
- **An absolute-position swap rule (pointer vs. the neighbour's midpoint).** Written first
  and measured: it requires dragging the column's own width plus half the neighbour's before
  anything moves, because the handle is on the leading edge. Rejected on the browser
  evidence, not on taste — the jsdom suite could not have caught it, and it is the second
  consecutive item where a real engine corrected a design assumption.
- **A drop indicator instead of live swaps.** The conventional shape. Rejected: it needs a
  node, styling and teardown, and it shows a promise of a result the table could simply be
  showing. Live swapping is cheaper *and* more informative — a rare pairing worth taking.
- **HTML5 drag-and-drop (`draggable`, `dragstart`/`dragover`/`drop`).** The platform's own
  answer, and it would have needed six api-floor entries. Rejected: it has no keyboard story
  at all, its drag image is not stylable across engines, and it does not work on touch
  without a parallel pointer implementation — so the "never the only affordance" condition
  would have cost a second implementation rather than a shared one.
- **Amending NFR-22 pre-emptively.** Rejected on the measurement: it fits. Amending a ceiling
  that is not breached would have spent the one thing that makes the ceiling useful.

## Consequences

- `bsTable({ reorder })`, `movable` on a column, and `getColumnOrder()` /
  `setColumnOrder()` on the instance when reorder is on. All additive: **the public surface
  stays at 123 exports** (NFR-25), and both new bags reject unknown keys (ADR-0047).
- **No api-floor amendment.** Everything this uses — pointer events, pointer capture,
  `getBoundingClientRect` — was inventoried by 19.6 (ADR-0068), which is what a shared design
  looks like a wave later.
- Spec 03 §1's drag-and-drop non-goal is **superseded**, on F100's condition and only that
  condition: the drag exists, and it is not the only way in. The arrow keys reach the same
  model through the same handle, and `setColumnOrder` reaches it without any affordance at
  all.
- **Position is not announced.** A screen-reader user operating the handle hears the header
  row's new order when they re-read it, and nothing at the moment of the move — this library
  has no live region until M20.5 builds one. F100 requires *operability*, which is met; the
  announcement is a real gap, and it is named here rather than left for someone to discover.
- [BUG-0005](../bugs/2026/08/BUG-0005-filter-row-misaligned-under-a-selection-column.md) was
  found while deciding §4 and is **filed, not fixed here**: the F67 filter row renders one
  cell per column with no leading cell, so a table with `selection` *and* `filterRow` has had
  every filter input sitting under its neighbour since 19.3. It predates this item, it is
  visible without reorder, and AGENTS.md §10 says an out-of-scope finding becomes a roadmap
  item in the same PR — 19.9.
- The test split follows the previous two items: jsdom owns the model and the swap
  *arithmetic* (with header widths stubbed, because the rule is arithmetic and only the
  geometry needs an engine), and Playwright owns the geometry on three engines — that a drag
  past a neighbour swaps the columns under the cursor, that the filter row travels with them,
  and that the two handles do not share a pixel.

## References

- Spec 06 §2 F100, §3 NFR-25/NFR-30; spec 03 §1 (the superseded non-goal).
- ARIA Authoring Practices — a control that moves something is a `button`, not a `separator`
  (which is what F99's resize grip is, and why the two handles carry different roles).
- Pointer Events Level 2 — implicit and explicit pointer capture.
