# 2026-08-24 — Column resize (roadmap 19.6)

## What got done

- **`bsTable({ resize })`** (spec 06 F99): a resize grip on every header, pointer- and
  keyboard-operable, with `getColumnWidths()` / `setColumnWidths()` on the instance and
  `width` / `minWidth` / `resizable` on a column.
- **[ADR-0068](../../adr/0068-a-colgroup-a-separator-and-a-ceiling-in-sight.md)** records the
  nine decisions, the seven api-floor entries, and the budget arithmetic this item owed.
- 44 jsdom cases in a new `bootstrap-table-resize.test.js`, 7 Playwright cases in
  `smoke.spec.js`, budgets re-pinned in `.size-limit.json` and `tools/transfer-budgets.js`.

## The requirement decided the implementation before the design did

F99 has four clauses, and the fourth — **no row re-render** — settles the shape before the
others are considered. Put the width on a `<colgroup>` and a resize writes *one style property
on one node that is not a row*: the ten thousand `<td>`s below are never touched, never
re-created, never read. The alternative every string-templating table reaches for — a width per
`<th>`, or a re-render — is O(rows) per frame of a drag and makes the fourth clause something a
maintainer has to keep remembering rather than something the design cannot violate.

The test asserts it by **node identity** rather than by counting: the same `<tr>` and `<td>`
objects before and after a drag, a programmatic restore and a keyboard step. A re-render would
produce equal-looking rows and pass a count.

## Two decisions that only a real engine could settle

**The lazy pin.** `table-layout: fixed` is what makes a declared width authoritative, and it is
also a *different-looking table*: under it a column with no declared width takes an equal share
instead of being sized to its content. Applying it when `resize` is enabled would mean that
merely switching a capability on re-laid-out a table nobody had touched. So the browser lays the
table out normally and the **first** change freezes every column at the width it already had.
The browser test is what makes this checkable at all — the three fixture columns hold very
different amounts of text, so equal widths would prove `fixed` had been applied too early, and
that is a claim jsdom (which has no layout) cannot even express.

**The enforced width is not the painted width.** Three browser cases failed on the first run
with numbers 7–11 px off, and the cause was not the test. Bootstrap's `.table` is `width: 100%`,
`table-layout: fixed` scales the declared widths to fill it, so a column pinned to its 60 px
floor *measures* 67 px on a wide container. Reporting the painted figure would mean
`setColumnWidths(getColumnWidths())` drifted a few pixels on every round-trip, and that a layout
saved on a wide window restored wrong on a narrow one. So `getColumnWidths()` reports what the
table **enforces**; declared widths are resolution-independent, which is exactly what persisting
a layout needs. The fix also made the code *simpler* — the stored value wins, and a measurement
is consulted only before the first change, when nothing is stored yet.

That is the one worth carrying forward: a failing browser assertion was the first thing that
distinguished two numbers the design had been treating as one.

## One widget, not two

A resize grip reachable only by dragging is inaccessible, and F99 says so — but the interesting
part is *how* the keyboard path is added. `role="separator"` with a tab stop and
`aria-valuenow`/`aria-valuemin` is the platform's own window-splitter pattern, so the **same
node** takes the drag and the arrow keys: one control carrying one state, instead of a hotspot
beside a hidden button that has to be kept in step with it. The accessibility requirement made
the design smaller rather than larger, which is not the usual direction.

Pointer capture is the other half. From `pointerdown` the engine retargets every move and the
release to the grip, so all five listeners live on a node this library built — where the textbook
shape (listen on `document` for the duration of the drag) reaches into someone else's node in
someone else's realm, which is the trap BUG-0003 was. Verified by dragging 600 px past the
table's edge in a real engine.

## The ceiling arrived, and this item owed the decision

ADR-0067 corrected a projection that had been restated three times — that ~1.5 kB an item would
push the artifact past NFR-22's 40 kB — because 19.5 cost 256 B. It also said the lesson was to
**check the projection at the next data point** rather than restate it either way. This is that
data point, and it went back the other way:

| Row | 19.5 | 19.6 | Δ |
|---|---:|---:|---:|
| `{bsTable}` | 11 436 B | 12 591 B | +1 155 B |
| `/bootstrap` full import | 22 391 B | 23 505 B | +1 114 B |
| artifact (served, NFR-22) | 36 911 B | 38 076 B | +1 165 B |

The artifact is now at **95% of the 40 kB ceiling**. The established re-pin practice — measured
+ ≤ 7% — would put the budget at 40 741 B, *above the ceiling itself*: the practice assumes
headroom above the measurement and here the ceiling binds first. So the row is pinned at 39 000 B
and the practice is recorded as inapplicable rather than quietly stretched, and the same logic
caps the `/bootstrap` row below ADR-0041's 25 kB clause.

**19.7 has 1 924 B, and this item cost 1 165 B for a comparable amount of feature.** Column
reorder needs its own affordance, its own keyboard path and an order model, so it may not fit —
and that is written down now rather than discovered mid-PR. The answer, if it does not, is a
decision with arithmetic behind it (amend NFR-22, or move reorder off the default artifact),
never a silent breach.

## Verified

2769 tests green (44 new), 100% lines; `bootstrap-table.js` at 100% branches. Chromium and
WebKit pass all 7 browser cases; Firefox will not launch on this machine for any test, so CI
covers it — the same limitation 19.5 recorded. `check:package`, F87 transfer budgets, api-floor
(48 inventoried APIs), `docs:api`, redos, lint, format and the consistency lint all green.
Surface unchanged at **123 exports**: a whole capability delivered as an option and two methods
that exist only when it is on, which is what NFR-25 looks like in practice.

## How the next session resumes

1. Wait for this PR to merge (one item per PR).
2. **19.7 — column reorder**, the last item of M19. Read ADR-0068's budget section *first*: the
   artifact ceiling is a real constraint for that item in a way it has not been for any previous
   one, and knowing the number before writing the feature is the difference between a decision
   and a discovery.
3. The F99 grip, its `role="separator"` treatment and the lazy pin are the obvious things for a
   reorder affordance to reuse — both live in `bootstrap-table.js` beside each other.
