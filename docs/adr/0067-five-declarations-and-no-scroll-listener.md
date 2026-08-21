# ADR-0067: Five declarations and no scroll listener

- **Status:** Accepted
- **Date:** 2026-08-21
- **Deciders:** Daniel Polo
- **Related:** [spec 06](../specs/06_spec_table_data.md) §2 F98, §3 NFR-25/NFR-30; ROADMAP 19.5;
  [ADR-0040](0040-one-grammar-one-pager-and-a-ceiling-below-its-own-parts.md) (the `bsTable`
  facade and the F71 responsive wrapper this reuses as a scroll container),
  [ADR-0065](0065-a-set-of-keys-and-the-page-it-can-see.md) (the F95 selection column, whose
  header cell sticks with the rest for free),
  [ADR-0041](0041-a-peer-looked-up-not-imported.md) (the `/bootstrap` entry ceiling, still
  holding), [ADR-0059](0059-one-file-one-global-and-a-budget-repinned.md) and
  [ADR-0066](0066-a-csv-is-not-an-inert-document.md) (the artifact ceiling this ADR corrects
  the projection for)

## Context

F98 asks for a header that stays visible while the body scrolls, and then constrains the
*mechanism* rather than the appearance: **within a scroll container the caller owns, without
measuring layout in JavaScript per frame**, opt-in, compatible with the F71 responsive
wrapper, and without breaking the `aria-sort` and sort controls the header already carries.

The constraint is the interesting part. The version of this feature that shows up in most
component libraries measures the header, listens to `scroll`, and re-positions on every frame —
which is how a table starts to feel heavy on a long list, and why the requirement rules it out
before anyone writes it. `position: sticky` does the whole job in the compositor.

Three real decisions remained, and none is about whether to use `sticky`:

**Which node gets it.** `thead`, `tr` or `th` are all plausible, and engines have historically
disagreed about the first two.

**What breaks visually when it works.** A sticky cell scrolled away from its row loses two
things nobody expects: its bottom border, because `border-collapse: collapse` (Bootstrap's
default) draws that rule on a shared edge that does not travel with the cell; and its opacity,
because a table cell's background is transparent by default, so the rows scroll *through* the
header. Both are the difference between a working feature and one that looks broken.

**Where the scroll container comes from.** `position: sticky` sticks to the nearest scrolling
ancestor. If nobody bounded a height, there is no scrolling ancestor and the header simply does
not stick — silently, with nothing to say why. F98 says the container is the caller's, which is
right, and also leaves the most common mistake unguarded.

## Decision

**1. `position: sticky` and nothing else.** No `scroll` listener, no
`requestAnimationFrame`, no `getBoundingClientRect`, no `IntersectionObserver`, no ResizeObserver.
The whole feature is five declarations applied once at build time, which is why it needs no
api-floor amendment and costs 372 bytes.

**2. Every `th` in the header row, not the `thead` and not the `tr`.** Sticky on a table
*section* is the tidier stylesheet and the worse bet: engines disagreed about it for years, and
a cell is the one place every engine has always honoured it. Per-cell also means the F95
selection column sticks with the rest **for free**, because it is simply another `th` in that
row — no coordination between the two features at all.

**3. The bottom rule is redrawn as an inset shadow**, `inset 0 -1px 0
var(--bs-border-color, currentColor)`, because the collapsed border does not travel with the
cell. **The background is set** to `var(--bs-table-bg, var(--bs-body-bg, inherit))`, because a
transparent sticky header is the version of this feature that looks broken. Both read
Bootstrap's own custom properties, so a theme — including `data-bs-theme="dark"` — keeps its
colours instead of being overridden by ours.

**4. `sticky.maxHeight` bounds the F71 wrapper, and requires it.** Given, the responsive
wrapper becomes the scroll container and gets the height plus an explicit `overflow-y: auto`
(`.table-responsive` only asks for `overflow-x`), so `{ responsive: true, sticky: { maxHeight:
'400px' } }` is a working sticky table in one option. Omitted, the caller owns the container
entirely and the header sticks to whatever they built. Passed **without** `responsive` it is a
`TypeError` naming the requirement, because there is then no node of ours to bound and the
result would be a header that never sticks with nothing to explain it — the silent no-op this
library refuses.

**5. The bounded node is the scroll container, never the controls band.** With `controls`,
`element` is the outer band wrapper; bounding *that* would scroll the filter row and the pager
out of view along with the rows, which is the opposite of what a sticky header is for. The
responsive wrapper is captured as its own reference for exactly this reason.

**6. The caption is left alone.** It is not a header cell, and making it stick would be a
second decision nobody asked for.

## Alternatives Considered

- **A `scroll` listener that repositions the header.** Rejected by the requirement, and rightly:
  it is the implementation that makes a long table feel heavy, and it re-derives per frame what
  the compositor already knows.
- **`position: sticky` on `thead`.** Tidier, and the thing to switch to the day the floor makes
  it unambiguous. Rejected today because a cell is where every supported engine has always
  honoured it, and the per-cell version has a second payoff the section version does not: the
  selection column comes along without being mentioned.
- **A stylesheet, or a class the consumer styles.** Rejected: this library ships no CSS (that is
  what makes it a set of utilities rather than a framework), so a class alone would do nothing
  and the feature would be documentation. Inline declarations are the only version that works
  out of the box, and `headerClass` remains the caller's escape hatch for appearance.
- **`border-collapse: separate` to keep the borders.** It fixes the border and breaks
  Bootstrap's table styling wholesale — every cell's rules, the `.table-bordered` variant, the
  striping. An inset shadow is one declaration and changes nothing else.
- **Creating the scroll container ourselves whenever `sticky` is set.** Rejected: F98 says the
  container is the caller's, and silently wrapping their markup in a scroller with a height we
  invented would be a layout decision taken on their behalf. `maxHeight` is the opt-in, and it
  reuses the wrapper `responsive` already creates rather than adding a second one.
- **Letting `maxHeight` imply `responsive: true`.** Rejected: an option that silently turns on
  another option is how a DOM shape changes under a caller who never asked. The `TypeError`
  names both, which is one line to read and one line to fix.
- **Defaulting `top` to `'0'` rather than `'0px'`.** Equally valid CSS, and rejected for a small
  reason: the DOM normalizes the shorthand when read back, so a documented default of `'0'`
  would never be the value an inspector shows.

## Consequences

- **The surface is unchanged: 123 exports before and after.** A whole capability delivered as an
  option on an existing export — which is what NFR-25's additive-only rule looks like when it
  costs nothing at all, and worth noting because the previous three items each added one.
- **372 bytes on `{bsTable}`**, and that figure is the point rather than a footnote: the F95
  selection column cost 2222 B for a comparable amount of *user-visible* feature, because it
  needed a model, listeners and reflection. This one needed five declarations, so it cost a
  sixth as much. The cheapest implementation was also the one the requirement demanded.
- **No api-floor amendment.** Nothing new is read from the platform — `style.setProperty` on an
  element the library built is not a capability question — so the inventory stays at 41 entries.
  The first M19 item to need none.
- **The artifact projection was wrong, in the good direction, and is corrected here.** 19.3 and
  19.4 both flagged that ~1500 bytes an item would cross NFR-22's 40 kB ceiling before the wave
  ended. 19.5 cost **256 B**: 31444 B at M18 → 33982 (19.2) → 35671 (19.3) → 36541 (19.4) →
  **36797 (19.5)**, which is 92% of the ceiling with **~3.2 kB left for two items**. So the
  ceiling is *not* the constraint 19.6 inherits, and the decision still belongs to whichever item
  actually reaches it. A projection restated three times deserved to be checked against the next
  data point rather than repeated.
- **The behavioural claim is asserted where behaviour exists.** jsdom has no layout, so it
  verifies which declarations land on which nodes and that the silent-no-op configuration is
  refused; the Playwright suite scrolls a real container on three engines and asserts the header
  stays at its top edge while row one moves above it, that the computed background is not
  transparent (the engine's value, with Bootstrap's variables resolved — not the declaration we
  wrote), and that two sort clicks still write `aria-sort` through a positioned cell.
- **The browser fixture needed `controls`** to test sorting at all, because the sort-header
  delegation is F51's and exists only when controls are wired. Turning that into a feature of the
  fixture rather than a workaround: with controls present the scroll container sits *inside* an
  outer band wrapper, so the same test also proves the right node got bounded in a real engine.

## References

- Spec 06 §2 F98 (the requirement and its four constraints), §3 NFR-30 (budgets move per PR).
- ADR-0040 — the F71 responsive wrapper, reused here rather than duplicated.
- ADR-0065 — the selection column, which sticks along with the rest because of decision 2.
