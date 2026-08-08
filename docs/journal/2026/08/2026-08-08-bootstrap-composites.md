# 2026-08-08 — Composites that compose, and M14 complete (roadmap 14.2)

## What got done

- Five composite builders on `/bootstrap` (spec 04 F61–F65): `bsCard`, `bsListGroup`,
  `bsBreadcrumb`, `bsAlert`, `bsPagination`, in a new `bootstrap-composites.js` behind the
  same entry — the split `/dom` made when spec 03 §4 listed three files and 11.2/11.3
  shipped five. The shared F52 internals are imported from the sibling, not copied.
- `Content` extended to accept **arrays** of strings and nodes, rendered in order through
  one `DocumentFragment` (F52), which is what lets a card slot hold text and a badge.
- **Two fixes found by building on top of the earlier waves**, both described below.
- [ADR-0038](../../../adr/0038-composites-compose-and-what-a-frozen-constant-costs.md),
  patterns rows 17 (Composite) and 18 (Decorator), spec 04 F64/NFR-17 and **spec 03 F49**
  amended, README usage, CHANGELOG, changeset, browser scenario.
- 1960 tests, **100% statements, branches, functions and lines across the whole library**.

## Decisions taken

- **Composition is literal, not aspirational.** `bsAlert` returns `inlineAlert` configured
  with a frozen class map — no re-implemented timer, escaping, ARIA role or teardown — and
  `bsPagination.update()` accepts `{page, pageCount}`, a subset of `view()`, so a pager
  wires to a pipeline with one subscription and no adapter. Both claims are now tested as
  delegation, not as coincidence.
- **F49's four kinds stay frozen.** F64 asks for "Bootstrap's full variant range"; that is
  reached by retargeting a kind in the class map, not by widening a frozen contract so the
  agnostic component learns a palette.
- **Accessible names get English defaults; visible marks get glyphs.** `aria-label="›"`
  announces nothing, so a name cannot be language-neutral. The F57 `closeLabel` precedent,
  promoted to a stated rule.

## The two defects this milestone found

1. **An empty close icon hid the close control** (F49, shipped in 12.1). Bootstrap's
   `.btn-close` draws its glyph in CSS, so its correct icon is empty — and the
   hide-when-empty rule, right for the decorative icon span, removed the only way to
   dismiss the alert. Verified with a probe (`hidden=""` on the rendered button) *before*
   being believed, then fixed with `hideWhenEmpty: false` for that one slot, a regression
   test in the F49 suite, and a spec-03 amendment.
2. **A nested list group fired the outer list's handler with the inner list's index.**
   Bootstrap encourages that nesting; both instances carry the same marker attribute, and
   `closest()` walks to whichever matches first. The outer handler then looked up an index
   belonging to another list — a wrong record, silently, or none. Delegation is now scoped
   to direct children. **Found by chasing an uncovered branch**, not by review, which is
   the argument for chasing them.

## Lessons worth carrying

1. **`Object.freeze` at module scope is not tree-shakeable.** It is a function call, so a
   bundler must assume side effects and keeps it in *every* bundle that touches the module.
   Measured: importing only `bootstrapIconsSet` retained `materialIconsSet` and the alert
   class map — 358 B. With `/* @__PURE__ */`: **43 B**, and every 14.1 atom came out
   *smaller* than it shipped. M15/M16 will add ~30 more class maps; each must carry the
   annotation, and the `single: bootstrapIconsSet` row is what will keep catching it.
2. **An estimate can be below the floor it was meant to cover.** `bsBreadcrumb ≤ 0.75 kB`
   was unmeetable by *any* builder: the shared F52 contract measures 763 B
   (`bsCloseButton`). The pre-implementation ceilings for M15/M16 deserve the same
   suspicion — check them against the floor before treating a miss as fat.
3. **Three of my own test expectations were wrong again**, all in the pagination window:
   with `siblingCount: 0` there is no reason for a neighbour to appear; the one-page-gap
   rule fires between a boundary and the current page too; and a text-node event target
   makes the delegation guard decline rather than fire. Same lesson as 14.1 — verify the
   claim before trusting the assertion.
4. **A coverage gap named a contract gap, twice.** The uncovered lines were the card's
   `subtitle` slot (an undocumented-by-test option) and a per-item `variant`. Both were
   real surface nobody had exercised.
5. **jsdom rejects a cross-realm `AbortSignal`** where browsers accept one, so a
   listener-owning component built into a *foreign* document from Node cannot be tested
   that way. Recorded rather than worked around: the constraint is jsdom's, and adding a
   `defaultView` lookup to satisfy it would have been complexity for a case browsers do
   not have.

## Where the project stands

**M14 is complete** — 14.1 and 14.2 both merged/ready, 13 builders on `/bootstrap`
measuring **6195 B** against the entry's unchanged 15 kB clause, so `bsTable` and the
behaviour wrappers have room. ADRs through **0038, next free 0039**. Spec 04 coverage rows
stay 🚧 (F66–F81 outstanding).

## How the next session resumes

1. Wait for this PR to merge, then **cut v0.7.0** — M14 is the milestone boundary, and the
   documented pre-1.0 policy is one MINOR per completed milestone. Two changesets are
   pending (14.1, 14.2). Release mechanics that worked last time are in the v0.5.0 notes:
   branch off `changeset-release/main`, restore the Keep-a-Changelog skeleton by hand,
   write both `docs/changelog/v0/v0.7.0.md` and `docs/releases/v0.7.0.md` in the same
   commit.
2. Then **15.1** `feat/bootstrap-table-core`: `bsTable`'s renderer over an owned
   `tablePipeline`, exposed as `.pipeline`. It composes F42 + F44 + the builders, so its
   6.5 kB indicative ceiling is the one to check against the floor first (lesson 2).
3. Carry the `/* @__PURE__ */` rule into every new frozen map.
