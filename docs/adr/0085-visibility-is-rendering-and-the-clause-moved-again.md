# ADR-0085: Visibility is a rendering fact, the cell goes rather than hides, and the clause moved again

- **Status:** Accepted
- **Date:** 2026-08-28
- **Deciders:** Daniel Polo
- **Related:** [spec 09](../specs/09_spec_hardening.md) §2 F128-F129, §3 NFR-45/NFR-47/NFR-49,
  ROADMAP 23.2; [ADR-0068](0068-a-colgroup-a-separator-and-a-ceiling-in-sight.md) (F99 resize, whose
  width this must preserve), [ADR-0069](0069-an-order-is-a-permutation-and-the-ceiling-held.md)
  (F100 reorder, whose permutation this now filters),
  [ADR-0063](0063-the-url-is-the-state-and-the-page-goes-last.md) (F93, which gains a second half here),
  [ADR-0049](0049-commands-throw-queries-answer.md) (the command/query split these
  four methods obey), [ADR-0041](0041-a-peer-looked-up-not-imported.md) (**the `/bootstrap` entry
  clause this record amends for the second time in two items**),
  [ADR-0084](0084-a-url-is-not-text.md) (the first of those two amendments, and the rule this one
  reuses), [ADR-0082](0082-a-figure-nobody-checks-is-prose.md) (the figures gate that caught seven
  rows), [ADR-0061](0061-served-bytes-are-their-own-accounting.md) (F87, which priced the served
  routes)

## Context

`BsTableColumn` had `sortable`, `filterable`, `searchable`, `resizable`, `movable` and `width`. It
had no `visible`. So an application wanting twelve columns available and five shown had to keep two
column arrays and swap them — and swapping them destroys the instance, which means losing the sort,
the filters, the search, the F99 widths and the F100 order on every toggle. Column visibility is
the oldest request in any data grid and the one the source proposal listed first.

The interesting part is not that it was missing. It is **where it belongs**, and F128's headline
requirement answers that: *hiding the column a table is sorted by must not clear the sort.* Any
design that tells the pipeline about visibility has to then remember not to act on it. A design
that never tells it cannot get this wrong.

## Decision

**1. Visibility is a rendering fact, and `/table` is never told.** `visible: false` joins the
column descriptor beside `resizable` and `movable`; `bsTable` keeps a `Set` of hidden keys and
filters what it renders. The F42 derivation sorts, filters, searches and pages rows regardless of
which columns a viewer can see. "Hiding the sort column does not clear the sort" is therefore not a
rule anyone implemented — there is no code path that could have cleared it. The same split is why a
hidden column keeps its filter, its width and its position: all three live outside the DOM, in the
pipeline, in `columnWidths` and in `order`, and none of them is consulted by the hide.

**2. The cell is removed, not styled away.** `display: none` is what every grid reaches for and it
is the wrong answer here: the cell stays in the accessibility tree's column count, stays in every
`querySelector` a caller writes, and stays in `td.length`. A table that reports four columns and
shows three says one thing and shows another. The `<th>`, the `<col>` and the filter cell are
**detached and kept** — the very nodes that carry the F99 grip and the F100 handle — so showing a
column re-inserts them rather than rebuilding them.

**3. One mirror registry, and F100's permutation goes through it.** Three nodes mirror the columns
one-for-one: the header row, F99's `<colgroup>`, F67's filter row. They differ only in what
*precedes* the column cells (an F95 selection cell, a spacer, nothing), which is exactly the
distinction BUG-0005 was about. So they are **registered** with the cell each column owns rather
than discovered, and one pass in display order both re-inserts what came back and re-sorts what
stayed — `append` of a node already in the tree moves it. F100's `applyOrder` now calls that pass
instead of permuting the head itself; it still permutes the **body**, whose rows are not registered
because they are rebuilt per render anyway.

**4. The body IS re-rendered, and that is the honest cost.** A resize touches one `<col>` and a
reorder moves nodes; a visibility toggle adds or removes a `<td>` per row, which is structural.
O(page) once, on a user pressing a checkbox rather than on a frame of a drag. Two consequences are
handled rather than hoped for: the empty-state `colspan` counts visible columns, and a column shown
after the layout was pinned is **measured on re-insertion**, because under `table-layout: fixed` a
column with no declared width takes an equal share of what is left and would come back four times
the size of its neighbours.

**5. Arrow keys step over a hidden column rather than into it.** F100's `moveBy` walks in the
requested direction until it finds a **visible** slot. A slot nobody can see is not a slot, and one
arrow press that visibly does nothing is how a keyboard path stops being one. The drag's swap
thresholds are measured over the visible order for the same reason: a detached header measures `0`,
and a zero between two real neighbours makes the next threshold nonsense.

**6. Four methods, and the split is ADR-0049's.** `hideColumn`, `showColumn` and `toggleColumn` are
commands and throw after `destroy()`; `getHiddenColumns()` is a query and still answers. A fifth,
`onColumnVisibility`, is a subscription — and a subscription is a command, so it throws too.
`hideable: false` withholds the chooser's control and nothing else: the caller can still hide the
column, exactly as `movable: false` still takes a position from `setColumnOrder`. The exemption is
from the user, not from the caller — the F99/F100 rule, restated rather than re-decided.

**7. Hiding the last visible column is a `TypeError`, and the chooser disables the box.** The
command refuses, because a table showing nothing is not a state any caller means to reach. But a
control the user can press that throws is a defect rather than a refusal, so the chooser marks the
last visible checkbox `disabled` and the refusal is never reachable through the UI. Spec 09's error
model asked for the throw; NFR-49 asked for the control; both are satisfied by putting them at
different layers.

**8. The chooser is native checkboxes and a real `<label for>`.** No dropdown, because a dropdown
means the Bootstrap JavaScript peer and `bsTable` has never needed one. Native checkboxes are
keyboard-operable by construction, and a `<label for>` makes the visible text *be* the accessible
name, so the two cannot drift. The group carries `role="group"` and an injectable `aria-label`
rather than a `<fieldset>`, whose legend is the only name browsers agree on and is a layout this
control does not get to impose. It lives on the existing `controls` bag (`controls.columns`), where
the search box and the pager already live.

**9. The announcement composes F110 rather than re-implementing it, and that was measured.** A
checkbox announces its own state and says nothing about the table that changed underneath it, which
is what NFR-49 asks for. `liveRegion` costs **285 B on `/bootstrap` and 280 B on the `bsTable`
row**; an inline `role="status"` element would have cost perhaps 80 B and duplicated a primitive
this library ships. The 200 B buys the visually-hidden clip pattern, the `aria-atomic` behaviour and
the repeat-message handling — all of them things a hand-rolled region gets wrong.

**10. The URL half is `hidden`, and it comes from the renderer.** `TableUrlState` gains
`hidden: string[]`, serialized as repeated `hidden=` parameters, sorted and de-duplicated — sorted
because ADR-0063's binding compares serializations to decide whether to push a history entry, and an
unstable encoding would push one for a change that changed nothing. The **hidden** set rather than
the visible one, so a table showing everything still has a clean URL. It is **not** part of
`TableView`: a pipeline has no visibility, so `tableStateToParams(pipeline.view())` correctly
carries none, and the value reaches the state from `bsTable.getHiddenColumns()`.

**11. `bindTableHistory` takes a second object, not a second pipeline field.** `{ visibility: table }`
— a `bsTable` instance already satisfies the shape. It has to be separate for the same reason the
whole item is: visibility is not the pipeline's, so a toggle emits no `'change'` for the binding to
ride. Hence the subscription. A URL naming a column the table does not have is refused one key at a
time and reported through `onIgnored` with a new `kind: 'hidden'`, then normalized out of the URL —
the treatment a stale `filter.` parameter has always had.

**12. ADR-0041's `/bootstrap` clause is amended again, 25.5 kB → 26.75 kB, and the row pinned at
26.62 kB.** Two amendments in two items is worth naming rather than burying. The rule is
ADR-0084's, applied unchanged: the clause moves by the minimum that restores the margin the row
actually had (498 B at 24 902 B). What the clause was sized to prevent is the **catalogue
sprawling** — more components. Both amendments paid for a capability added to components that
already exist, and the per-function rows are what show that: `bsTable` grew and no other builder
moved by a byte.

## Alternatives Considered

| Option | Why not |
|---|---|
| **`display: none` on the hidden cells** | Leaves the cell in the accessibility tree's column count, in `querySelectorAll`, and in `row.cells.length`. A table that reports four columns and shows three is a table that lies to the two consumers most likely to be automated. |
| **A `visibleColumns` array the caller swaps** | The status quo, and the reason for the item: replacing the array replaces the instance, which loses sort, filters, search, widths and order — every state F92/F93 exists to preserve. |
| **Tell the pipeline about visibility** | Then "hiding the sort column does not clear the sort" becomes a rule someone has to remember in four commands. Not telling it makes the requirement unfalsifiable. |
| **Rebuild the header on every toggle** | Destroys the `<th>` nodes carrying the F99 grip and the F100 handle, and the maps that point at them. Detaching and re-appending keeps node identity, which is what those two features already promise. |
| **A Bootstrap dropdown for the chooser** | Requires the JavaScript peer, which `bsTable` has never needed (ADR-0041). A `role="group"` of native checkboxes is operable, announced and peer-free. |
| **An inline `role="status"` instead of F110** | Saves ~200 B and duplicates a primitive this library ships, including the parts a hand-rolled region gets wrong (the clip pattern, `aria-atomic`, the repeated-message case). Measured both ways before choosing. |
| **`hideable: false` refuses the caller too** | Would break the rule `resizable`/`movable` already set, where the exemption is from the *user*. A caller restoring a saved layout is not a user clicking a checkbox. |
| **Let the chooser hide the last column and report the error** | A control that throws when pressed is a defect. The command still refuses — the control simply never reaches it. |
| **Serialize the *visible* set in the URL** | Every table would carry every column name in its URL forever, and adding a column to the code would silently hide it for everyone holding an old link. The hidden set is the deviation, and the default is silence. |
| **Put visibility on the pipeline so `bindTableHistory` needs no second object** | Puts a rendering fact into the derivation to save one option, and re-opens the sort question decision 1 closes. |

## Consequences

- **`/bootstrap` reaches 26 120 B (+1 218 B)** under an amended 26.75 kB clause, and
  **`single: bsTable` 14 775 B (+1 363 B)**, re-pinned at 15.6 kB — the 788 B margin the row had.
  285 B / 280 B of that is the F110 region. No other builder row moved.
- **`/table` reaches 6 929 B (+68 B)** and **`/dom` 8 078 B (+200 B)**; the F92 pair costs +69 B and
  +30 B, and `bindTableHistory` +213 B — a whole second half of the restore. The `/dom` row is
  re-pinned from 8.3 kB to 8.5 kB at its own former margin rather than left at 222 B of headroom,
  which is the ADR-0082 habit.
- **F87: no new chunk and no new request on any route.** `/bootstrap` served grows +1 653 B against
  1 218 B bundled — the gap is the live region, in a file that route already fetches whole — and
  `/ui` grows **91 B for a feature it does not have**, because it composes `/bootstrap` internals.
  The artifact reaches 52 163 B.
- **NFR-22 re-derives to 73 kB** (72 032 B), up from 71 kB in 23.1 — the second re-derivation in two
  items, and neither for a new entry.
- **The surface is additive (NFR-45).** 141 exports, unchanged. Two optional column properties, one
  optional `controls` key, one optional `bindTableHistory` option, five instance members, and one
  optional field on `TableUrlState`. Nothing existing changes meaning — except that
  `tableStateFromParams` now returns a sixth field, `hidden`, which is additive to the returned
  object and was the only test in the repository that had to change.
- **`getColumnWidths()` omits a column hidden before it ever took a width**, because `0` is not a
  width and `setColumnWidths` rejects it — the round-trip the function exists for would have thrown.
- **The chooser is English by default and injectable throughout** (`label`, `itemLabel`,
  `announce`), the NFR-21 rule every named control on this entry follows.

## References

- `src/main/javascript/it/d4np/utils/bootstrap-table.js` (the display model, the commands, the
  chooser), `src/main/javascript/it/d4np/utils/table-url.js` (the `hidden` parameter),
  `src/main/javascript/it/d4np/utils/dom-history.js` (the `visibility` adapter)
- `src/test/javascript/it/d4np/utils/bootstrap-table-visibility.test.js`,
  `src/test/javascript/it/d4np/utils/table-url.test.js`,
  `src/test/javascript/it/d4np/utils/bind-table-history.test.js`
- [spec 09](../specs/09_spec_hardening.md) §2 F128-F129, §3 NFR-45/NFR-47/NFR-49, §6
