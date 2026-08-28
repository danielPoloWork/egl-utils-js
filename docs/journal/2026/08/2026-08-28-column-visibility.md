# 2026-08-28 — A column that can hide, and say so (23.2)

## What got done

- **`visible` and `hideable` on `BsTableColumn`** (spec 09 F128), beside the `resizable` and
  `movable` that were already there.
- **Five instance members**: `hideColumn`, `showColumn`, `toggleColumn`, `getHiddenColumns()` and
  `onColumnVisibility()` — three commands, a query and a subscription, split the way ADR-0049 says.
- **`controls: { columns: true }`** (F129): a group of native checkboxes in the header band,
  announced through the F110 live region.
- **The URL half**: a `hidden` set in the F92 pair, and a `visibility` adapter on `bindTableHistory`
  that a `bsTable` instance already satisfies.
- **[ADR-0085](../../adr/0085-visibility-is-rendering-and-the-clause-moved-again.md)**, and
  **ADR-0041's `/bootstrap` clause amended a second time in two items** — 25.5 kB → 26.75 kB, by
  ADR-0084's own rule.
- 30 new example tests; 3 452 unit tests green; every size figure, transfer route and congruence
  gate re-pinned and passing.

## The requirement that designed the feature

F128's headline is one sentence: *hiding the column a table is sorted by does not clear the sort.*

Every design where the pipeline knows about visibility has to then remember not to act on that
knowledge — in `setSort`, in `toggleSort`, in the restore path, and in whatever comes next. A design
where the pipeline is **never told** cannot get it wrong. So visibility lives entirely in the
renderer: a `Set` of hidden keys in `bsTable`, and a filter over what it draws.

The rest of F128 falls out of the same split rather than being implemented:

| What survives a hide | Because it lives in |
|---|---|
| sort, filters, search, page | the F42 pipeline, which is not consulted |
| the F99 width | `columnWidths`, keyed by column |
| the F100 position | `order`, still a full permutation |

Three of the item's five acceptance criteria are things no code does.

## `display: none` was the wrong answer

It is what every grid reaches for, and it fails the one question that matters: **what does the table
say it has?** A cell styled away is still in `row.cells.length`, still in `querySelectorAll('td')`,
still in the accessibility tree's column count. A table that reports four columns and shows three
lies to exactly the two consumers most likely to be automated.

So the cell is **removed** — and *kept*. The `<th>` carries the F99 resize grip and the F100 move
handle; rebuilding it would break the maps that point at those, and the node identity F99 and F100
both promise. Detaching and re-appending keeps everything.

## One registry, and F100 went through it

Three nodes mirror the columns one-for-one: the header row, the `<colgroup>`, the filter row. They
differ only in what *precedes* the column cells — an F95 selection cell, a spacer, nothing — which
is precisely the distinction BUG-0005 was about. Rather than teach a new function to tell them
apart, each registers the cell every column owns, and one pass does the work:

```js
for (const [key, cell] of cells) if (hidden.has(key)) cell.remove();
parent.append(...shown.map((key) => cells.get(key)));
```

`append` of a node already in the tree **moves** it, so that single pass re-inserts what came back
*and* re-sorts what stayed. F100's `applyOrder` now calls it instead of permuting the head itself,
which deleted more code than this item added there. The body still permutes by index, because body
rows are rebuilt per render and were never registered.

## Three places the hidden column had to be stepped over

Not obvious until each one was written, and each is a defect avoided rather than a feature:

- **Arrow-key reorder** moved a column into the hidden neighbour's slot, so one press appeared to do
  nothing. `moveBy` now walks until it finds a visible slot.
- **The drag thresholds** measured a detached header at `0`, putting a zero between two real
  neighbours and making the next swap nonsense. Measured over the visible order now.
- **`pinLayout`** measured a detached `<th>` at `0` and clamped it to the 48 px floor, so a column
  hidden at pin time came back 48 px wide. It is skipped there and measured on re-insertion instead.

## The refusal, at two layers

Spec 09's error model says hiding the last hideable column is a `TypeError`. NFR-49 says the chooser
refuses it. Those are not the same statement, and putting both at the same layer would have been
wrong either way: a control the user can press that throws is a defect, and a command that silently
declines is a lie.

So the **command throws**, and the chooser marks the last visible checkbox `disabled` — the refusal
exists, and the UI never reaches it.

## The live region, measured before it was chosen

A checkbox announces its own state. It says nothing about the table that changed underneath it,
which is what NFR-49 asks for. Two ways to answer:

| | cost on `/bootstrap` | |
|---|---:|---|
| inline `role="status"` element | ~80 B | duplicates a primitive this library ships |
| compose F110 `liveRegion` | **285 B** | the clip pattern, `aria-atomic`, the repeated-message case |

200 B for the three things a hand-rolled region gets wrong. Composed.

## The clause moved again, and that is worth saying out loud

ADR-0084 amended `/bootstrap`'s 25 kB entry clause to 25.5 kB last item. This one amends it to
26.75 kB.

| | measured | clause |
|---|---:|---|
| before 23.1 | 24 632 B | 25 kB |
| after 23.1 | 24 902 B | 25.5 kB |
| after 23.2 | **26 120 B** | **26.75 kB** |

Two amendments in two items is the kind of thing a record buries and a journal should not. The rule
is ADR-0084's, applied unchanged — the clause moves by the minimum that restores the margin the row
actually had — and the defence is that the clause was sized to prevent the **catalogue sprawling**.
Both amendments paid for a capability on components that already exist. The per-function rows are
the evidence: `bsTable` grew 1 363 B and **no other builder row moved by a byte**.

The other figures: `/table` +68 B, `/dom` +200 B, `bindTableHistory` +213 B (a whole second half of
the restore), the artifact 52 163 B, and NFR-22 re-derived to 73 kB — the second re-derivation in
two items, neither of them for a new entry. **No new chunk and no new request on any F87 route**,
which is the first time in three items that has been true; `/ui` still paid 91 B for a feature it
does not have, because it composes `/bootstrap` internals.

## What is left

23.3 — the grid keyboard navigation (F130–F131) — is the last item in the wave, and the one whose
budget conversation this one has made harder.
