# ADR-0019: The spec-02 subpath family, and code units as the text measure

- **Status:** Accepted
- **Date:** 2026-08-06
- **Deciders:** Daniel Polo (owner), agent (tech-lead persona)
- **Related:** spec 02 §2 (F26-F28), §3 (NFR-08), §4; ADR-001 (exports map, named exports), ADR-0015 (size budgets and the one documented exception), ADR-0004 (TypeError vs domain-error split), ROADMAP 9.1

## Context

Spec 02 adds a wave of utilities to a package whose root entry is already close to its
frozen ceiling: NFR-01 caps a full root import at **6 kB** min+gzip, and the measured
figure before this wave is **5104 B** — about 0.9 kB of headroom for seven planned
capabilities. Two questions had to be settled once, at the first item, rather than
re-argued per PR:

1. **Where does new surface live?** Adding groups to the root barrel is the path of least
   friction for consumers, but each addition spends non-renewable headroom, and a
   utility nobody imports still costs every consumer who imports anything from the root.
   The library already has the counter-precedent: `/storage` and `/sanitize` fence off
   browser-leaning and peer-dependent code (ADR-0010, ADR-0012).
2. **What does "length" mean for the text helpers?** F26-F28 promise budgets and exact
   widths, and JavaScript offers at least three defensible units: UTF-16 code units
   (`String.length`), Unicode code points (`[...str]`), and grapheme clusters
   (`Intl.Segmenter`). They disagree on real data — `'😀'` is 2 code units, 1 code point,
   1 grapheme; `'é'` written as e + combining accent is 2 of each of the first two and 1
   grapheme. A function promising "exactly `width`" must say which it counts, because
   callers align columns against `String.length`, and terminals align against display
   width, which is a *fourth* thing again.

## Decision

**Spec-02 capability groups ship as their own Node-safe subpath entries, not as root
exports**, starting with `egl-utils-js/text`. The root entry stays reserved for the small
absorptions that genuinely belong to an existing group (F36-F38), and the NFR-01 6 kB
ceiling is never renegotiated to make room. Each new entry declares its own whole-entry
budget (NFR-08) plus a per-function scenario row, so tree-shaking is proved per import
rather than assumed. An entry is added through exactly four coordinated edits —
`package.json` `exports`, `tsup.config.js` `entry`, `typedoc.json` `entryPoints`,
`.size-limit.json` rows — and that quadruple is the checklist every later subpath follows.

**The text helpers measure length in UTF-16 code units** — the same unit
`String.prototype.length` reports — and additionally guarantee that **they never emit a
lone surrogate**: when a cut falls between the halves of a surrogate pair, the whole pair
is dropped. `fixedWidth` therefore still returns exactly `width` code units (the freed
unit is absorbed by padding), while `truncate` guarantees *at most* `maxLength` — exactly
that, except for the one-unit-shorter surrogate case. Grapheme clusters and East-Asian
display width are explicitly out of scope.

## Alternatives Considered

- **Put `text`/`net`/`table` on the root entry** — one import path, no wiring, matching
  how `data` and `diagnostics` ship today. Rejected because the three groups together are
  ~2 kB min+gzip against ~0.9 kB of headroom: it would force either a ceiling increase
  (renegotiating a frozen NFR to avoid a design decision) or a scramble to shrink
  unrelated code. Subpaths make the cost visible and local.
- **One `/misc` or `/extras` grab-bag entry for the whole wave** — cheaper than four
  entries (one budget row, one wiring quadruple). Rejected because a grab-bag has no
  membership rule, so it accretes; and a consumer wanting only `truncate` would carry the
  IP parser and the filter grammar in the same entry's audit and documentation surface.
- **Count code points** (`[...str].length`) — friendlier for astral characters, one unit
  per emoji. Rejected because it silently disagrees with `String.length`, which is what
  callers use to check whether they *need* to truncate; a `fixedWidth` returning 8 code
  points where the caller's column math expects 8 code units produces ragged output —
  the exact failure the function exists to prevent.
- **Count grapheme clusters** (`Intl.Segmenter`, available across the supported floor) —
  the most human-correct notion of "characters". Rejected for the same disagreement with
  `String.length`, plus it is locale-sensitive (so a pure function would need a locale
  option to stay deterministic) and it still does not solve alignment, because a grapheme
  can be one or two columns wide in a terminal.
- **Solve display width** (East-Asian wide/fullwidth tables) — what console alignment
  actually wants. Rejected as out of scope for a general text utility: it needs a Unicode
  width table (kilobytes of data against a 0.8 kB entry budget) that ages with each
  Unicode release. A caller who needs it can pre-measure and use `fixedWidth` as the
  padding primitive.
- **Allow lone surrogates** (plain `slice`) — simpler, and preserves the exact-width
  promise unconditionally. Rejected because a lone surrogate is invalid text: it renders
  as U+FFFD, breaks `JSON.stringify` round-trips through some transports, and can corrupt
  a log line at exactly the moment the log matters. Losing one code unit is the cheaper
  failure, and `fixedWidth` hides it entirely behind padding.

## Consequences

- Consumers import text helpers as `import { truncate } from 'egl-utils-js/text';`. The
  root entry is unaffected — Node-only and root-only consumers pull zero bytes of this
  wave, and the `/text` entry costs nothing to anyone who never imports it.
- The four-edit wiring quadruple is now a documented, repeatable step; `publint`,
  `arethetypeswrong`, and the size-limit rows mechanically catch a missed edit, so a
  half-wired entry cannot ship.
- The code-unit contract is testable as a law, and is tested as one: property suites
  assert `truncate` never exceeds its budget, `fixedWidth` returns exactly `width` for
  arbitrary input including lone-surrogate strings, and neither introduces a lone
  surrogate the input did not already contain.
- Cost: callers who need grapheme or display-width semantics must layer them on top; the
  JSDoc and this ADR say so explicitly rather than letting them discover it through
  misaligned output.
- Cost: more entry points to keep in lockstep (four files per entry, plus the coverage
  map and README). Accepted as the price of a budget that stays honest.
- If display-width or grapheme measurement is ever wanted, it is a **new ADR and a new
  option or function**, not a quiet change to what these three count — the unit is part
  of the contract.

## References

- Spec 02 §2 (F26-F28), §3 (NFR-08 budgets), §4 (entry layout) — `docs/specs/02_spec_core_extensions.md`
- ADR-001 (named exports, exports map), ADR-0010 / ADR-0012 (the browser-leaning subpath precedents), ADR-0015 (budget discipline and documented exceptions)
- Implementation: `src/main/javascript/it/d4np/utils/text.js`; laws: `src/test/javascript/it/d4np/utils/text.property.test.js`
