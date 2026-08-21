# 2026-08-21 — Five declarations and no scroll listener (19.5)

## What got done

- **`bsTable({sticky})`** (F98): `position: sticky` per header cell, an optional resting offset
  and stacking order, and `sticky.maxHeight` to bound the F71 wrapper.
- **14 jsdom tests** for what is emitted and what is refused, **3 Playwright cases** for the part
  that needs layout.
- **ADR-0067**, three size rows and two F87 routes re-pinned, README section, changeset.
- **No api-floor amendment** — the first M19 item to need none.

## The requirement constrained the mechanism, and that was the whole item

F98 does not ask for a sticky header and leave the how open: it says *within a scroll container
the caller owns, **without measuring layout in JavaScript per frame***. That rules out the
version most component libraries ship — measure the header, listen to `scroll`, reposition every
frame — before anyone writes it. `position: sticky` does the job in the compositor.

So the decisions left were not about the mechanism:

**Which node.** `thead`, `tr` and `th` are all plausible; engines disagreed about the first two
for years, and a cell is the one place every engine has always honoured it. Per-cell has a second
payoff I did not plan and will take: the **F95 selection column sticks along with the rest for
free**, because it is simply another `th` in that row. No coordination between the two features
at all.

**What breaks visually when it works.** Two things nobody expects, and both are the difference
between a working feature and one that looks broken. A sticky cell loses its bottom rule, because
`border-collapse: collapse` — Bootstrap's default — draws it on a shared edge that does not
travel with the cell; redrawn as `inset 0 -1px 0 var(--bs-border-color)`, which lives inside the
cell and does travel. And a table cell is transparent by default, so the rows scroll *through*
the header; given a `var(--bs-table-bg, …)` background. Both read Bootstrap's own custom
properties, so a dark theme keeps its colours rather than being overridden by ours.

**Where the scroll container comes from.** F98 says it is the caller's, which is right, and also
leaves the most common mistake unguarded: nobody bounded a height, there is no scrolling
ancestor, and the header simply does not stick — silently. So `sticky.maxHeight` bounds the F71
wrapper and **refuses to be passed without `responsive`**: there would be no node of ours to
bound, and a `TypeError` naming both options is one line to read and one to fix.

One detail worth the words it took: the bounded node is the responsive wrapper, captured as its
own reference, **never `element`**. With `controls`, `element` is the outer band wrapper, and
bounding that would scroll the filter row and the pager out of view along with the rows — the
opposite of what a sticky header is for.

## The projection I had restated three times was wrong

19.3 and 19.4 both flagged that ~1500 bytes an item would push the single-file artifact past
NFR-22's 40 kB authoring ceiling before the wave ended, and I repeated the arithmetic in two
ADRs, two journals and a size row.

**19.5 cost 256 B.** 31444 B at M18 → 33982 (19.2) → 35671 (19.3) → 36541 (19.4) → **36797
(19.5)**: 92% of the ceiling with ~3.2 kB left for two items. A CSS-only feature falsified the
projection in the good direction, and the row now says so.

The lesson is not "the ceiling is fine" — it may still be reached by 19.6 or 19.7, and the
decision still belongs to whichever item gets there. It is that a projection restated three times
had earned a check against the next data point rather than another restatement.

## Measured

- **Surface unchanged: 123 exports before and after.** A whole capability delivered as an option
  on an existing export, which is what NFR-25 looks like when it costs nothing — worth noting
  because the previous three items each added at least one export.
- `{bsTable}` 11064 → **11436 B** (+372). That figure is the point rather than a footnote: the
  F95 selection column cost 2222 B for a comparable amount of user-visible feature, because it
  needed a model, listeners and reflection. This needed five declarations, so it cost a sixth as
  much. The cheapest implementation was the one the requirement demanded.
- `/bootstrap` full import 22032 → **22391 B**, still 2.6 kB inside ADR-0041's 25 kB clause.
- No inventory change: `style.setProperty` on a node the library built is not a capability
  question, so the api-floor gate stays at 41 entries.

## What the tests are split across, and why

jsdom has no layout, so asserting "the header stays put" there would assert nothing. It verifies
the half it can: which declarations land on which nodes, that nothing lands on `thead` or `tr`,
that the caption is left alone, and that the silent-no-op configuration is refused.

Playwright does the rest on three engines: scroll a real container and assert the header's top
edge is still the container's while row one has moved above it; read the **computed** background
from the engine with Bootstrap's variables resolved (not the declaration we wrote) and assert it
is not transparent; and click a sort header twice through a positioned cell, asserting `aria-sort`
both ways.

The browser fixture needed `controls` to test sorting at all, because the sort-header delegation
is F51's and only exists when controls are wired. Rather than leave that as a workaround, it
became a feature of the fixture: with controls present the scroll container sits *inside* an outer
band wrapper, so the same test proves the right node got bounded in a real engine.

Chromium and WebKit pass all three locally. Firefox will not launch on this machine for any test;
CI runs it.

## Where the project stands

v1.1.0 released; **M19: 19.1–19.5 and 19.8 done, 19.6–19.7 open**. `.changeset/` holds five minor
entries, so the next release is v1.2.0. ADRs through 0067, next free 0068. Bug ledger through
BUG-0004. 2725 tests, every gate green locally except the Firefox Playwright project.

## How the next session resumes

1. Wait for this PR to merge (one item per PR).
2. **19.6, column resize** (spec 06 F99) is next, and it is the harder of the two remaining:
   pointer-driven **with a keyboard-operable alternative** — NFR-21 has refused drag-only
   affordances since spec 04 — widths readable and restorable so a caller can persist them,
   minimum widths enforced, and **no row re-render**. Expect pointer capture, which means an
   api-floor amendment.
3. The artifact has ~3.2 kB before NFR-22's ceiling. 19.6 will cost more than 19.5 did; if it
   crosses, that item owes the decision with a measured argument.
