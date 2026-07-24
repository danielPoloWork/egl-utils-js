# ADR-0009: parseDuration — a strict, ordered h/m/s grammar, no calendar units

- **Status:** Accepted
- **Date:** 2026-07-24
- **Deciders:** Daniel Polo (owner), agent (tech-lead persona)
- **Related:** spec §2 item 25 (F25), ADR-0004 (TypeError vs domain-error split), ADR-0005 (hand-rolled scan precedent), ROADMAP 5.6

## Context

`parseDuration` turns a human-written duration string into milliseconds. The spec (F25)
fixes the shape by example — `"2h" | "30m" | "5s" | "1h30m"` — and one hard guarantee:
invalid input **always throws `DurationParseError`, never returns `NaN`**. Everything else
(which units, whether segments may repeat or be reordered, case sensitivity, decimals,
overflow behavior) is left to design, and the choices are not obvious: duration
mini-languages in the wild disagree on all of them, and several common conventions are
actively dangerous (`M` for minutes vs months; silent `NaN`/`Infinity` on overflow).

## Decision

A **strict grammar**, parsed by a hand-rolled single-pass scan (no regex — the ADR-0005
house style; linearity by construction, precise positional error messages):

```
duration := ws? segment+ ws?
segment  := integer unit
integer  := DIGIT+            ; unsigned decimal, no sign, no decimal point
unit     := 'h' | 'm' | 's'   ; hours | minutes | seconds, lowercase only
```

with three rules beyond the raw grammar:

1. **Strictly descending, non-repeating units** (`h` > `m` > `s`): `'1h30m'` is valid,
   `'30m1h'` and `'1h1h'` are not. This gives every representable value exactly one legal
   spelling and turns transposition/duplication typos into errors instead of silent
   misreadings.
2. **Lowercase only**, because the minute/month collision is real: many libraries read `M`
   as months and `m` as minutes. Rejecting uppercase removes the ambiguity at the door
   rather than resolving it silently.
3. **Safe-integer ceiling**: after each segment the running total is checked with
   `Number.isSafeInteger`; overflow throws `DurationParseError`, never returns `Infinity`
   or a precision-lost float — an extension of F25's "never `NaN`" promise to "never a
   quietly wrong number".

Unit set is **h/m/s only**. `d`/`w`/`y` (calendar units) are excluded because their
millisecond value is not constant (DST, leap seconds/years) — a fixed multiplier would be
a lie; callers who want "days" should say `24h` and own that assumption. `ms` is excluded
because a millisecond-granularity token on a millisecond-valued output invites `'100ms'` vs
`'100m'+'s'` confusion for no real ergonomic gain.

Consistent with ADR-0004's split: **non-string input is a `TypeError`** (a programmer
error), while a malformed *string* is a `DurationParseError` (a domain outcome the caller
is expected to handle). The error carries `cause: { input, position? }` for diagnostics.

## Consequences

- One canonical spelling per value makes the function easy to reason about and test; the
  grammar round-trip property (render → parse) is a clean law.
- Callers migrating from lenient parsers (`'1.5h'`, `'2 h'`, `'1H'`, `'5d'`) get a loud
  failure rather than a surprising number — intentional, and the error message names the
  offending position.
- No dependency, no regex, linear time; the scan mirrors `validateEmail`'s structure
  (ADR-0005) so the two are reviewable the same way.
- If calendar units or fractional values are ever wanted, that is a **new ADR** superseding
  this one, not a quiet loosening — the strictness is a documented contract.

## Alternatives considered

- **A regex grammar** (`/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/`) — compact and order-
  enforcing. Rejected for consistency with ADR-0005 (the library parses untrusted-ish
  strings with hand scans, not patterns) and because the empty-match case (`''` satisfies
  all-optional) needs special handling anyway, and positional error messages are far
  clearer from a scan.
- **Lenient parsing** (case-insensitive, any order, repeats summed, whitespace, decimals) —
  friendlier to sloppy input but multiplies the ways a typo becomes a silently wrong
  duration; the opposite of F25's fail-loud intent.
- **Including `d`/`w`/`y`** — convenient but semantically false at fixed multipliers; a
  duration library must not pretend a day is always 86 400 000 ms.
- **Clamping or returning `Infinity` on overflow** — rejected; a wrong-but-finite duration
  silently scheduling a timer 292 million years out is worse than a throw.
