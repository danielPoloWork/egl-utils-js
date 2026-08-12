# ADR-0053: The whole error taxonomy reaches the root, and spec 01 §5 says what it covers

- **Status:** Accepted
- **Date:** 2026-08-12
- **Deciders:** Daniel Polo (owner), agent (senior project architect persona)
- **Related:** ROADMAP 17.12, `docs/releases/v1.0.0-readiness-review.md` §3.2, §3.4 (the
  findings that filed this item), ADR-0003 (the taxonomy's original contract), ADR-0018 and
  ADR-0052 (the two prior root-export additions this follows the same procedure as)

## Context

The 17.1 readiness review found two documentation gaps, both additive, both filed as one
item because both are about a spec no longer describing what the code does.

**Finding 1 — the root re-exports 8 of the library's 10 error classes.** `egl-utils-js/errors`
exports `EglError`, `TimeoutError`, `AbortError`, `RetryExhaustedError`, `HttpError`,
`CloneError`, `StorageError`, `DurationParseError`, `DomContractError`, `PeerMissingError`.
The root re-exports every one of the first eight. `DomContractError` (added when `/dom`
shipped, spec 03 F43) and `PeerMissingError` (added when `/bootstrap` shipped, spec 04 F68)
are missing. Both ADR-0003 and `index.js`'s own module comment say the taxonomy *is*
re-exported from the root — a clause the code has not honoured since the second of those two
classes was added, three milestones ago, with nothing catching the drift because nothing
checks it.

**Finding 2 — spec 01 §5 is silently stale as a description of "the public interface."**
It enumerates the 23 root exports and 7 error classes that were the whole surface when spec
01 was written. Both counts are frozen accurately — the F1–F25 items have not changed — but
the section reads as *the* public interface rather than *spec 01's slice of it*, and the
root has grown to 36 exports (ADR-0018's `VERSION`, spec 02's `formatDuration`/
`normalizeError`/`createResource`, ADR-0052's `withUrlParams`) with nothing in spec 01
saying so.

## Decision

**1. Honour ADR-0003: re-export `DomContractError` and `PeerMissingError` from the root.**
The clause's own reasoning — a consumer catching any `egl-utils-js` error should have one
import source rather than a second path for classes added after their first read of the
docs — does not depend on which entry throws the error. A root-only consumer who never
imports `/dom` can still receive a `DomContractError` indirectly (composed code, a library
built on this one, error logging that re-throws) and gains nothing from being unable to
`instanceof`-narrow it without a second import. Amending the clause to exclude these two was
considered and rejected: it would carve an exception into a contract stated as unconditional,
for a saving of a few dozen bytes, the same trade ADR-0018 already rejected for `VERSION`.

**2. Scope spec 01 §5 explicitly, rather than rewriting its enumeration.** A note now states
that the root and error-class lists are spec 01's own F1–F25 surface as originally written,
not the current one, and points to specs 02–04's own §5 sections (which already use `+=`
notation for their additions) and to roadmap 17.3's generated reference as the place a
current, complete list belongs. Rewriting the frozen counts in place was rejected: spec 01 is
the historical record of what F1–F25 committed to, and renumbering it to match today's count
would make a future diff between "the F1–F25 promise" and "the surface today" unreadable —
exactly the comparison a freeze exists to keep possible.

## Alternatives Considered

- **Leave the two classes off the root, document the exception.** Rejected per the
  reasoning above — it treats a maintenance gap as a decision after the fact, and the two
  classes cost less to add than to explain away.
- **Move all error re-exports to a lazy/dynamic mechanism** so the list can never drift
  again. Rejected: the taxonomy is ten small classes; a dynamic re-export mechanism is
  more code and more indirection than the problem (a missed line in a hand-maintained list)
  justifies, and it would be the only export on the root built that way.
- **Rewrite spec 01 §5's counts to the current numbers.** Rejected in §2 above: it erases
  the frozen record the surrounding specs already build on (spec 02 §5 references "F1–F25
  unchanged" as a fixed point).
- **Delegate entirely to roadmap 17.3's generated reference now, dropping the manual list.**
  Rejected as premature: 17.3 has not landed, and spec 01 §5 would then describe nothing at
  all until it does. The scope note points at 17.3 without depending on it.

## Consequences

- Root entry named-export count grows by two, to 38 (36 after ADR-0052, plus these two
  classes); `default` stays absent.
- **NFR-01's root full-import ceiling is amended a second time within M17**, from 6.05 kB
  (ADR-0052) to **6.1 kB**: measured 6072 B, a further 70 B over the ADR-0052 ceiling. Two
  amendments to the same clause in one milestone is a direct consequence of the root
  absorbing what two earlier waves left off it, not evidence the gate is loose — both
  additions were measured and sized before merging.
- `errors.test.js` gains an assertion that every class exported from `egl-utils-js/errors`
  is also reachable from the root, keyed off the module's own export list rather than a
  hand-copied array — so a future eleventh class that misses the root re-export fails a
  test immediately, the way `version.test.js` already does for `VERSION` (ADR-0018).
- Spec 01 §5's F1–F25 enumeration is otherwise untouched — no historical count changes, only
  a note above it stating what it does and does not describe.

## References

- ROADMAP 17.12; `docs/releases/v1.0.0-readiness-review.md` §3.2, §3.4.
- ADR-0003 (the original re-export clause), ADR-0018 (`VERSION`'s addition — same
  procedure), ADR-0052 (`withUrlParams`'s addition — the first NFR-01 amendment this one
  stacks on).
- Spec 01 §5; spec 03 §2 F43 (`DomContractError`); spec 04 §2 F68 (`PeerMissingError`).
