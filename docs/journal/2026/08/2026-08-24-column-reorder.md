# 2026-08-24 — Column reorder, and spec 06 is delivered (roadmap 19.7)

## What got done

- **`bsTable({ reorder })`** (spec 06 F100): a caller-visible, authoritative column order,
  with a handle on every header that drags *and* takes the arrow keys, plus
  `getColumnOrder()` / `setColumnOrder()` and `movable` on a column.
- **[ADR-0069](../../adr/0069-an-order-is-a-permutation-and-the-ceiling-held.md)** — ten
  decisions, and the budget arithmetic ADR-0068 left this item to answer.
- **[BUG-0005](../../bugs/2026/08/BUG-0005-filter-row-misaligned-under-a-selection-column.md)**
  filed and **19.9** opened for it: found while building this, not folded into it.
- 45 jsdom cases in a new `bootstrap-table-reorder.test.js`, 7 Playwright cases, budgets
  re-pinned.
- **Spec 06 is delivered** — F88–F100, seven capability items plus the 19.8 gate fix. What
  remains open in M19 is 19.9, the defect this item found.

## Most of the design was already decided

19.6 settled one handle for both the pointer and the keyboard, pointer capture so no listener
lands on someone else's node, a click guard so the gesture does not also sort, and a commit
callback per gesture rather than per frame. Re-litigating any of them would have produced a
second vocabulary for the same ideas inside one component, so this item reused all four —
and that reuse is most of why it cost **765 B against F99's 1 155 B** for a comparable amount
of user-visible feature.

The genuinely new decision is that **an order is a permutation of column keys and the
pipeline never sees it**. Which column a filter addresses has nothing to do with where that
column is drawn, so reorder is presentational: no new pipeline command, no spec amendment,
and a test that filters, reorders, and asserts the derived view is byte-identical.

The second is that applying an order **moves nodes rather than rebuilding them** — `append`
on a node already in the tree moves it, so a permutation is one traversal and the same `<td>`
objects come out in a different sequence.

## The browser corrected the design again

The swap rule was written first as an absolute comparison: is the pointer past the
neighbour's midpoint? It passed nothing in a real engine, and the reason is geometric. **The
handle sits on the header's leading edge**, so an absolute rule requires dragging the
column's own width *plus* half the neighbour's before anything moves. Nobody would guess that
gesture.

Rewritten as a **displacement** — how far the pointer has travelled since the gesture began,
against half the neighbour's width — the grab point stops mattering: drag half a column, move
a column. That is the second consecutive item where a failing Playwright assertion corrected
a design assumption jsdom could not have questioned, and it is worth saying plainly: the
browser suite is not a formality on this component.

The related decision is **live swaps instead of a drop indicator**. The conventional shape
needs a node, styling and teardown, and it shows a promise of a result the table could simply
be showing. Live swapping is cheaper *and* more informative — a rare pairing, so take it.

## Four kinds of row, and one that disagreed

The permutation has to know how many cells precede the data columns in a given row. The
header and every body row carry the F95 selection cell; the empty-state row is a single
`colspan` cell that must be left alone. Computing `kids.length - from.length` per row tells
them apart without the permutation knowing which is which.

Working that out is what surfaced **BUG-0005**: the F67 filter row renders one cell per
column and *no* leading cell, so a table with `selection` **and** `controls.filterRow` has
had every filter input drawn under its neighbour since 19.3 — the last column appearing to
have none. It is silent and visual: the wiring is correct, each input filters the column its
`aria-label` names, so a sighted user and a screen-reader user see different tables.

Filed as 19.9 rather than fixed here — it predates this item and is visible without reorder.
The per-row offset means column reorder is correct both before and after the fix, which is
the useful property to have designed in by accident rather than to have to add later.

## The ceiling held

ADR-0068 left this item 1 924 B of NFR-22's 40 kB and said that if reorder did not fit, the
answer was a decision with arithmetic behind it rather than a silent breach. The arithmetic:

| Row | 19.6 | 19.7 | Δ |
|---|---:|---:|---:|
| `{bsTable}` | 12 591 B | 13 356 B | +765 B |
| `/bootstrap` full import | 23 505 B | 24 391 B | +886 B |
| artifact (served, NFR-22) | 38 076 B | 38 898 B | +822 B |

**1 102 B remain under the ceiling, so NFR-22 is not amended** — and this is the wave's last
capability, 19.9 being a defect fix worth a handful of bytes. Amending a ceiling that is not
breached would have spent the one thing that makes a ceiling useful.

The constraint that *is* worth carrying forward is the sibling one: **ADR-0041's 25 kB
`/bootstrap` entry clause has 609 B left**, and M20 puts promise-based dialogs, a toast
manager and a theme manager on that same entry. The first M20 item to grow it owes the same
kind of decision this one owed. Knowing that before the wave starts is the entire value of
having measured it now.

## One flaky test, found and fixed rather than re-run

`a drag that crosses nothing changes nothing` failed once in a combined run and passed alone.
The cause was in the test: it dragged a fixed **4 px** to assert that a small gesture does
nothing, while the threshold it must not cross is *half the rendered neighbour* — so the
assertion's safety depended on the viewport it was written on. Re-expressed as 40% of the
measured neighbour, like every other drag in the block, and confirmed over three consecutive
runs plus WebKit. A test that passes on the second attempt has told you something; this one
said "your absolute number is not in the same currency as your threshold", which is the same
lesson the swap rule itself had already taught.

## Verified

2814 tests at 100% lines, `bootstrap-table.js` at 100% branches — reached by deleting one
unreachable ternary arm rather than mock-covering it (a duplicate key in a right-length array
always implies a missing one, so the "nothing missing" message could never print). Chromium
and WebKit pass all 7 browser cases, chromium three times over after the flake above; Firefox will not launch on this machine, so CI covers
it. `check:package`, F87 transfer budgets, api-floor — **no amendment needed, everything this
uses was inventoried by 19.6** — `docs:api`, redos, lint, format and the consistency lint all
green. Surface unchanged at **123 exports**.

## How the next session resumes

1. Wait for this PR to merge. **Spec 06 is then delivered end to end** — F88–F100 — and
   the wave's version bump is the owner's call; 19.9 can ship before or after it.
2. The open item is **19.9** (BUG-0005). It is small and self-contained, and its own decision
   — an empty leading `<td>` versus a `<th scope="row">` carrying the selection column's
   accessible name — is written up in the bug report.
3. Before any M20 item that touches `/bootstrap`, read ADR-0069's budget section: 609 B under
   the ADR-0041 clause is the number that wave inherits.
