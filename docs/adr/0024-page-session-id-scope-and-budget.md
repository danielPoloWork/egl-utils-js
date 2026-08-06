# ADR-0024: `pageSessionId` — a correlation id, not a credential, and the 2 kB `/storage` clause it breaks

- **Status:** Accepted
- **Date:** 2026-08-06
- **Deciders:** Daniel Polo (owner), agent (tech-lead persona)
- **Related:** spec 02 §2 (F39), §3 (NFR-08); spec 01 §3 (NFR-01, `/storage` clause — **amended by this ADR**); ADR-0008 (Web Crypto only, never `Math.random`), ADR-0010 (the storage in-memory fallback contract), ADR-0015 (documented budget divergences), ROADMAP 9.5

## Context

Correlating a user's log lines, telemetry events, and requests within one browsing session
needs an identifier with a specific and unusual scope: stable across reloads and in-page
navigation, distinct per tab, and gone when the tab closes. `sessionStorage` has exactly
those semantics, which is why the pattern keeps being reinvented per application — and
reinvented subtly wrong, most often by seeding it from `Math.random` or by letting a
storage failure throw out of a diagnostics path.

Two questions had to be answered here, and the second one turned out to cost a frozen NFR.

1. **What is this identifier allowed to be used for?** An opaque, unguessable,
   per-tab string looks a great deal like a session token. It is not one, and the
   difference has to be stated where someone will read it.
2. **Where does the entropy come from, and what does that cost?** ADR-0008 centralizes
   CSPRNG identifier generation in `uuid` precisely so no module reinvents it. But
   `/storage` had never imported the crypto entry before, and spec 01's NFR-01 caps that
   entry at 2 kB.

## Decision

**`pageSessionId` is a correlation id and explicitly not a credential.** It is unguessable
because it comes from the platform CSPRNG (ADR-0008 — a v4 `uuid`), but nothing about it
is authenticated and any script on the page can read it. The JSDoc says so in those words.
It is never sent, never validated, and never grants anything.

**It reuses `uuid`.** Duplicating identifier generation inside `storage.js` to avoid the
import was rejected: ADR-0008 exists so that exactly one place in this library decides how
random bytes become an identifier.

**Degradation is silent and total.** Where the store is unavailable or blocked (Node,
private browsing, a sandboxed iframe) the ADR-0010 in-memory fallback takes over and the
id is stable only for the life of the realm — so a reload mints a new one. A stored value
that cannot be read back, or a write the store refuses, is absorbed rather than thrown:
a diagnostics helper must never be the reason a page breaks. `isPersistent()` on the
wrapper is how a caller can tell which mode is in force.

**The `/storage` NFR-01 clause moves from 2 kB to 2.1 kB**, with the divergence recorded in
spec 01 §3 alongside the ADR-0015 precedent. Measured:

| Scenario | Before F39 | After F39 |
|---|---|---|
| `/storage` full import | 1706 B | **2027 B** |
| the three original wrappers only | 1706 B | **1698 B** |
| `pageSessionId` alone | — | 888 B |
| `uuid` alone (from the root) | 292 B | 292 B |

The clause is breached by **27 B**, and only by the scenario that imports all four exports.
A consumer of the wrappers alone pays *8 B less* than before. That scenario is now a
permanent size-limit row, so if tree-shaking ever regresses and the cost does start
reaching non-users, CI fails.

## Alternatives Considered

- **Reimplement UUID generation inside `storage.js`** to stay under 2 kB. Rejected: it
  duplicates a security-sensitive function that ADR-0008 deliberately centralizes, for
  27 B on a scenario few consumers run. Two copies of an entropy path is how one of them
  eventually gets a `Math.random` fallback added "just for tests".
- **Require the caller to inject an id factory** (`pageSessionId({ newId: uuid })`).
  Keeps `/storage` clean of the crypto import. Rejected because it makes the 95% case
  ceremonial and pushes the ADR-0008 decision onto every caller — the one thing that
  decision exists to prevent. The `storage` option remains injectable for tests, which is
  the seam that actually earns its keep.
- **Put `pageSessionId` on the root entry**, which already imports `uuid`, so the marginal
  cost would be ~150 B. Rejected on two counts: it is browser-leaning, and spec 01 §4
  keeps browser-leaning code off the root; and the root has ~440 B of ceiling headroom
  with F38 still to land.
- **Give it its own entry** (`egl-utils-js/session`). Rejected: a four-file wiring
  quadruple, a doc section, and a budget row for one function, which would then still
  import the same crypto chunk.
- **Load crypto lazily** (`await import('./crypto.js')`). Rejected: it makes the function
  `async`, which contradicts F39's signature and turns a synchronous log-line decoration
  into a promise.
- **Use `localStorage` instead**, so the id survives tab closes. Rejected: that is a
  different identifier with different privacy implications — a browser-lifetime id
  correlates a person across sessions, which is exactly what this deliberately does not
  do. A caller who wants it can pass `localStorageWrapper` as `storage` and own that
  decision explicitly.
- **Memoize the id in a module-level variable** to save a storage read per call.
  Rejected: module-level mutable state is what the dual-package hazard rule (spec 01 §4)
  keeps out of this library, and the store is the source of truth anyway.
- **Throw when the value in the store is corrupt.** Rejected — see the degradation rule
  above; the caller of a correlation-id helper has no useful recovery for that.

## Consequences

- The id behaves as promised in a real browser — survives reload, differs per tab, absent
  from `localStorage` — and that is asserted in the Playwright suite, because it is the one
  claim Node cannot check: every Node test sees the in-memory fallback, where a "reload"
  is a fresh realm and there are no tabs.
- Cost: in Node and private browsing the "stable per tab" promise silently weakens to
  "stable per realm". Silent is deliberate (the alternative is throwing in a diagnostics
  path), and `isPersistent()` makes it observable for callers who care.
- Cost: `/storage` full-entry consumers pay 329 B more. The wrappers-only row is the
  evidence, and the guard, that this stays confined to people who use the feature.
- A shared `crypto` chunk now exists in `dist/`, since both the root and `/storage` import
  it. Packaging gates (`publint`, `attw`, `agadoo`, the per-function rows) all pass with it,
  and it is what stops the crypto code from being emitted twice.
- Anyone tempted to use the id as a session token has to ignore a JSDoc paragraph, an ADR
  section, and a README line that all say it is not one.

## References

- Spec 02 §2 (F39), §3 (NFR-08) — `docs/specs/02_spec_core_extensions.md`
- Spec 01 §3 (NFR-01, `/storage` clause amended here), §4 (browser-leaning code stays off the root) — `docs/specs/01_spec_utils.md`
- ADR-0008 (Web Crypto only), ADR-0010 (in-memory fallback), ADR-0015 (the documented-divergence precedent this follows)
- Implementation: `src/main/javascript/it/d4np/utils/storage.js`; browser proof: `src/test/browser/smoke.spec.js`
