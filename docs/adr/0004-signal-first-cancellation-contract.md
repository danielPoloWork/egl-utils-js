# ADR-0004: Signal-first cancellation contract for async combinators

- **Status:** Accepted
- **Date:** 2026-07-20
- **Deciders:** Daniel Polo (owner), agent (tech-lead persona)
- **Related:** ADR-0003 (error taxonomy), spec §2 items 1–5 and §3, ROADMAP 2.2 (template for 2.3–2.5)

## Context

All five async combinators (`delay`, `timeout`, `retry`, `parallelLimit`, `asyncQueue`)
accept `AbortSignal` cancellation (spec §2/§3). The first implementation fixes the template
the rest copy, so the contract must be decided once: what a cancelled combinator rejects
with, whether work starts on an already-aborted signal, who cleans up listeners and timers,
and how `timeout` hands its deadline to the underlying operation — the spec explicitly
requires that "the underlying operation receives the signal so it can actually stop, not
just be abandoned" (a v1 defect it calls out). Two platform constraints shape the answer:
the runtime floor is Node ≥ 18, which has `AbortSignal.timeout` but **not**
`AbortSignal.any` (added in Node 20.3), and long-lived caller signals must not accumulate
listeners from settled combinators (the leak class `--detectOpenHandles` exists for).

## Decision

Every async API takes an optional trailing options bag with `signal`. On cancellation it
rejects with the library's `AbortError` (`EGL_ABORT`) carrying `cause = signal.reason`; on
a pre-aborted signal it rejects immediately and starts no work. Invalid arguments throw
native `TypeError` — programmer errors use platform types, only operational failures use
the EglError taxonomy. Every listener and timer a combinator installs is removed when it
settles, and late failures of an already-decided operation are absorbed so they never
surface as unhandled rejections. `timeout` is built on `AbortSignal.timeout`, merged with
the caller's signal by an **internal `anySignal` helper** (not the native `AbortSignal.any`,
absent on the Node 18 floor); its primary input shape is a **task function
`(signal) => promise`** that receives the merged signal so the operation can genuinely
stop, with a bare promise accepted as a documented abandon-only convenience.

## Alternatives Considered

- **Reject with `signal.reason` directly** (what `await fetch` does) — closest to the
  platform. Rejected: the rejection type then depends on what the caller aborted with,
  losing the stable `EGL_ABORT` code that is the taxonomy's whole point; the reason is
  preserved as `cause` instead.
- **Native `AbortSignal.any` with feature detection** — less code where available.
  Rejected: unavailable on Node 18, and a feature-detect branch splits behavior and
  coverage across CI matrix cells; one code path is uniform and fully testable. Revisit
  when the floor moves to Node ≥ 20.
- **`timeout(promise, ms)` only (bare-promise input)** — the spec's literal F2 signature.
  Rejected as the *primary* shape: an in-flight promise cannot receive a signal, which
  reintroduces exactly the abandon-only defect the spec calls out; the task-function form
  is primary and the bare promise remains a convenience.
- **Skipping listener cleanup** (rely on `{ once: true }`) — simpler. Rejected: `once`
  only fires-and-forgets on abort; a combinator that settles *without* abort would leave
  its listener on the caller's long-lived signal — the accumulation leak.

## Consequences

- `retry`, `parallelLimit`, and `asyncQueue` (2.3–2.5) inherit the contract: same options
  bag, same rejection semantics, same cleanup discipline, and `anySignal` is available for
  their internal signal merging.
- Consumers get one predictable idiom: `err.code === 'EGL_ABORT'` for cancellation,
  `err.code === 'EGL_TIMEOUT'` for deadlines, `err.cause` for the platform-level reason.
- The unhandled-rejection absorption means a timed-out operation's own abort error is
  intentionally silent once the `TimeoutError` has been delivered — documented, and the
  behavior is contract-tested.
- Cost: `anySignal` is ~20 lines of owned code until the Node 20 floor allows native
  `AbortSignal.any`; the task-function input makes `timeout`'s type a union (function or
  promise), which the JSDoc types make explicit.
- Testing note: `AbortSignal.timeout` is not interceptable by fake timers on Node, so
  `timeout`'s suites use real short timers; `delay` uses fake timers.

## References

- Spec §2 items 1–2 (delay/timeout), §3 (cancellation column), §1.1 (runtime floor).
- ADR-0003 (stable codes; `cause` chaining), ADR-001 (.spec — dual-package identity).
- Node.js `AbortSignal.any` availability (v20.3.0) — the floor constraint.
