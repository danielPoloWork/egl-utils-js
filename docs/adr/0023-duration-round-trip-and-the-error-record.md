# ADR-0023: `formatDuration` as an exact inverse, and one record shape for any thrown value

- **Status:** Accepted
- **Date:** 2026-08-06
- **Deciders:** Daniel Polo (owner), agent (tech-lead persona)
- **Related:** spec 02 §2 (F36-F37), §3 (NFR-08); ADR-0009 (the h/m/s duration grammar), ADR-0003 (the typed error taxonomy and stable `.code`), ADR-0004 (TypeError vs domain-error split), ADR-0015 (budget discipline), ROADMAP 9.4

## Context

Two small root additions, each with one decision that outlives the code.

**`formatDuration`.** ADR-0009 froze a strict grammar for reading durations: `h`/`m`/`s`,
strictly descending, each unit at most once, no calendar units. A formatter can either
target that grammar exactly, or be a free-form human-readable renderer (`'1 hour, 30
minutes'`, `'1.5h'`, `'01:30:00'`). The two goals conflict: a renderer optimized for
reading aloud is not a string `parseDuration` accepts, and a library that ships both
invites the caller to pick the wrong one.

There is also a question of what happens below a second. `measure` returns fractional
milliseconds, so `formatDuration(measure(...).ms)` is the obvious pairing — and a 400 ms
operation has to become *something*.

**`normalizeError`.** A `catch` block in modern JavaScript receives `unknown`. The value is
usually an `Error`, but it can equally be a string, a rejected response object, `null`, a
symbol, or an object whose `message` getter throws. Every logger, error boundary, and
reporter therefore re-implements the same defensive shuffle — and each copy gets a
different subset right. The shuffle is also where error handling itself tends to break:
the reporter throws on the malformed value it exists to describe, and the original failure
is replaced by a `TypeError` from the reporter.

## Decision

**`formatDuration` targets the ADR-0009 grammar exactly, and the round-trip is the
contract.** Output is descending segments with zero-valued segments omitted, so
`parseDuration(formatDuration(ms)) === ms` holds for every whole number of seconds — and
is asserted as a property, not assumed. Sub-second remainders are **truncated**, with a
`'0s'` floor: a duration under a second reads as `0s` rather than rounding up to a second
that never elapsed. Fractional input is accepted precisely so `measure`'s output can be
handed straight over. Out-of-domain numbers — negative, non-finite, or beyond
`Number.MAX_SAFE_INTEGER` — throw `TypeError` under the ADR-0004 split, following the
`text.js` precedent that an out-of-range number is a programmer error.

**`normalizeError` maps any thrown value to one record shape and never throws.** The
record is `{ name, message, cause }` always, plus `stack`, `code`, `status`, and `detail`
**only when the value carried them** — absent rather than `undefined`, so `'status' in
record` means what it says and the record serializes cleanly. `name` is the value's own
`name`, else its constructor's name, else the capitalized `typeof` (`'String'`, `'Null'`),
so a log line always says what was thrown. Every property read goes through a guarded
accessor, because a hostile or exotic value must not defeat the function that exists to
describe it.

**`cause` is the original value, by identity** — not a copy, and not `error.cause`. This
makes the intended usage non-destructive: log the record, rethrow the original.

`status` is lifted from `status` or `statusCode`; `detail` from the first of `body`,
`data`, or `responseText`. Those cover this library's own `HttpError`, the Node/Express
convention, and the two dominant HTTP-client shapes.

## Alternatives Considered

- **A human-readable duration renderer** (`'1 hour 30 minutes'`, or `Intl.RelativeTimeFormat`).
  Friendlier output. Rejected as a *different function*: the value of this one is that its
  output is machine-readable by the parser already in the library. A localized renderer is
  a legitimate future addition under its own name, and would not be an inverse.
- **Round sub-second durations up to `'1s'`.** Avoids `'0s'`, which can read as "nothing
  happened". Rejected because the primary consumer is timing output, where reporting more
  time than elapsed is a lie, and because rounding breaks the truncation law that makes the
  round-trip statement precise (`reported ≤ elapsed < reported + 1s`).
- **Emit zero segments (`'1h0m0s'`)** for a fixed-width, sortable rendering. Rejected: it
  is not the canonical spelling ADR-0009 fixed, so it would round-trip in value but not in
  text, and `formatDuration(parseDuration(s)) === s` would fail for `'1h'`. Fixed-width
  sorting is what `/text`'s `fixedWidth` and `/net`'s key codec are for.
- **A `RangeError` for negative or oversized input.** Arguably the more precise built-in.
  Rejected for consistency: this codebase uses `TypeError` for every "wrong argument"
  case, including out-of-range integers in `text.js`, and one rule beats a taxonomy the
  caller has to remember.
- **`normalizeError` wraps into an `EglError` subclass** instead of a plain record. Fits
  the existing taxonomy and gives a real stack. Rejected because wrapping destroys the
  original's identity at exactly the moment it matters — the caller can no longer branch
  on `.code` without unwrapping — and because a record is what a logger, a JSON payload,
  and a test assertion all want. The plain object is also free of the dual-package
  `instanceof` hazard (ADR-0003).
- **Always include the optional fields as `undefined`** for a fixed record shape.
  Simpler to type. Rejected because `JSON.stringify` then drops them anyway while
  `Object.keys` reports them, and `'status' in record` stops distinguishing "absent" from
  "explicitly nothing".
- **Name a thrown primitive `'NonError'`.** Flags the anti-pattern loudly. Rejected as
  less informative: `'String'` says the same thing and also says *what* it was.
- **Cap `message` length.** Protects a log pipeline from a giant response body. Rejected
  as the caller's policy, not the normalizer's — truncating silently would hide the one
  detail someone is reading the log for. `/text`'s `truncate` is one call away.
- **Deep-clone `cause`** so the record is a stable snapshot. Rejected: it costs the
  identity the rethrow pattern depends on, and cloning an arbitrary thrown value can
  itself throw.

## Consequences

- `formatDuration` and `parseDuration` are a genuine inverse pair, and the property suite
  proves it over the whole domain plus monotonicity and the truncation bound. A future
  change to either has to keep the law or fail CI.
- `normalizeError` is total: the property suite hands it errors, primitives, symbols,
  circular objects, null-prototype objects, and throwing getters, and asserts it never
  throws, always returns a string `name`/`message`, and returns `cause` by identity.
- The idiomatic pattern is one line — `log.error(normalizeError(error)); throw error;` —
  which is what the private-codebase equivalent this replaces did in a helper that both
  logged *and* rethrew. Splitting them removes the hidden control flow and the logger
  coupling; the M10 logger will consume the record rather than produce it.
- **Tree-shaking lesson, learned the expensive way in this PR.** The descending unit list
  was first written as `Object.entries(UNITS).sort(...).map(...)` at module scope. A
  computed top-level expression is not statically analyzable as side-effect-free, so
  esbuild retained the whole `diagnostics` module in *every* root import: `httpClient`
  grew 86 B and broke its ADR-0015 budget row, which is how the regression was caught. It
  is now a literal array. **Module-scope constants in this library must be literals** —
  the size-limit per-function rows are what enforce it, and they only work if every public
  function has one.
- Root cost: +416 B (5104 B → 5520 B), against the frozen 6 kB NFR-01 ceiling. The row
  re-baselines to 5.85 kB per NFR-08. **Foreseeable crunch:** the wave's last root
  addition (F38 `createResource`, roadmap 9.6) is estimated at ~350 B, which lands the root
  near 5.87 kB — at that point the measured+6% rule exceeds the ceiling and the row must
  simply become 6 kB, with the wave-end tightening deciding the final number. Flagged now
  rather than discovered then.

## References

- Spec 02 §2 (F36-F37), §3 (NFR-08), §6 (round-trip and totality laws) — `docs/specs/02_spec_core_extensions.md`
- ADR-0009 (the duration grammar this inverts), ADR-0003 (typed errors and stable codes), ADR-0004 (error-contract split), ADR-0015 (budgets and documented exceptions)
- Implementation: `src/main/javascript/it/d4np/utils/diagnostics.js`; laws: `src/test/javascript/it/d4np/utils/diagnostics.property.test.js`
