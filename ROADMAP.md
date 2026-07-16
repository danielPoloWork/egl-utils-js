# Roadmap — egl-utils-js

The project's plan as a numbered, checkbox-driven list. When an item completes in a PR,
flip its checkbox (`- [ ]` → `- [x]`) **in the same PR**. New work goes at the bottom of
its section with a fresh `<milestone>.<task>` number; never renumber.

- **Versioning start:** pre-1.0 milestone-driven.
- **Session journal:** see [`docs/journal/`](docs/journal/). Latest checkpoint: _none yet_.

---

## Milestone 1 — Project bootstrap & CI

The thinnest slice that compiles, tests, and ships under the full quality bar.

- [ ] 1.1 Lay down the build system (tsup (esbuild) — dual ESM/CJS + .d.ts generated from JSDoc types (ADR-001)) and a buildable skeleton under
      `src/main/javascript/it/d4np/utils/`.
- [ ] 1.2 Wire the test framework (Vitest (+ fast-check property tests; Playwright browser smoke from M6)) with one passing smoke test under
      `src/test/javascript/it/d4np/utils/`.
- [ ] 1.3 Add formatter + linter configs (Prettier, ESLint (flat config) + tsc --noEmit with checkJs (JSDoc type-check)) at the repo root.
- [ ] 1.4 Stand up the CI matrix (Linux (Node.js 18, 20, 22)) with build + test + format + lint.
- [ ] 1.5 Seed the version constant (export const VERSION = 'X.Y.Z') in `version.js`.
- [ ] Wire the packaging gates on the day-zero exports map: publint, arethetypeswrong, size-limit budget skeleton, agadoo (NFR-01/02/06 enforcement from the first PR)


---

## Milestone 2 — Errors & async core

The typed error hierarchy and the five AbortSignal-first async combinators (spec §2 items 1-5)

- [ ] 2.1 errors module on 'egl-utils-js/errors': EglError base with stable .code + TimeoutError, RetryExhaustedError, AbortError re-export, HttpError, CloneError, StorageError, DurationParseError
- [ ] 2.2 delay + timeout on AbortSignal.timeout (underlying operation receives the signal)
- [ ] 2.3 retry with exponential backoff + full jitter; RetryExhaustedError{attempts, errors[]}
- [ ] 2.4 parallelLimit: fail-fast default with shared-signal abort; {settle: true} mode
- [ ] 2.5 asyncQueue: FIFO, onIdle()/size, abort drains pending with AbortError
- [ ] 2.6 fast-check property suites for combinator invariants; 95% coverage gate holds


---

## Milestone 3 — Data & validation

Pure data-manipulation and validation functions (spec §2 items 9-15)

- [ ] 3.1 deepClone: structuredClone wrapper with CloneError diagnostic pre-walk (ADR-002)
- [ ] 3.2 deepMerge: new-object merge, arrays replaced, {arrayMerge}; non-mutation property tests
- [ ] 3.3 pick/omit with JSDoc type-narrowing signatures
- [ ] 3.4 groupBy returning Map + uniq (SameValueZero, optional iteratee)
- [ ] 3.5 isObject/isEmpty type guards
- [ ] 3.6 validateEmail: linear-time practical subset, 64/255 length caps; ReDoS property test — 10^6 adversarial inputs < 1 ms each (NFR-05)


---

## Milestone 4 — Events

Typed event emitter and rate-limiting helpers (spec §2 items 6-8)

- [ ] 4.1 EventEmitter<EventMap>: on/once/off/emit, per-listener exception isolation via 'error'
- [ ] 4.2 debounce: trailing default, {leading, maxWait}, .cancel()/.flush()
- [ ] 4.3 throttle: one call per interval, .cancel()
- [ ] 4.4 fake-timer test suites for debounce/throttle edge cases


---

## Milestone 5 — Web, crypto & diagnostics

fetch/URL/crypto/timing/duration utilities (spec §2 items 16-20, 25)

- [ ] 5.1 httpClient: AbortController default+per-request timeouts merged with caller signals; auth() callback -> Bearer; JSON content-type handling; HttpError{status, body}
- [ ] 5.2 urlSearchParams: arrays as repeated keys, null/undefined skipped
- [ ] 5.3 uuid via Web Crypto (randomUUID/getRandomValues) + conditional-exports crypto shim (spec §1.1)
- [ ] 5.4 hashString: subtle.digest SHA-256/384/512, hex output
- [ ] 5.5 measure on performance.now() returning {result, ms}
- [ ] 5.6 parseDuration grammar + DurationParseError; fast-check grammar property test


---

## Milestone 6 — Storage & sanitize subpaths

Browser-leaning entries with real-browser CI (spec §2 items 21-24)

- [ ] 6.1 localStorageWrapper/sessionStorageWrapper with in-memory fallback and StorageError quota surfacing
- [ ] 6.2 cookieHelper: document.cookie with Secure/SameSite/Max-Age/Path; Node no-op warning
- [ ] 6.3 sanitizeHtml on 'egl-utils-js/sanitize': DOMPurify optional-peer delegation with curated default allowlist (ADR-003)
- [ ] 6.4 Playwright browser smoke jobs (Chromium/Firefox/WebKit) for storage/cookie/sanitize in CI
- [ ] 6.5 DOMPurify bypass-corpus snapshot tests for the default sanitize profile


---

## Milestone 7 — Benchmarks & release readiness

NFR enforcement at full strength and the first public release

- [ ] 7.1 vitest bench suites vs pinned lodash/p-limit/p-retry baselines (NFR-04)
- [ ] 7.2 nightly benchmark regression workflow (> 10% fail)
- [ ] 7.3 size-limit budgets tightened to final numbers (NFR-01) + shakeability scenario builds (NFR-02)
- [ ] 7.4 changesets release pipeline; npm publish --provenance from CI OIDC; lockfile-only + npm audit supply-chain gates
- [ ] 7.5 documentation pass: JSDoc API reference, README examples, sanitize non-goals in SECURITY.md
- [ ] 7.6 v0.1.0 release readiness review



---

## Spec Coverage Map

Tracks which spec section is fulfilled by which roadmap item(s). Every spec section has a
row with at least one fulfilling item and a status glyph. Legend: ⏳ not started · 🚧 in
progress · ✅ done · ❎ N/A.

| Spec § | Requirement | Roadmap items | Status |
|--------|-------------|---------------|--------|
| §1 | Objective & business context | 1.1 | ⏳ |
| §2 | Functional requirements | 1.1, 1.2 | ⏳ |
| §3 | Non-functional requirements | 1.3, 1.4 | ⏳ |
| §4 | Logical architecture | 1.1 | ⏳ |
| §5 | Public interface | 1.2 | ⏳ |
| §6 | Verification & test strategy | 1.2, 1.4 | ⏳ |
