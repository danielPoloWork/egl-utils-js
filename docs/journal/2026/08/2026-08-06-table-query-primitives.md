# 2026-08-06 — The /table query primitives (roadmap 9.3)

## What got done

- Shipped `egl-utils-js/table` (spec 02 F33–F35): `compileFilter`, `comparator`,
  `paginate` — [`table.js`](../../../../src/main/javascript/it/d4np/utils/table.js).
- Two ADRs, because this item was two contracts wearing one roadmap number:
  [ADR-0021](../../../adr/0021-filter-expression-grammar.md) (the grammar) and
  [ADR-0022](../../../adr/0022-comparator-total-order-semantics.md) (the order).
- First **patterns-catalogue rows of the wave**: Interpreter (row 5) and Strategy (row 6).
- First **real content in the threat model** — the filter-expression boundary with a full
  STRIDE pass, replacing the placeholder rows for that component.
- 104 tests (91 examples, 13 property laws) at 100% line and branch coverage.

## Decisions taken

- **The grammar is total.** Every string compiles; unreadable input falls back to a
  literal substring match under one rule. The reasoning is the call site: a filter box
  fires per keystroke, so `>`, `>=`, `>=1` are frames of an animation, not errors. A
  parser that throws would be wrapped in the same `try`/`catch` by every consumer.
- **No `RegExp` from user input** (ADR-0005 precedent). Compiling filters to regexes is
  the obvious implementation and hands an untrusted string to a backtracking engine that
  then runs per row per keystroke — the ReDoS shape this project already refused for
  `validateEmail`. Dispatch on leading token, evaluate with `includes`/`startsWith`/
  `endsWith`, cap expressions at 1024 characters.
- **Extension by injection, not forking.** `options.operators` registers custom tokens
  (matched longest-first, before the built-ins, so a caller may deliberately override
  one) and hands them the same `text`/`toNumber` helpers the built-ins use.
- **Auto-detection ranks per value, not per pair.** Per-pair detection — the intuitive
  reading, and what the originating implementation did — is intransitive on mixed
  columns, and an intransitive comparator is undefined behaviour for `Array.sort`, not
  merely a debatable order.
- **Blanks are pinned, not sorted**, and the pin is not multiplied by direction. In a
  declared numeric/date/boolean mode "unreadable" subsumes "empty", which keeps the order
  total without a second fallback rule.
- **Locale is opt-in for numbers, runtime-default for collation.** A locale-following
  numeric default would make `'1.5'` mean fifteen on one machine and one-and-a-half on
  another — a silent correctness bug. Collation differences are presentation, so the
  runtime default is fine there (matching `localeCompare()`).
- **`Intl` needs no api-floor entry**: the gate polices Web platform globals, while
  ECMA-402 built-ins are governed by `tsconfig` `lib`/`target`. Recorded in ADR-0022 so
  the absence reads as a decision.

## What the property suites found

Three real defects, none of which the example tests would have caught:

1. **`-0` for equal values.** `sign * 0` in descending order returns `-0`, which fails an
   `Object.is` comparison. Fixed at the source with a `directed()` helper that never
   multiplies zero.
2. **A test bug masquerading as a source bug.** `-Math.sign(0)` is `-0`, so the
   antisymmetry law failed on genuinely-equal pairs. Fixed with a three-valued sign in the
   test — worth recording, because the naive spelling of that law is wrong.
3. **`Array.prototype.sort` relocates `undefined` itself**, without ever calling the
   comparator, so `emptiesLast: false` cannot pin a literal `undefined` first. Not
   fixable — documented in the JSDoc, pinned by an example test, and excluded from the
   corresponding property law with the reason written down.

A fourth finding came from coverage: the NaN fallback in auto mode was **unreachable**
(an invalid `Date` stringifies to `''` and is pinned as missing before it can get there).
Removed rather than left as an uncovered branch.

## Numbers

- `/table` entry: **1722 B** min+gzip. Spec 02's pre-implementation ceiling was 1.6 kB —
  an unmeasured estimate — so NFR-08 is amended in this PR to 1.8 kB with the measurement
  recorded, per the landing-measurement rule 9.1 established.
- `compileFilter` **954 B** (inside the 1 kB clause — the exception NFR-08 had anticipated
  for it was not needed); `paginate` **196 B**; `comparator` **1006 B** — six bytes over,
  so it takes a named, measured exception row at 1.05 kB. Factoring the two boolean-option
  assertions into a shared helper to save those bytes made the single import *larger*
  (1018 B), because an inlined check folds away where a shared function survives.
- No new platform globals; `check:api-floor` green by construction.

## Where the project stands

M9 is three of six items done (9.1 `/text`, 9.2 `/net`, 9.3 `/table`). Root entry still
~5.1 kB against the frozen 6 kB ceiling. The three remaining M9 items are the ones that
*do* touch the root: 9.4 diagnostics, 9.5 storage, 9.6 web.

## How the next session resumes

1. Wait for this PR to merge (one PR at a time).
2. Start roadmap **9.4** on `feat/diagnostics-format-helpers`: `formatDuration` (the
   inverse of `parseDuration`, with the round-trip law as a property test) and
   `normalizeError` (any thrown value → a uniform diagnostic record). These are the
   wave's **first root-surface additions**, so the root size-limit row re-baselines
   within the frozen 6 kB ceiling and both functions need their own 1 kB scenario rows.
