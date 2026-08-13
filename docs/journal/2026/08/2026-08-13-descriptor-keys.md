# 2026-08-13 — Descriptors are checked too (roadmap 17.13)

## What got done

- **14 descriptor shapes** now reject a key they do not know, per
  [ADR-0056](../../../adr/0056-descriptors-are-checked-too.md): `bsTable` columns and the
  `controls` sub-configs; `bsListGroup` items and their nested `badge`; `bsBreadcrumb`,
  `bsAccordion`, `bsTabs`, `bsCarousel` items; `bsNavbar` items **and submenu children**;
  `bsCard`'s `image`; both `labels` sets; a custom `bsIcon` `set`; plus `/table`'s
  `TableColumn` and `/dom`'s `TableBindings` with its nested `sortHeaders` and `pagination`.
- **The measurement the item required, taken before adopting anything.**
- `bsTable` now projects columns to the F42 subset before handing them to `tablePipeline`.
- 29 new tests, 3 budget rows amended, `no-unused-vars` gains `ignoreRestSiblings`.

## The measurement, and why relative cost was the wrong number

17.13 existed as a separate item mainly because of one sentence: *"a per-row check has a
per-row cost that has to be measured before it is adopted."* So I measured before writing any
of it:

| | |
|---|---|
| Marginal cost per descriptor | **0.18 µs** |
| Relative to *reading* the descriptor | **~13×** |
| Share of a 500-item `bsListGroup` build (26.5 ms) | **0.34%** |
| Share of a 12×200 `bsTable` build (20.4 ms) | **0.011%** |

The 13× is the number that would have killed the item if taken at face value, and it is
meaningless: reading a descriptor is nearly free, so *anything* added to it multiplies. The
denominator that matters is the render, where DOM construction dominates by three orders of
magnitude. This is exactly why the roadmap asked for a measurement rather than an estimate —
an estimate would have been a guess about which denominator to use.

The same evidence keeps a per-**row** check rejected: columns are M (twelve), rows are N
(thousands), and only the first is configuration.

## Where ADR-0047's central idea does not transfer

ADR-0047's best line is that *the destructuring is the schema* — "a rest element cannot drift,
because it **is** the complement of what the function reads." I expected to reuse that
wholesale and found it only half applies. It holds when the function reads the bag by
destructuring it. Descriptors are read by property access across several helpers
(`normalizeItem` validates a list-group item, `buildListItem` renders it), so no single
destructuring is the complement of the reads.

So the implementation splits, and the ADR says so rather than implying a guarantee it does not
have:

- **Where a funnel exists**, the descriptor is destructured *and its values used* —
  `normalizeItem` now returns the object it destructured, which makes every downstream read a
  read of a named property by construction. Full guarantee, preserved.
- **Where the reads must stay** (`BsTableColumn` read in three places; `sortHeaders`, whose
  in-place reads are what TypeScript's narrowing proves defined), the pattern lists the keys
  without consuming them. That is *a written schema*, not a derived one. It is acceptable only
  because the failure directions are asymmetric: forgetting a key **rejects loudly**, and the
  one silent case — a key in the pattern that nothing reads — is harmless.

Writing that distinction down was most of the thinking in this item. Claiming ADR-0047's
guarantee uniformly would have been the easy and slightly false thing.

## Two things the change forced, both improvements

**`bsTable` was spreading its whole column into `tablePipeline`.** The moment `/table` started
rejecting unknown keys, that broke — a `BsTableColumn` is a superset (`label`, `format`,
`align`, class and markup options belong to the renderer). Its own typedef already said only
"the F42 fields are passed through to the pipeline untouched"; now the code does that. The
check found a documentation/implementation gap the way 17.7's did.

**`no-unused-vars` needed `ignoreRestSiblings`** — the rule's own default, which
`js.configs.recommended` does not set. It exempts precisely one pattern, names destructured
beside a `...rest`, which *is* this contract. The alternative was a `void` statement per key.

## What was NOT found, which is also a result

17.7 found three silent key-drops in this repository the moment its check existed. **17.13
found none** — all 2387 pre-existing tests passed on the first full run after the change. That
is not a weaker outcome, it is a different one, and the reason is structural: 17.7's findings
were all *between* functions, where one builder spread an options bag into another. Descriptors
are written at the call site by whoever is reading the typedef, and they were correct.

Cost was correspondingly small: **3 budget rows** against 17.7's seventeen. `/dom` now sits
exactly at NFR-12's 5 kB clause rather than under it, which is worth watching.

## One gap left alone deliberately

A `bsNavbar` submenu child is typed `BsNavbarItem` and so accepts `disabled`, but the child
renderer never reads it — silently ignored, and always has been. The new check accepts the
documented key rather than narrowing the public surface, keeping this item to strictness. If
anyone wants disabled submenu entries that is a 1.x behaviour item, and the ADR records it so
it is not rediscovered as a mystery.

## Where the project stands

M17: everything done except **17.3** (publish the generated API reference), **17.4** (the
per-function NFR-01 clause — recorded as the owner's decision) and **17.5**, which cuts
v1.0.0. ADRs through 0056; next free 0057. Eight changesets queued.

## How the next session resumes

1. Wait for this PR to merge.
2. **17.3** is the only ordinary work left: a Pages workflow that builds `docs/api/` and
   publishes it per release, linked from the README.
3. **17.4** needs the owner: whether NFR-01's per-function 1 kB budget exempts composing
   facades or keeps naming them one by one. Practice has amended it five times now
   (`httpClient`, `bsTable`, `tablePipeline`, `bindTableControls`, `compileFilter`).
4. Then **17.5** cuts the release. Note for it: `[Unreleased]` has grown large and spans
   several breaking changes — the compatibility statement it asks for has real content to
   summarise (the Node 22 floor, the option/descriptor strictness, the naming freeze, the
   instance contract, the sanitizer peer).
