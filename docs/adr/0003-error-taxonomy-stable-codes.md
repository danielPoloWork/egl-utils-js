# ADR-0003: Error taxonomy — stable codes over cross-realm instanceof

- **Status:** Accepted
- **Date:** 2026-07-20
- **Deciders:** Daniel Polo (owner), agent (tech-lead persona)
- **Related:** ADR-001 (.spec, dual ESM/CJS build), ADR-002 (.spec, deepClone), spec §3 (API contract), ROADMAP 2.1

## Context

Every module group throws typed failures (spec §3): `TimeoutError`, `RetryExhaustedError`,
`AbortError`, `HttpError`, `CloneError`, `StorageError`, `DurationParseError`. The dual
ESM/CJS build (ADR-001) creates the classic dual-package hazard: a dependency tree can load
both the ESM and the CJS instance of this library, and an error constructed by one instance
is **not** `instanceof` the class object exported by the other. The same applies inside a
single package install: entry points are bundled per format, so a root-entry consumer and a
`/errors`-subpath consumer on different formats hold different class objects. The error
identity mechanism is therefore a load-bearing API decision, made once here and inherited
by every module milestone (M2–M7). A second force: aborts. The platform signals cancellation
with a `DOMException` named `'AbortError'`, and ecosystem code detects aborts via
`err.name === 'AbortError'` — the library's own abort failure must not break that idiom.

## Decision

One base class, `EglError extends Error`, and one concrete class per failure, each carrying
a **stable machine-readable `code`** (`EGL_TIMEOUT`, `EGL_RETRY_EXHAUSTED`, `EGL_ABORT`,
`EGL_HTTP`, `EGL_CLONE`, `EGL_STORAGE`, `EGL_DURATION_PARSE`; base `EGL_ERROR`). The
documented identity contract is `code` (or `name`), never cross-realm `instanceof`; the
codes are public API and renaming one is a breaking change. Class-specific payloads travel
in a required `details` bag merged with `ErrorOptions` (`RetryExhaustedError{attempts,
errors[]}`, `HttpError{status, body?}`, `CloneError{path, valueType}`); simple classes take
`(message?, options?)`. `AbortError` is a real class in the taxonomy whose `name` follows
the DOM convention (`'AbortError'`), so ecosystem-style name checks recognize both it and
platform `DOMException` aborts. The classes are exported from `egl-utils-js/errors` and
re-exported from the root entry (spec §6 imports `TimeoutError` from the root).

## Alternatives Considered

- **`instanceof`-only identity** — the natural OO answer. Rejected: silently wrong under
  the dual-package hazard ADR-001 explicitly accepts; the failure mode (a catch block that
  stops matching) is invisible until production.
- **Reuse the platform's `DOMException('…', 'AbortError')` instead of an `AbortError`
  class** — closest to the platform. Rejected: `DOMException` carries no stable `EGL_*`
  code, cannot carry a `cause` on all supported runtimes' constructors, and would be the
  one taxonomy member with different construction and identity semantics; the DOM
  *convention* is preserved via `name` instead.
- **Factory functions returning plain `Error`s with a `code` property** (Node-core style)
  — smallest surface. Rejected: loses `instanceof EglError` for the common same-realm case,
  and JSDoc-typed classes give consumers narrowed payload types (`err.status`, `err.path`)
  that plain factories obscure.
- **Positional payload constructors** (`new HttpError(status, body, message)`) — terser.
  Rejected: inconsistent arity across the taxonomy, unreadable at call sites, and closed to
  additive evolution; the `details` bag keeps every constructor `(message, details?)`.

## Consequences

- Every later module (retry, httpClient, deepClone, storage, parseDuration) constructs
  errors from this taxonomy instead of inventing its own — the sets-pattern payoff.
- Consumers get one documented idiom: `'code' in err && err.code === 'EGL_…'`; the JSDoc
  types give same-realm consumers full payload typing.
- The `EGL_*` code registry is frozen public API: additions are minor, renames are major.
  The SemVer surface (spec §5) now explicitly includes codes.
- Cross-realm behavior is contract-tested (a foreign-realm simulation asserts `instanceof`
  fails where `code` matching succeeds), so the hazard stays visible in the suite.
- Cost: own `name`/`code` fields per instance (a few bytes each) and the discipline of
  routing every new failure through this module — enforced at review.

## References

- Spec §3 (API contract summary), §5/§6 (public interface & example imports).
- ADR-001 (.spec/d4np_js_adr_001_build_strategy.md) — dual-package hazard acceptance.
- Node.js error-code convention (`err.code`) as prior art for stable machine identities.
