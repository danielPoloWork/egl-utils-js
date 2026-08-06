# Roadmap — egl-utils-js

The project's plan as a numbered, checkbox-driven list. When an item completes in a PR,
flip its checkbox (`- [ ]` → `- [x]`) **in the same PR**. New work goes at the bottom of
its section with a fresh `<milestone>.<task>` number; never renumber.

- **Versioning start:** pre-1.0 milestone-driven.
- **Session journal:** see [`docs/journal/`](docs/journal/). Latest checkpoint:
  [`2026-08-06 — createResource, and M9 complete`](docs/journal/2026/08/2026-08-06-create-resource.md).

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
- [x] 3.4 groupBy returning Map + uniq (SameValueZero, optional iteratee) _(route: fast/medium)_
- [x] 3.5 isObject/isEmpty type guards _(route: fast/low)_
- [x] 3.6 validateEmail: linear-time practical subset, 64/255 length caps; ReDoS property test — 10^6 adversarial inputs < 1 ms each (NFR-05) _(route: frontier-reasoning/high — security: ReDoS resistance is the deliverable)_


---

## Milestone 4 — Events

Typed event emitter and rate-limiting helpers (spec §2 items 6-8)

- [x] 4.1 EventEmitter<EventMap>: on/once/off/emit, per-listener exception isolation via 'error' _(route: frontier-reasoning/high — sets-pattern: the hardest JSDoc-generics surface in the library; typed-API template)_
- [x] 4.2 debounce: trailing default, {leading, maxWait}, .cancel()/.flush() _(route: standard/high — leading/maxWait interplay is classically bug-prone)_
- [x] 4.3 throttle: one call per interval, .cancel() _(route: standard/medium)_
- [x] 4.4 fake-timer test suites for debounce/throttle edge cases _(route: fast/medium)_


---

## Milestone 5 — Web, crypto & diagnostics

fetch/URL/crypto/timing/duration utilities (spec §2 items 16-20, 25)

- [x] 5.1 httpClient: AbortController default+per-request timeouts merged with caller signals; auth() callback -> Bearer; JSON content-type handling; HttpError{status, body} _(route: frontier-reasoning/high — security: Authorization handling and the no-token-storage contract)_
- [x] 5.2 urlSearchParams: arrays as repeated keys, null/undefined skipped _(route: fast/low)_
- [x] 5.3 uuid via Web Crypto (randomUUID/getRandomValues) + conditional-exports crypto shim (spec §1.1) _(route: frontier-reasoning/high — security: entropy source correctness on both runtimes)_
- [x] 5.4 hashString: subtle.digest SHA-256/384/512, hex output _(route: frontier-reasoning/high — security)_
- [x] 5.5 measure on performance.now() returning {result, ms} _(route: fast/low)_
- [x] 5.6 parseDuration grammar + DurationParseError; fast-check grammar property test _(route: standard/medium)_


---

## Milestone 6 — Storage & sanitize subpaths

Browser-leaning entries with real-browser CI (spec §2 items 21-24)

- [x] 6.1 localStorageWrapper/sessionStorageWrapper with in-memory fallback and StorageError quota surfacing _(route: standard/medium)_
- [x] 6.2 cookieHelper: document.cookie with Secure/SameSite/Max-Age/Path; Node no-op warning _(route: frontier-reasoning/high — security: cookie attribute defaults are security posture)_
- [x] 6.3 sanitizeHtml on 'egl-utils-js/sanitize': DOMPurify optional-peer delegation with curated default allowlist (ADR-003) _(route: frontier-reasoning/max — security + foundational: the curated allowlist is the library's security promise)_
- [x] 6.4 Playwright browser smoke jobs (Chromium/Firefox/WebKit) for storage/cookie/sanitize in CI _(route: standard/medium)_
- [x] 6.5 DOMPurify bypass-corpus snapshot tests for the default sanitize profile _(route: frontier-reasoning/high — security: validates the sanitize promise against known bypasses)_


---

## Milestone 7 — Benchmarks & release readiness

NFR enforcement at full strength and the first public release

- [x] 7.1 vitest bench suites vs pinned lodash/p-limit/p-retry baselines (NFR-04) _(route: standard/high — fair-comparison methodology is the hard part)_
- [x] 7.2 nightly benchmark regression workflow (> 10% fail) _(route: standard/medium)_
- [x] 7.3 size-limit budgets tightened to final numbers (NFR-01) + shakeability scenario builds (NFR-02) _(route: standard/medium)_
- [x] 7.4 changesets release pipeline; npm publish --provenance from CI OIDC; lockfile-only + npm audit supply-chain gates _(route: frontier-reasoning/high — security: supply-chain and provenance surface)_
- [x] 7.5 documentation pass: JSDoc API reference, README examples, sanitize non-goals in SECURITY.md _(route: fast/medium)_
- [x] 7.6 v0.1.0 release readiness review _(route: standard/high — verification review; the release decision itself stays with the owner)_


---

## Milestone 8 — Post-0.1.0 follow-ups

Filed by the roadmap 7.6 release-readiness review rather than folded into it (AGENTS.md §10:
out-of-scope findings become roadmap items in the same PR).

- [x] 8.1 Verify the Safari 15.4 API floor mechanically — a browserslist-driven check or an explicit supported-API inventory, so a Safari-15.4-only regression cannot pass unnoticed again (the review found `AbortSignal.timeout`, Safari 16.0, used against a declared 15.4 floor; Playwright's WebKit is far newer than 15.4 and could never have caught it) _(route: standard/high — the gap is a verification blind spot, not a coding task)_
- [x] 8.2 Decide whether `VERSION` belongs on the public root surface before 1.0 — it is exported from `version.js` but not re-exported from the root, which matches spec §5 yet leaves consumers unable to read the version at runtime _(route: fast/low — a small API decision)_ — decided: yes, re-exported as a meta export outside the 25 numbered functional items (ADR-0018)



---

## Milestone 9 — Text, net & query utilities

Pure, universal utilities on Node-safe entries (spec 02 §2, F26–F39): zero DOM, zero new
platform APIs, testable from day one. Spec: [`docs/specs/02_spec_core_extensions.md`](docs/specs/02_spec_core_extensions.md).

- [x] 9.1 `/text` subpath: truncate, wrapText, fixedWidth string helpers (spec 02 F26–F28) _(route: standard/medium)_ — code-unit semantics and the subpath-family policy fixed by [ADR-0019](docs/adr/0019-subpath-family-and-code-unit-text-semantics.md)
- [x] 9.2 `/net` subpath: strict IPv4 parse/format/validate, sortable fixed-width key codec, CIDR prefix → subnet mask (spec 02 F29–F32) _(route: standard/high — security: address parsing is input validation)_ — strictness and the key encoding fixed by [ADR-0020](docs/adr/0020-strict-ipv4-parsing-and-the-sortable-key-codec.md)
- [x] 9.3 `/table` subpath, query primitives: filter-expression compiler with pluggable operators, typed comparators (Intl.Collator collation, auto type detection, empties-last), paginate (spec 02 F33–F35) _(route: frontier-reasoning/high — sets-pattern + decision-heavy: the query contract the spec-03 table pipeline builds on)_ — grammar totality fixed by [ADR-0021](docs/adr/0021-filter-expression-grammar.md), order semantics by [ADR-0022](docs/adr/0022-comparator-total-order-semantics.md)
- [x] 9.4 diagnostics: formatDuration (parseDuration round-trip) + normalizeError (any thrown value → uniform diagnostic record) (spec 02 F36–F37) _(route: standard/medium)_ — round-trip and record contracts fixed by [ADR-0023](docs/adr/0023-duration-round-trip-and-the-error-record.md)
- [x] 9.5 storage: pageSessionId — per-tab stable id on the storage-wrapper contract with private-mode fallback (spec 02 F39) _(route: standard/medium)_ — scope (a correlation id, not a credential) and the amended `/storage` budget fixed by [ADR-0024](docs/adr/0024-page-session-id-scope-and-budget.md)
- [x] 9.6 web: createResource — repository factory over an injected httpClient-compatible transport (spec 02 F38) _(route: standard/high — sets-pattern: the repository contract)_ — injection over import, and id-as-one-segment, fixed by [ADR-0025](docs/adr/0025-resource-repository-over-an-injected-client.md)


---

## Milestone 10 — Structured logging

Level-thresholded logger with a pure formatter and a pluggable sink contract on a
`/logging` subpath (spec 02 §2, F40–F41).

- [ ] 10.1 `/logging` subpath: logger factory (level threshold, child contexts, injected clock/sink/format/id), formatLogLine, formatTimestamp, LOG_LEVELS; throwing sinks contained; CRLF-hardened lines (spec 02 F40–F41) _(route: frontier-reasoning/high — sets-pattern: the sink/formatter contract every future adapter copies)_


---

## Spec Coverage Map

Tracks which spec section is fulfilled by which roadmap item(s). Every spec section has a
row with at least one fulfilling item and a status glyph. Legend: ⏳ not started · 🚧 in
progress · ✅ done · ❎ N/A.

### Spec 01 — core utils (F1–F25, frozen)

| Spec § | Requirement | Roadmap items | Status |
|--------|-------------|---------------|--------|
| §1 | Objective & business context | 1.1, 7.6 | ✅ |
| §2 | Functional requirements | 1.1, 1.2, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 6.1, 6.2, 6.3, 7.6 | ✅ |
| §3 | Non-functional requirements | 1.3, 1.4, 2.6, 3.6, 5.3, 6.4, 7.1, 7.2, 7.3, 7.6, 8.1 | ✅ |
| §4 | Logical architecture | 1.1, 7.6 | ✅ |
| §5 | Public interface | 1.2, 2.1, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 6.1, 6.2, 6.3, 7.6 | ✅ |
| §6 | Verification & test strategy | 1.2, 1.4, 2.6, 4.4, 5.6, 6.4, 6.5, 7.1, 7.2, 7.6, 8.1 | ✅ |

### Spec 02 — core extensions: text, net, query & logging (F26–F41)

| Spec § | Requirement | Roadmap items | Status |
|--------|-------------|---------------|--------|
| §1 (02) | Objective & business context | 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 10.1 | 🚧 |
| §2 (02) | Functional requirements F26–F41 | 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 10.1 | 🚧 |
| §3 (02) | Non-functional requirements | 9.1, 9.2, 9.3, 9.5, 9.6, 10.1 | 🚧 |
| §4 (02) | Logical architecture | 9.1, 9.3, 10.1 | 🚧 |
| §5 (02) | Public interface | 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 10.1 | 🚧 |
| §6 (02) | Verification & test strategy | 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 10.1 | 🚧 |

_Spec 02 stays 🚧 until M10 (F40–F41, the `/logging` subpath) lands; F26–F39 are complete._
