# ADR-0068: A colgroup, a separator, and a ceiling now in sight

- **Status:** Accepted
- **Date:** 2026-08-24
- **Deciders:** Daniel Polo
- **Related:** [spec 06 §2 F99, §3 NFR-25/NFR-28/NFR-30](../specs/06_spec_table_data.md),
  ROADMAP 19.6, [ADR-0067](0067-five-declarations-and-no-scroll-listener.md) (the F98 sticky
  header this shares a header cell with, and the budget projection it corrected),
  [ADR-0040](0040-one-grammar-one-pager-and-a-ceiling-below-its-own-parts.md) (the F66/F67
  composition and the `bsTable` budget row), [ADR-0041](0041-a-peer-looked-up-not-imported.md)
  (the 25 kB `/bootstrap` entry clause), [ADR-0045](0045-a-controller-from-the-node-s-own-realm.md)
  (why a listener on someone else's node is a trap), [ADR-0047](0047-the-unknown-option-key-contract.md)
  (the option-key contract the new bag and the three new column properties inherit),
  [ADR-0059](0059-the-artifact-and-what-a-page-downloads.md) / [ADR-0061](0061-two-honest-measurements.md)
  (the NFR-22 artifact accounting this item pushes to 95% of its ceiling)

## Context

F99 asks for pointer-driven column resize **with a keyboard-operable alternative**, widths
that a caller can read and restore, minimum widths enforced, and **no row re-render**. Four
clauses, and the fourth is the one that decides the implementation before any of the others
are considered.

Three forces set this item.

**"No row re-render" is either structural or it is a promise.** The shape most component
libraries ship writes a width onto every `<th>`, or re-renders the table body, on each frame
of a drag. Both are O(rows) per frame, both are why those tables stutter at ten thousand
rows, and both make the fourth clause something a maintainer has to keep remembering. A
table that cannot re-render rows during a resize *by construction* never has to remember.

**A drag-only affordance is the trade this library has refused since spec 04.** NFR-21 has
made accessibility a build-time failure — an icon-only `bsButton` with no accessible name
throws rather than warns. A resize grip reachable only by holding a mouse button is the same
class of defect, and F99 says so explicitly. The question is not *whether* the keyboard path
exists but whether it is a second control bolted beside the first, with its own state to
keep in step.

**The budget ceiling stopped being theoretical.** 19.3 and 19.4 both projected that ~1.5 kB
an item would push the browser artifact past NFR-22's 40 kB before the wave ended; 19.5 cost
256 B and falsified that projection in the good direction, and ADR-0067 recorded the lesson
that a restated projection deserves a check against the next data point. This is the next
data point, and it went the other way.

## Decision

**1. Widths live on a `<colgroup>`, one `<col>` per column.** A width written there governs
its whole column, so a resize sets **one style property on one node that is not a row** — the
10 000 `<td>`s below are never touched, never re-created, never read. That is what makes
F99's fourth clause a structural fact rather than a discipline, and the test asserts it by
**node identity**: the same `<tr>` and `<td>` objects before and after a drag, a programmatic
restore and a keyboard step. The selection column (F95) gets a `<col>` too — without one,
`table-layout: fixed` hands the checkbox column an equal share of the table — but no grip,
because a checkbox has one sensible width.

**2. The layout is pinned lazily, at the first change, not at build time.**
`table-layout: fixed` is what makes a declared width authoritative, and it is also a
*different-looking table*: under it a column with no declared width takes an equal share
instead of being sized to its content. Applying it when `resize` is enabled would mean that
merely switching a capability on re-laid-out a table nobody had touched. So the browser lays
the table out normally, and the first resize — pointer or keyboard — freezes every column at
the width it already had and only then switches to `fixed`. One measurement pass per column,
once per instance; never per frame, which is the cost F98 refused and this inherits.

**3. The grip is one widget, not a hotspot beside a button.** It is a `<span>` with
`role="separator"`, `aria-orientation="vertical"`, `tabindex="0"` and `aria-valuemin` /
`aria-valuenow` — the platform's own window-splitter pattern. The same node takes the
pointer drag and the arrow keys, so there is **one control carrying one state** instead of
two that can disagree. Shift multiplies the step by four, which is the convention every
slider on the platform follows and the difference between a keyboard path that works and one
that exists on paper: 400 px in 16 px steps is 25 presses.

**4. Pointer capture, so every listener stays on a node this library built.** From
`pointerdown` the engine retargets each move and the release to the captured grip, so all
five listeners live on the header row. The shape this replaces — listen on `document` for
the duration of the drag — reaches into someone else's node in someone else's realm, which
is exactly the trap [BUG-0003](../bugs/2026/08/BUG-0003-cross-realm-abort-signal-in-composites.md)
was. Both capture calls are made **outright, not optionally**: pointer capture is Safari 13
against a 16.4 floor, so `setPointerCapture?.()` would be a branch no supported runtime takes
— the same reasoning ADR-0050 used to delete the `AbortSignal.timeout` fallback. jsdom
implements neither method, and the suite supplies them, which is the accommodation it already
makes for pointer events themselves. `pointercancel` is handled with the same handler as the
release, and deliberately: an engine cancels a pointer when the system takes the gesture over,
and a resize that only ends on `pointerup` is left following a pointer nobody is holding.

**5. A drag is measured from its own origin, never from the previous move.** An incremental
delta accumulates every clamp at the minimum, so dragging left past the floor and back leaves
the column narrower than it started. Both suites assert the round trip.

**6. The width a caller reads is the width this table *enforces*, not the pixel the engine
painted.** These differ, and the browser suite proves it: Bootstrap's `.table` is
`width: 100%`, `table-layout: fixed` scales the declared widths to fill it, and a column
pinned to its 60 px floor measures **67 px** on a wide container. Reporting the painted
figure would make `setColumnWidths(getColumnWidths())` drift on every round-trip and would
make a layout saved on a wide window restore wrong on a narrow one. Declared widths are
resolution-independent, which is what persisting a layout actually needs. Columns with
nothing declared yet — before the first change — are measured, because an empty object is
not an answer a caller can save.

**7. `resizable: false` withholds the affordance, not the width.** An exempt column has no
grip and no user-facing resize; `setColumnWidths` still sets it. The caller exempted their
user, not themselves, and a saved layout that could not restore one of its own columns would
be a strange thing to hand back.

**8. `onResize` fires once per completed gesture**, not per pointer move, and not for a
programmatic restore. It exists so a caller can persist a layout; persisting on every frame
of a drag is a defect, and telling a caller about widths they just supplied is noise.

**9. The budget rows are re-pinned, and the artifact ceiling is now the binding constraint.**
Measured, with the F98 figures beside them:

| Row | 19.5 | 19.6 | Δ | new limit |
|---|---:|---:|---:|---:|
| `{bsTable}` | 11 436 B | **12 591 B** | +1 155 B | 13.4 kB |
| `/bootstrap` full import | 22 391 B | **23 505 B** | +1 114 B | 24.5 kB |
| artifact (served, NFR-22) | 36 911 B | **38 076 B** | +1 165 B | 39 000 B |

The artifact row is the decision this item owed. The established practice — re-pin to
**measured + ≤ 7%** (ADR-0015) — would put it at 40 741 B, **above NFR-22's 40 kB ceiling**.
The practice assumes there is headroom above the measurement; here the ceiling binds first,
so the row is pinned at 39 000 B (measured + 1.2%) and the practice is recorded as
inapplicable rather than quietly stretched. The same reasoning caps the `/bootstrap` row
below ADR-0041's 25 kB entry clause.

**What that leaves is worth stating plainly rather than discovering in the next PR: 19.7
(column reorder) has 1 924 B of artifact budget, and this item cost 1 165 B.** Reorder is
not obviously cheaper than resize — it needs its own affordance, its own keyboard path and
an order model. So 19.7 begins with a real possibility that it does not fit, and the answer
then is a decision — amend NFR-22 with the arithmetic that justifies it, or move reorder off
the default artifact — not a silent breach. ADR-0067's lesson holds in both directions: the
projection was wrong at 19.5 and it is right now, which is why it is being checked at each
data point rather than restated.

## Alternatives Considered

- **A width on every `<th>`, or a re-render, per drag frame.** The common shape. Rejected on
  F99's own fourth clause: O(rows) per frame, and it makes "no row re-render" something a
  maintainer must keep true rather than something the design cannot violate.
- **`table-layout: fixed` from build time.** Simpler — no pin, no measurement, no lazy state.
  Rejected because enabling a capability would change the appearance of a table nobody had
  touched: every column with no declared width jumps to an equal share. The lazy pin costs
  one measurement pass per instance and buys "resize looks like nothing until you resize".
- **Measuring every column into `<col>` widths at build time instead.** Removes the surprise
  above without the lazy state. Rejected: at build time the table is not in the document yet,
  so every measurement is `0`. Measuring after insertion would mean a forced layout on every
  `bsTable` call, including the overwhelming majority that never resize anything.
- **A separate keyboard control beside the drag hotspot** (a focusable button, or arrow keys
  on the `<th>`). Rejected: two controls with one underlying value is two things to keep in
  step, and `role="separator"` with `aria-value*` is a pattern assistive technology already
  understands — the platform had already answered this.
- **Listening on `document` for the duration of the drag.** The textbook approach, and it
  survives the pointer leaving the table without pointer capture. Rejected for ADR-0045's
  reason: it attaches to a node from a realm this library does not own, and it leaks if any
  teardown path is missed. Pointer capture gets the same behaviour with every listener on
  our own node — verified in a real engine by dragging 600 px past the table's edge.
- **Reporting painted widths from `getColumnWidths()`.** More intuitive — the number matches
  a ruler on screen. Rejected on measurement: it does not round-trip through
  `setColumnWidths`, and it makes a saved layout window-size-dependent. See decision 6.
- **Splitting resize into its own entry to protect the artifact budget.** Rejected *for this
  item*: `bsTable` is one facade and a second import path for one of its options would be a
  worse API than a re-pinned row. Left explicitly on the table for 19.7, which may not have
  that luxury.

## Consequences

- `bsTable({ resize })` and three new column properties (`width`, `minWidth`, `resizable`),
  plus `getColumnWidths()` / `setColumnWidths()` on the instance when resize is on. All
  additive: **the public surface stays at 123 exports** (NFR-25), and the new bags reject
  unknown keys, so the addition is observable and the omission is safe (ADR-0047).
- The api-floor inventory takes **seven** new entries (NFR-28): four pointer events, both
  pointer-capture methods, and `getBoundingClientRect`. Safari 13 for the whole set — well
  inside the 16.4 floor — and all `context`-guarded, since none exists in Node and
  `/bootstrap` is an entry a server render legitimately loads.
- F98 and F99 on the same table is the combination a caller reaches for first, and it has
  exactly one interaction: a grip is positioned against its header cell, so that cell must be
  a containing block — which `position: sticky` already is. The resize path therefore writes
  `position: relative` only when the header is *not* sticky, because overwriting it would
  silently unstick the header.
- The grip lives inside a sortable header, and F51's sort delegation sits on `thead`, one
  level above the row these listeners are on. A click originating on a grip is stopped there,
  or every finished drag would also re-sort the column it just resized. Asserted in both
  suites.
- The test split follows what each environment can honestly establish. jsdom has no layout,
  so it proves the contract — which nodes carry the widths, that no row is touched, that the
  floor holds, that the keyboard reaches the same state, that a saved layout round-trips, and
  that `touch-action` cannot be read back because jsdom's CSS parser drops the property.
  Playwright proves the rest on real engines: that a drag moves a boundary, that the layout
  is untouched until it does, that the floor survives the pointer leaving the table, that the
  grip is focusable and arrow-operable, and that the enforced width and the painted width
  differ — which is the evidence behind decision 6.

## References

- Spec 06 §2 F99, §3 NFR-25 (additive-only), NFR-28 (explicit floor amendments), NFR-30.
- ARIA Authoring Practices — the window-splitter pattern (`role="separator"` with a tab stop
  and `aria-valuenow`/`aria-valuemin`).
- Pointer Events Level 2 — implicit and explicit pointer capture, and `pointercancel`.
