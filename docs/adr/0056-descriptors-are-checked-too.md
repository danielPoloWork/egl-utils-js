# ADR-0056: Descriptors are checked too — and where the rule deliberately stops

- **Status:** Accepted
- **Date:** 2026-08-13
- **Deciders:** Daniel Polo (owner), agent (senior project architect persona)
- **Related:** ROADMAP 17.13 (filed by 17.7's own scope boundary),
  [ADR-0047](0047-an-unknown-option-key-is-a-typeerror.md) (the rule extended here, and the
  place its central mechanism does *not* transfer),
  [ADR-0040](0040-one-grammar-one-pager-and-a-ceiling-below-its-own-parts.md) and
  [ADR-0038](0038-composites-compose-and-what-a-frozen-constant-costs.md) (the budget rows
  amended), [ADR-0015](0015-final-size-budgets-and-the-httpclient-exception.md) (measure,
  then amend)

## Context

ADR-0047 made an unknown key in an **options bag** a `TypeError`, and drew its own boundary
explicitly: *"option bags, not caller-supplied descriptor shapes — table column definitions,
carousel/accordion/navbar items, control configs. Those are read by key too and deserve the
same rule; they are filed as 17.13 … because the descriptor shapes are per-item and their
validation lives on a different code path."*

Two things had to be settled before adopting it, and the roadmap item named both.

**The cost, because it is per item.** An option bag is read once per call; a descriptor is
read once per column, item, or menu child. ADR-0047's check is cheap, but "cheap × N" is an
argument, not a conclusion — the item required it measured before adoption.

**The mechanism, because ADR-0047's does not transfer.** Its central claim is that *the
destructuring is the schema*: "a rest element cannot [drift], because it **is** the complement
of what the function reads." That holds when the function reads the bag by destructuring it.
Descriptors are read by property access, often across several helpers — `normalizeItem`
validates a list-group item and `buildListItem` renders it — so no single destructuring is the
complement of the reads, and the anti-drift guarantee has to be re-earned rather than assumed.

## Decision

**1. Adopt the rule for descriptor shapes.** Fourteen shapes across three entries now reject a
key they do not know, with the same message shape and a noun saying where it sat
(`bsTable: unknown options.columns[0] property 'sortible'`). The `noun` parameter
`assertNoUnknownOptions` already carried — added speculatively in 17.7 with
`'column property'` as its documented example — is what made this a per-site change rather
than a new helper.

The shapes: `BsTableColumn`; the `controls` sub-configs `filterRow`/`search`/`pageSize`;
`BsListGroupItem` and its nested `badge`; `BsBreadcrumbItem`; `BsAccordionItem`; `BsTabsItem`;
`BsNavbarItem` **and its submenu children**; `BsCarouselItem`; `BsCardImage`;
`BsPaginationLabels`; `BsCarouselLabels`; `IconSet`; plus `/table`'s `TableColumn` and
`/dom`'s `TableBindings` with its nested `sortHeaders` and `pagination`.

`controls.pagination` needed nothing: its rest element is already forwarded to `bsPagination`,
which rejects unknown keys itself — the composition doing the work for free.

**2. Where a funnel exists, the descriptor is destructured *and its values used*, so
ADR-0047's guarantee is preserved intact.** `normalizeItem` now returns the object it
destructured, which makes every downstream read a read of a named property by construction.
Same for the breadcrumb, accordion, tabs, navbar, carousel and card-image builders.

**3. Where the reads must stay in place, the pattern is destructure-and-discard, and the
guarantee is honestly weaker.** `BsTableColumn` is read across the header builder, the cell
builder and the pipeline projection; `sortHeaders` is read where TypeScript's narrowing proves
its fields defined. There the destructuring lists the accepted keys without consuming them, so
it is *a written schema* rather than a derived one. The failure directions are asymmetric and
that is what makes it acceptable: forgetting to add a new key to the pattern **rejects
loudly**, and the only silent failure — adding a key to the pattern without reading it
anywhere — is harmless. This is stated rather than glossed, because it is the one place this
ADR is weaker than the one it extends.

**4. `bsTable` now projects its columns down to the F42 subset before handing them to
`tablePipeline`.** This was forced by the change and is a genuine fix: a `BsTableColumn` is a
superset (`label`, `format`, `align`, the class and markup options belong to the renderer), and
the whole superset was previously spread into a pipeline that now rejects what it does not
model. The typedef already claimed only "the F42 fields are passed through to the pipeline
untouched"; the code now does exactly that.

**5. `no-unused-vars` gets `ignoreRestSiblings: true`** (the rule's own default, which
`js.configs.recommended` does not set). It exempts exactly one pattern — names destructured
alongside a `...rest` — which *is* this contract. Without it, decision 3 would require a
`void` statement per key.

## What the rule deliberately does not reach

Three exclusions, each pinned by a test rather than left to prose:

- **Row data.** `bsTable`'s `data` and `setData` are never key-checked. Descriptors are
  configuration a developer wrote; rows are records that arrive from elsewhere and
  legitimately carry keys this library does not model. Checking them would be a per-row cost
  *and* wrong. This is the sharpest line in the decision.
- **Maps keyed by the caller's own names.** `bindings.filters` is keyed by column key,
  `classes` and `icons` by kind. Their keys are data. ADR-0047's escape hatches (`bootstrap`,
  `operators`, `classes`) are untouched.
- **Return values.** `BsTableControlParts` is ours, not the caller's.

## What it cost, measured

The roadmap item's precondition, answered before adoption. Per-item marginal cost of
destructure-plus-assert versus today's property-access read, and the same figure as a share of
the work it rides along with:

| Measurement | Value |
|---|---|
| Marginal cost, per descriptor | **0.18 µs** (0.089 ms per 500 items) |
| Relative to *reading* the descriptor | **~13×** |
| As a share of a 500-item `bsListGroup` **build** | **0.34%** |
| As a share of a 12-column × 200-row `bsTable` **build** | **0.011%** |

The 13× figure is the misleading one and the reason the item asked for a measurement rather
than an estimate: reading a descriptor is nearly free, so anything added to it looks enormous
in relative terms. The denominator that matters is the render — `bsListGroup` with 500 items
takes 26.5 ms, of which the checks are 0.089 ms. **Adopted**, and a per-row check remains
rejected on the same evidence: columns are M (twelve), rows are N (thousands), and only the
first is configuration.

Bytes, by the ADR-0015 rule — measure, then amend the row that needs it:

- **`/dom` full import: 4726 → 4990 B**, and the row moves 4.93 kB → **5 kB**, which is
  NFR-12's clause exactly. It now sits at the clause rather than under it.
- **`bindTableControls`: 2093 → 2242 B**, row 2.2 → **2.3 kB** (three bindings shapes).
- **`bsListGroup`: 2006 → 2153 B**, row 2.15 → **2.2 kB** (per-item plus the badge).
- **Everything else absorbed it**: `/bootstrap` (20290 B against 20.5 kB), `bsTable`,
  `bsCarousel`, `bsNavbar`, `bsTabs`, `bsAccordion`, `bsBreadcrumb`, `bsCard`, `bsIcon`,
  `/table` and `tablePipeline` all stayed inside their existing rows. Three rows against
  17.7's seventeen.

## Consequences

- **Breaking, in the window built for it.** Code passing an unrecognised key inside a column,
  item, label set, icon set or binding now throws where it was silently ignored. Same
  justification as ADR-0047: the silence is the expense, and after 1.0 the fix costs a major.
- **Nothing in this repository was found to be dropping a descriptor key** — unlike 17.7,
  which found three silent drops the moment its check existed. That is a real result, not a
  weaker one: 17.7's findings were all *between* functions, where one builder spread a bag into
  another; descriptors are written at the call site by the person reading the typedef, and
  they were correct.
- **One pre-existing gap surfaced and is left alone deliberately:** a `bsNavbar` submenu child
  accepts `disabled` (its type is `BsNavbarItem`) but the child renderer never reads it, so it
  has always been silently ignored. The new check accepts the documented key rather than
  narrowing the surface, which keeps this ADR to strictness and leaves the behaviour question
  where it belongs — a 1.x item if anyone wants disabled submenu entries.
- Nineteen new rejection tests and a matching "every documented property is still accepted"
  suite, which is the half that catches an over-tightened pattern.

## References

- ROADMAP 17.13; [ADR-0047](0047-an-unknown-option-key-is-a-typeerror.md) §"Scope boundary".
- Spec 04 §2 F66–F67 (`BsTableColumn`, the controls), spec 03 §2 F51 (`TableBindings`),
  spec 02 §2 F33–F35 (`TableColumn`).
