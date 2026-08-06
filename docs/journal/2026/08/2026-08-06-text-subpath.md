# 2026-08-06 — The /text subpath (roadmap 9.1)

## What got done

- Implemented spec 02 F26–F28 in `src/main/javascript/it/d4np/utils/text.js`: `truncate`,
  `wrapText`, `fixedWidth` — pure, options-object, `TypeError` on wrong input types.
- Wired the first spec-02 subpath end to end (the four coordinated edits):
  `package.json` `exports`, `tsup.config.js` `entry`, `typedoc.json` `entryPoints`, and
  `.size-limit.json` (one whole-entry row plus a per-function scenario row each).
- 48 tests: 37 example cases (`text.test.js`) and 11 property laws
  (`text.property.test.js`) covering length budgets, idempotence, whitespace/paragraph
  handling, and content preservation under adversarial input (lone surrogates included).
- [ADR-0019](../../../adr/0019-subpath-family-and-code-unit-text-semantics.md) records
  the two decisions this item had to settle for the whole wave.

## Decisions taken

- **Capability groups get their own Node-safe subpath entries**, not root exports. The
  root has ~0.9 kB of headroom under the frozen 6 kB NFR-01 ceiling; spending it on three
  optional groups would have forced a ceiling renegotiation. The four-edit wiring
  quadruple is now the repeatable checklist for `/net`, `/table`, and `/logging`.
- **Length means UTF-16 code units** — the unit `String.length` reports, so caller-side
  column math agrees with the library — **and no helper ever emits a lone surrogate**: a
  cut that would split a surrogate pair drops the pair. `fixedWidth` keeps its exact-width
  promise (padding absorbs the freed unit); `truncate` therefore guarantees *at most*
  `maxLength`. Graphemes and East-Asian display width are explicitly out of scope, with
  the reasoning recorded rather than left to be rediscovered.

## Spec amendments made in this PR

F26 and F27 were tightened to match the implementation (AGENTS.md §5 — divergence updates
the spec in the same PR): F26 now states the at-most budget with the surrogate exception,
the ellipsis-truncation rule, and idempotence; F27 states the whitespace-collapsing and
paragraph-preservation behaviour, plus the narrower-than-one-code-point overflow rule.

## Where the project stands

Milestone 9 is 1/6 complete. `/text` is the only new entry so far; the root entry,
`/storage`, `/sanitize`, and `/errors` are untouched by this item.

## How the next session resumes

Wait for this PR to merge (one PR at a time), then start roadmap **9.2** on
`feat/ipv4-cidr-helpers`: a `/net` entry with `isIpv4`, `parseIpv4`/`formatIpv4`,
`ipv4ToKey`/`ipv4FromKey`, and `subnetMaskFromPrefix` (spec 02 F29–F32). It reuses this
item's wiring quadruple verbatim; its own ADR (next free number: 0020) covers the strict
IPv4-only parsing scope and the `null`-versus-`TypeError` split.
