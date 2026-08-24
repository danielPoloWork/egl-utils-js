# 2026-08-24 — The cell that was never there (roadmap 19.9)

## What got done

- **[BUG-0005](../../bugs/2026/08/BUG-0005-filter-row-misaligned-under-a-selection-column.md)
  fixed**: the F67 filter row prepends an empty `<td>` when the table has an F95 selection
  column, so every filter input sits under the column it filters again.
- Regression tests where the two features meet, plus one that pins the F100 permutation
  against exactly the assumption this fix changes.
- Budget rows re-pinned. **M19 is complete.**

## The decision the bug report left open

The report offered two shapes and said the choice was not obvious: an empty `<td>`, or a
`<th scope="row">` carrying the selection column's accessible name.

It is a `<td>`, and the reason was already written down three lines above the loop that
needed fixing:

> A cell, not a header: these are controls, and a `<th>` here would attach itself to every
> data cell beneath as a header a screen reader announces.

That reasoning does not stop applying because a cell happens to be empty. And a row header
would make a second claim nobody wants: that the filter row is *about* the selection column.
It is not — it is a row of controls, not a record. The spacer carries the selection column's
own `class`, which is usually a width and is the only thing keeping a checkbox column narrow
when F99's `<colgroup>` is not in play.

## What the fix did not have to touch

ADR-0069 computed each row's leading offset from its own cell count
(`kids.length - from.length`) rather than taking a fixed one, precisely so that the
permutation would keep working after this fix landed. It did: **the reorder path needed no
change at all.** The regression test pins that — reorder a table with `selection` *and*
`filterRow`, assert each filter is still under its column. Replace the computed offset with a
constant and it fails.

That is the useful shape of the note ADR-0069 left: not "this will probably be fine" but a
specific test the fixing item could write to prove it.

The other half of the report's brief was to check whether any other opt-in pair mirrors the
columns without the prologue. All six per-column loops in `bootstrap-table.js` were read: the
header row, the body rows and the F99 `<colgroup>` and grip loops all account for the
selection column, the empty-state row spans it through its `colspan`, and the filter row was
the only one that did not.

## A correction to the ledger

The report as filed yesterday said `affected-versions: v1.1.0`. That was wrong. The selection
column arrived in 19.3 and the whole of M19 is still in `[Unreleased]` — v1.1.0 shipped on
2026-08-21, before it. **No released version was ever affected**: the defect existed for four
days inside one unreleased wave. Corrected in the frontmatter and in the body, because a bug
ledger that overstates blast radius is as misleading as one that understates it.

## 92 bytes, and why that is worth a paragraph

The fix adds one `<td>` and a guard. It cost **92 B served** — and the artifact had 1 102 B
of NFR-22's 40 kB left after 19.7, so a one-cell defect fix spent 8% of the remaining
headroom. The budget row also had to move: the previous pin left the gate 10 B of room, which
is a gate that fails on the next comment, so it is now 39.5 kB — still deliberately below the
spec ceiling, so a breach is caught before the spec is violated.

ADR-0069 warned that M20 inherits a `/bootstrap` entry clause with about 600 B left. This
item is the concrete form of that warning: at this distance from a ceiling, even fixing a
one-cell bug is a measurable event.

## Verified

2820 tests at 100% lines, `bootstrap-table.js` at 100% branches. `check:package`, F87
transfer budgets, api-floor, `docs:api`, redos, lint, format and the consistency lint green.
Surface unchanged at **123 exports** — this changes markup, not API.

One unrelated flake on the first coverage run: `sanitize.property.test.js` timed out at 20 s
under machine load and passed on the re-run. It shares a worker pool with the whole suite and
this change touches only `bootstrap-table.js`; recorded rather than quietly re-run.

## How the next session resumes

1. Wait for this PR to merge. **M19 is then complete** — F88–F100 delivered, one defect found
   and fixed inside the wave — and cutting **v1.2.0** is the owner's call.
2. After that, M20. Read ADR-0069's budget section first: the `/bootstrap` entry clause has
   ~594 B left and M20 puts dialogs, toasts and a theme manager on that entry, so the first
   item that grows it owes a decision with arithmetic behind it.
