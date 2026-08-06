# ADR-0022: Comparator semantics — a total order, pinned blanks, and locale by opt-in

- **Status:** Accepted
- **Date:** 2026-08-06
- **Deciders:** Daniel Polo (owner), agent (tech-lead persona)
- **Related:** spec 02 §2 (F34), §3 (NFR-08); ADR-0015 (documented budget exceptions), ADR-0017 (platform-API floor gate), ADR-0021 (the sibling query primitive), ROADMAP 9.3; pattern: **Strategy**

## Context

`Array.prototype.sort` requires a *consistent* comparator. The specification is explicit
that an inconsistent one — one that is not antisymmetric and transitive — produces an
implementation-defined result: not merely a debatable order, but potentially a shuffled
array. Real column data makes consistency hard to reach by accident:

- **Blanks.** A column has `null`s, `undefined`s, and empty strings. Sorted naively they
  land wherever their string form falls, and reversing the sort scatters them from one
  end to the middle.
- **Mixed types.** A JSON column arrives as numbers in some rows and numeric strings in
  others; a date column mixes `Date` instances with ISO strings. The obvious fix — detect
  the type per *pair* — is what breaks transitivity: with `10`, `'9'`, and `2`, one pair
  compares numerically and another lexicographically, and `sort` can produce nonsense.
- **Text.** `'item 10'` before `'item 9'` is wrong to every user who is not a computer,
  and case or accents should not split otherwise-equal values.
- **Locale.** Someone must decide whether `'1.5'` is one-and-a-half or fifteen, and
  whether that answer depends on the machine running the code.

## Decision

`comparator` is a **Strategy** factory: it selects a comparison algorithm from `type` and
returns it as a plain `(a, b) => number`, with an injectable `collator` slot for callers
who want different collation. Four rules define the order.

**Missing values are pinned, not sorted.** `null`, `undefined`, and `''` go to one end
chosen by `emptiesLast`, and that choice is **not** multiplied by `direction` — reversing
a column must not scatter its blanks. Two missing values compare equal.

**In `'auto'` mode, values order by type rank first, then by value** — booleans, then
numbers, then dates, then text. Ranking per *value* rather than detecting per *pair* is
what makes the order transitive on mixed data. Homogeneous columns, the normal case,
behave exactly as expected.

**In a declared mode, unreadable is missing.** In `'number'`, `'date'`, and `'boolean'`
mode a value that cannot be read as that type is pinned with the blanks. This keeps the
order total without inventing a second fallback ordering, which is where transitivity
usually dies. It also means "unreadable" subsumes "empty", so one test covers both — an
invalid `Date` is pinned like any other blank.

**Text collates through `Intl.Collator`** with `sensitivity: 'base'` and `numeric: true`,
so `'item 9'` precedes `'item 10'` and case and accents do not split equal values.

**Locale is opt-in for numbers, runtime-default for collation.** Without a `locale`,
numbers are read the way `Number()` reads them — because a default that follows the
machine's regional settings would make `'1.5'` mean fifteen on one developer's laptop and
one-and-a-half on another's, which is a correctness bug, not a presentation difference.
Collation without a locale uses the runtime default, matching `localeCompare()` and
producing an ordering difference at worst, not a wrong value.

The comparator never returns `-0`: equality is exactly `+0`, so callers comparing the
result with `Object.is` are not surprised.

**`Intl` needs no API-floor entry.** `check:api-floor` (ADR-0017) polices *Web platform*
globals; `Intl.Collator` and `Intl.NumberFormat.prototype.formatToParts` are ECMA-402
built-ins governed by `tsconfig`'s `lib`/`target` and esbuild's `es2022` target, both
below the Safari 15.4 floor. Recorded here so the absence reads as a decision rather than
an oversight.

## Alternatives Considered

- **Detect the type per pair in `'auto'` mode** — the intuitive reading of "auto", and
  what the originating implementation did. Rejected because it is not transitive on mixed
  columns, and an intransitive comparator is undefined behaviour for `sort`, not just an
  odd order.
- **Sort blanks by their string form** (`''` collates first, `null` becomes `'null'`).
  Simplest possible rule. Rejected because blanks then move when the direction flips, and
  a `null` sorts among the `n`s — both of which read as bugs to anyone looking at the
  table.
- **Let `direction` move the blanks too.** Arguably more "consistent" as a mental model:
  reverse means reverse. Rejected because the point of pinning is that missing data is not
  *data* — it has no magnitude to reverse — and every table UI that gets this right keeps
  blanks parked.
- **Treat unreadable values in typed mode as `NaN`/`Infinity` sentinels** rather than
  missing. Keeps them distinguishable from true blanks. Rejected because it needs a second
  tie-breaking rule to stay transitive, and the distinction has no user-visible meaning in
  a sorted column.
- **Classify numeric strings as numbers in `'auto'` mode.** Would make `['9', '10']` sort
  numerically. Rejected as unnecessary: the collator's `numeric: true` already sorts
  digit runs inside text naturally, so the extra rank only adds a way for a mixed column
  to surprise someone.
- **Default the numeric locale to the runtime's.** Friendlier for a localized app.
  Rejected on determinism: the same input would parse to different numbers on different
  machines, and the failure is silent. Opting in is one option away.
- **Build the collator lazily, or memoize it across calls.** Would shave the construction
  cost in numeric modes. Rejected as premature: a comparator is built once per sort, and a
  module-level cache would be shared mutable state, which the dual-package rule (spec 01
  §4) keeps out of this library.
- **Shrink `comparator` under 1 kB to avoid a budget exception** — attempted: factoring the
  two boolean-option assertions into a shared helper made the single import *larger*
  (1018 B), because a shared function survives where an inlined check is folded away.
  Rejected in favour of the honest exception below; contorting readable code for six bytes
  is the wrong trade.

## Consequences

- Sorting is safe: the property suite asserts reflexivity, antisymmetry, and transitivity
  across all five modes, both directions, and both blank policies, plus that sorting is a
  permutation and that blanks stay in one contiguous run at the chosen end.
- **One caveat no comparator can fix:** `Array.prototype.sort` relocates `undefined`
  elements to the end of the array *itself*, without ever calling the comparator. So
  `emptiesLast: false` pins `null` and `''` first, but a literal `undefined` still lands
  last when sorting in place. Documented in the JSDoc, pinned by an example test, and
  excluded from the corresponding property law — no implementation could satisfy it.
- `comparator` measures **1006 B** min+gzip as a single import — six bytes over the 1 kB
  NFR-08 clause. It takes a **named, measured exception row at 1.05 kB**, the mechanism
  ADR-0015 established and spec 02 NFR-08 pre-authorized. Notably the clause had
  anticipated this for `compileFilter`, which needed none (954 B).
- Cost: mixed-type columns order by type before value, which is deterministic but is not
  what a user expects if they believed their column was homogeneous. The JSDoc says so;
  the alternative is undefined behaviour.
- Cost: callers who need a locale-sensitive numeric default must pass `locale` explicitly.
  This is the intended direction of the trade — explicit and portable over implicit and
  machine-dependent.

## References

- Spec 02 §2 (F34), §3 (NFR-08 budgets and the exception mechanism), §6 (total-order laws) — `docs/specs/02_spec_core_extensions.md`
- ADR-0015 (documented budget exceptions), ADR-0017 (what the API-floor gate does and does not police), ADR-0021 (the filter grammar sharing this entry)
- ECMA-262 `Array.prototype.sort` — the consistent-comparator requirement and the `undefined`-to-the-end rule
- Implementation: `src/main/javascript/it/d4np/utils/table.js`; laws: `src/test/javascript/it/d4np/utils/table.property.test.js`
