# Roadmap — egl-utils-js

The project's plan as a numbered, checkbox-driven list. When an item completes in a PR,
flip its checkbox (`- [ ]` → `- [x]`) **in the same PR**. New work goes at the bottom of
its section with a fresh `<milestone>.<task>` number; never renumber.

- **Versioning start:** pre-1.0 milestone-driven.
- **Session journal:** see [`docs/journal/`](docs/journal/). Latest checkpoint: _none yet_.

## Model & effort routing

Each item carries an advisory route `(route: <tier>/<effort>[ — signal])` — the model tier
and reasoning effort recommended to implement it, per the EADOS routing policy
(`.eados-core/orchestrator/os/routing/routing.yaml`, ADR-0017). Tiers, cheapest → most
capable: `fast` → `standard` → `frontier-reasoning`; efforts: `low` → `medium` → `high` →
`max`. Catalog (as of 2026-07-09, host claude-code): `frontier-reasoning` = Fable 5,
`standard` = Opus 4.8, `fast` = Sonnet 5 — model names live only in that dated catalog, so
model churn never edits this file's policy meaning.

Signals that raise a route above the floor: **security** (a subtle miss costs more than the
routing saving), **sets-pattern** (first of its class — fixes the template every follower
copies; the followers then route cheaper), **decision-heavy** (the decision is the
deliverable). Routes here are static advice derived from those rules; they are
**advisory — the human keeps final model authority**, and the authoritative per-issue call
is computed at delivery time from the issue's labels/flags via
`python .eados-core/tools/route_advice.py --issue <N>` (or `--milestone "MN — <name>"`).

---

## Milestone 1 — Project bootstrap & CI

The thinnest slice that compiles, tests, and ships under the full quality bar.

- [x] 1.1 Lay down the build system (tsup (esbuild) — dual ESM/CJS + .d.ts generated from JSDoc types (ADR-001)) and a buildable skeleton under
      `src/main/javascript/it/d4np/utils/`. _(route: frontier-reasoning/high — sets-pattern: the exports map and dual-build shape every later item inherits; dual-package hazard lives here)_
- [x] 1.2 Wire the test framework (Vitest (+ fast-check property tests; Playwright browser smoke from M6)) with one passing smoke test under
      `src/test/javascript/it/d4np/utils/`. _(route: standard/medium)_
- [x] 1.3 Add formatter + linter configs (Prettier, ESLint (flat config) + tsc --noEmit with checkJs (JSDoc type-check)) at the repo root. _(route: fast/low)_
- [x] 1.4 Stand up the CI matrix (Linux (Node.js 18, 20, 22)) with build + test + format + lint. _(route: standard/medium)_
- [x] 1.5 Seed the version constant (export const VERSION = 'X.Y.Z') in `version.js`. _(route: fast/low)_
- [x] Wire the packaging gates on the day-zero exports map: publint, arethetypeswrong, size-limit budget skeleton, agadoo (NFR-01/02/06 enforcement from the first PR) _(route: standard/high — a misconfigured gate silently passing is false security)_


---

## Milestone 2 — Errors & async core

The typed error hierarchy and the five AbortSignal-first async combinators (spec §2 items 1-5)

- [x] 2.1 errors module on 'egl-utils-js/errors': EglError base with stable .code + TimeoutError, RetryExhaustedError, AbortError re-export, HttpError, CloneError, StorageError, DurationParseError _(route: frontier-reasoning/high — sets-pattern: the failure taxonomy every module builds on; cross-realm .code identity is API design)_
- [x] 2.2 delay + timeout on AbortSignal.timeout (underlying operation receives the signal) _(route: frontier-reasoning/high — sets-pattern: fixes the signal-first combinator template items 2.3–2.5 copy)_
- [x] 2.3 retry with exponential backoff + full jitter; RetryExhaustedError{attempts, errors[]} _(route: standard/high)_
- [x] 2.4 parallelLimit: fail-fast default with shared-signal abort; {settle: true} mode _(route: standard/high)_
- [x] 2.5 asyncQueue: FIFO, onIdle()/size, abort drains pending with AbortError _(route: standard/high)_
- [x] 2.6 fast-check property suites for combinator invariants; 95% coverage gate holds _(route: frontier-reasoning/high — sets-pattern: the property-suite template M3/M5 suites copy)_


---

## Milestone 3 — Data & validation

Pure data-manipulation and validation functions (spec §2 items 9-15)

- [x] 3.1 deepClone: structuredClone wrapper with CloneError diagnostic pre-walk (ADR-002) _(route: standard/high)_
- [x] 3.2 deepMerge: new-object merge, arrays replaced, {arrayMerge}; non-mutation property tests _(route: standard/medium)_
- [x] 3.3 pick/omit with JSDoc type-narrowing signatures _(route: standard/medium)_
- [ ] 3.4 groupBy returning Map + uniq (SameValueZero, optional iteratee) _(route: fast/medium)_
- [ ] 3.5 isObject/isEmpty type guards _(route: fast/low)_
- [ ] 3.6 validateEmail: linear-time practical subset, 64/255 length caps; ReDoS property test — 10^6 adversarial inputs < 1 ms each (NFR-05) _(route: frontier-reasoning/high — security: ReDoS resistance is the deliverable)_


---

## Milestone 4 — Events

Typed event emitter and rate-limiting helpers (spec §2 items 6-8)

- [ ] 4.1 EventEmitter<EventMap>: on/once/off/emit, per-listener exception isolation via 'error' _(route: frontier-reasoning/high — sets-pattern: the hardest JSDoc-generics surface in the library; typed-API template)_
- [ ] 4.2 debounce: trailing default, {leading, maxWait}, .cancel()/.flush() _(route: standard/high — leading/maxWait interplay is classically bug-prone)_
- [ ] 4.3 throttle: one call per interval, .cancel() _(route: standard/medium)_
- [ ] 4.4 fake-timer test suites for debounce/throttle edge cases _(route: fast/medium)_


---

## Milestone 5 — Web, crypto & diagnostics

fetch/URL/crypto/timing/duration utilities (spec §2 items 16-20, 25)

- [ ] 5.1 httpClient: AbortController default+per-request timeouts merged with caller signals; auth() callback -> Bearer; JSON content-type handling; HttpError{status, body} _(route: frontier-reasoning/high — security: Authorization handling and the no-token-storage contract)_
- [ ] 5.2 urlSearchParams: arrays as repeated keys, null/undefined skipped _(route: fast/low)_
- [ ] 5.3 uuid via Web Crypto (randomUUID/getRandomValues) + conditional-exports crypto shim (spec §1.1) _(route: frontier-reasoning/high — security: entropy source correctness on both runtimes)_
- [ ] 5.4 hashString: subtle.digest SHA-256/384/512, hex output _(route: frontier-reasoning/high — security)_
- [ ] 5.5 measure on performance.now() returning {result, ms} _(route: fast/low)_
- [ ] 5.6 parseDuration grammar + DurationParseError; fast-check grammar property test _(route: standard/medium)_


---

## Milestone 6 — Storage & sanitize subpaths

Browser-leaning entries with real-browser CI (spec §2 items 21-24)

- [ ] 6.1 localStorageWrapper/sessionStorageWrapper with in-memory fallback and StorageError quota surfacing _(route: standard/medium)_
- [ ] 6.2 cookieHelper: document.cookie with Secure/SameSite/Max-Age/Path; Node no-op warning _(route: frontier-reasoning/high — security: cookie attribute defaults are security posture)_
- [ ] 6.3 sanitizeHtml on 'egl-utils-js/sanitize': DOMPurify optional-peer delegation with curated default allowlist (ADR-003) _(route: frontier-reasoning/max — security + foundational: the curated allowlist is the library's security promise)_
- [ ] 6.4 Playwright browser smoke jobs (Chromium/Firefox/WebKit) for storage/cookie/sanitize in CI _(route: standard/medium)_
- [ ] 6.5 DOMPurify bypass-corpus snapshot tests for the default sanitize profile _(route: frontier-reasoning/high — security: validates the sanitize promise against known bypasses)_


---

## Milestone 7 — Benchmarks & release readiness

NFR enforcement at full strength and the first public release

- [ ] 7.1 vitest bench suites vs pinned lodash/p-limit/p-retry baselines (NFR-04) _(route: standard/high — fair-comparison methodology is the hard part)_
- [ ] 7.2 nightly benchmark regression workflow (> 10% fail) _(route: standard/medium)_
- [ ] 7.3 size-limit budgets tightened to final numbers (NFR-01) + shakeability scenario builds (NFR-02) _(route: standard/medium)_
- [ ] 7.4 changesets release pipeline; npm publish --provenance from CI OIDC; lockfile-only + npm audit supply-chain gates _(route: frontier-reasoning/high — security: supply-chain and provenance surface)_
- [ ] 7.5 documentation pass: JSDoc API reference, README examples, sanitize non-goals in SECURITY.md _(route: fast/medium)_
- [ ] 7.6 v0.1.0 release readiness review _(route: standard/high — verification review; the release decision itself stays with the owner)_



---

## Spec Coverage Map

Tracks which spec section is fulfilled by which roadmap item(s). Every spec section has a
row with at least one fulfilling item and a status glyph. Legend: ⏳ not started · 🚧 in
progress · ✅ done · ❎ N/A.

| Spec § | Requirement | Roadmap items | Status |
|--------|-------------|---------------|--------|
| §1 | Objective & business context | 1.1 | 🚧 |
| §2 | Functional requirements | 1.1, 1.2, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3 | 🚧 |
| §3 | Non-functional requirements | 1.3, 1.4, 2.6 | 🚧 |
| §4 | Logical architecture | 1.1 | 🚧 |
| §5 | Public interface | 1.2, 2.1, 3.1, 3.2, 3.3 | 🚧 |
| §6 | Verification & test strategy | 1.2, 1.4, 2.6 | 🚧 |
