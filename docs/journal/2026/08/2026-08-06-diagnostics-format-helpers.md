# 2026-08-06 — Diagnostics: formatDuration and normalizeError (roadmap 9.4)

## What got done

- `formatDuration` and `normalizeError` added to `diagnostics.js` and re-exported from the
  root barrel (spec 02 F36–F37) — the **wave's first additions to the root surface**.
- [ADR-0023](../../../adr/0023-duration-round-trip-and-the-error-record.md) fixes both
  contracts: the duration round-trip, and the one record shape for any thrown value.
- 47 tests (38 examples, 9 property laws) at 100% line and branch coverage for
  `diagnostics.js`.

## Decisions taken

- **`formatDuration` targets the ADR-0009 grammar exactly, not human prose.** Its value is
  that the output is machine-readable by the parser already in the library:
  `parseDuration(formatDuration(ms)) === ms` for every whole second, asserted as a
  property. A localized renderer would be a different function under a different name.
- **Truncate, never round.** A 400 ms operation reads `'0s'`. Reporting more time than
  elapsed is a lie in the primary use (timing output), and truncation is what makes the
  bound precise: `reported ≤ elapsed < reported + 1s`, also a property.
- **No zero segments** (`'1h'`, not `'1h0m0s'`) — the canonical spelling ADR-0009 fixed, so
  the round-trip holds in text as well as in value.
- **`normalizeError` returns a plain record, not a wrapped `EglError`.** Wrapping destroys
  the original's identity exactly when it matters (the caller can no longer branch on
  `.code` without unwrapping), and a record is what a logger, a JSON payload, and a test
  assertion all want. It also sidesteps the dual-package `instanceof` hazard.
- **`cause` is the original value by identity**, so the idiom is `log(normalizeError(e));
  throw e;`. The private-codebase equivalent this replaces both logged *and* rethrew from
  inside one helper; splitting them removes the hidden control flow and the logger
  coupling. The M10 logger will *consume* this record, not produce it.
- **Optional fields are absent, not `undefined`**, so `'status' in record` means what it
  says and the record serializes cleanly.
- Out-of-domain numbers throw `TypeError`, not `RangeError` — one rule across the codebase
  beats a taxonomy the caller has to remember (`text.js` precedent).

## The tree-shaking regression this PR caught

The descending unit list started as `Object.entries(UNITS).sort(...).map(...)` at module
scope — a small robustness flourish so the order could not drift from `UNITS`. A computed
top-level expression is **not statically analyzable as side-effect-free**, so esbuild
retained the whole `diagnostics` module in *every* root import. `httpClient` grew 86 B
(1321 → 1407 B) and broke its ADR-0015 budget row — which is exactly how the regression
surfaced, in a row belonging to an unrelated function.

Rewritten as a literal `['h', 'm', 's']`, with `UNITS` still the single source of the
millisecond values. `httpClient` returned to 1324 B and the root dropped 43 B.

**The general rule, now written into the ADR: module-scope constants in this library must
be literals.** The per-function size rows are what enforce it, and they only work because
every public function has one.

## Numbers

- Root full import: 5104 B → **5520 B** (+416 B) against the frozen 6 kB NFR-01 ceiling.
  The row re-baselines to 5.85 kB per NFR-08 (measured + 6%).
- `formatDuration` **253 B**, `normalizeError` **411 B** — both inside the 1 kB clause.
- Also fixed the mojibake em-dash in the root row's name while re-baselining it (the row
  was being edited anyway; CI output is now readable).
- **Foreseeable crunch, flagged now:** 9.6 `createResource` is the wave's last root
  addition, estimated ~350 B. That lands the root near 5.87 kB, where measured+6% exceeds
  the ceiling and the row can only become 6 kB exactly, with the wave-end tightening
  deciding the final number.

## Where the project stands

M9 is four of six items done (9.1 `/text`, 9.2 `/net`, 9.3 `/table`, 9.4 diagnostics).
Remaining: 9.5 `pageSessionId` on `/storage`, 9.6 `createResource` on the root. Then
v0.2.0.

## How the next session resumes

1. Wait for this PR to merge (one PR at a time).
2. Start roadmap **9.5** on `feat/page-session-id`: `pageSessionId` on the `/storage`
   entry, built on the existing `sessionStorageWrapper` probe and `uuid()`. Notes carried
   from the plan: reach storage as a bare global (never `window.sessionStorage`, which is
   policed with no inventoried members and would fail `check:api-floor`); the `/storage`
   budget re-baselines from 1706 B; it needs a Playwright spec for per-tab isolation
   (distinct across tabs, stable across reloads) plus Node fallback unit tests.
