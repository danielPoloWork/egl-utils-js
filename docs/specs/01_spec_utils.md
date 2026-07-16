# Software Specification: JavaScript Core & Async Utilities Library (JavaScript (ES2023))

> Rendered from the intake interview (Phase 5). Frozen contract: diverging implementation
> updates this spec in the same PR or adds an ADR superseding the relevant section.

## 1. Objective & Business Context

A universal JavaScript utilities library (Node.js >= 18 and modern evergreen browsers)
providing async combinators with first-class AbortSignal cancellation, pure data-manipulation
functions, typed event helpers, and web/crypto/storage utilities — published on npm as
egl-utils-js with named exports only, dual ESM/CJS via an exports map, zero runtime
dependencies in the root entry, and a typed error hierarchy (EglError base with stable
.code). Pure by default, stateful by contract: the data and async modules never mutate
inputs; events, storage, http, and cookie modules are labeled stateful (spec §1, §3).

## 2. Functional Requirements

- F1 delay(ms, {signal?}) — Promise resolved after ms; rejects AbortError on signal
- F2 timeout(promise, ms, opts?) — rejects TimeoutError via AbortSignal.timeout; underlying operation receives the signal
- F3 retry(fn, {retries, minDelay, maxDelay, signal, onAttempt}) — exponential backoff + full jitter; RetryExhaustedError carries .attempts/.errors[]
- F4 parallelLimit(tasks, limit, opts?) — bounded concurrency; fail-fast default aborts pending via shared signal; {settle: true} returns PromiseSettledResult[]
- F5 asyncQueue(opts?) — FIFO serial queue; push returns task Promise; onIdle(), size; abort drains pending with AbortError
- F6 EventEmitter<EventMap> — minimal typed emitter (on/once/off/emit); per-listener exception isolation reported via 'error'
- F7 debounce(fn, delay, {leading, maxWait}) — trailing-edge default; .cancel()/.flush()
- F8 throttle(fn, interval) — at most one call per interval; .cancel()
- F9 deepClone(obj) — thin wrapper over native structuredClone; unsupported types throw CloneError naming the offending path (ADR-002)
- F10 deepMerge(target, source) — recursive merge returning a new object; arrays replaced not concatenated; {arrayMerge} option
- F11 pick(obj, keys) / omit(obj, keys) — new filtered objects; type-narrowing JSDoc signatures
- F12 groupBy(array, iteratee) — returns Map<K, T[]> (avoids prototype-key pitfalls)
- F13 uniq(array, iteratee?) — SameValueZero uniqueness with optional key extractor
- F14 isObject(val) / isEmpty(val) — type-guard signatures
- F15 validateEmail(email) — linear-time, backtracking-free RFC 5322 practical subset; length caps (64/255) enforced before matching; ReDoS-resistant
- F16 httpClient — fetch wrapper; AbortController-based default+per-request timeouts merged with caller signals; auth callback attaches Bearer per request (no token storage); JSON parsing with content-type checks; non-2xx rejects HttpError{status, body}
- F17 urlSearchParams(obj) — flat object to query string; arrays as repeated keys; null/undefined skipped
- F18 uuid() — UUID v4 via Web Crypto (randomUUID/getRandomValues); never Math.random
- F19 hashString(str, algorithm='SHA-256') — async Web Crypto subtle.digest; hex output; SHA-256/384/512 only
- F20 measure(fn, opts?) — sync/async timing on performance.now(); returns {result, ms}
- F21 localStorageWrapper — safe interface with in-memory fallback; JSON (de)serialization; StorageError on quota
- F22 sessionStorageWrapper — same contract over sessionStorage
- F23 cookieHelper — document.cookie read/write/delete with Secure/SameSite/Max-Age/Path; browser-only (warns and no-ops in Node); no HttpOnly claims
- F24 sanitizeHtml(html, opts?) — allowlist-based, delegates to DOMPurify (optional peer) on the egl-utils-js/sanitize subpath with a curated default profile (ADR-003)
- F25 parseDuration(str) — '2h'|'30m'|'5s'|'1h30m' to milliseconds; invalid input throws DurationParseError (never NaN)


## 3. Non-Functional Requirements

<!-- Scalability / load budgets belong here as NUMBERS, not adjectives (the design "scalability"
     fold): a value per hard NFR axis — throughput / concurrency, p99 latency, memory ceiling,
     target FPS, cold-start budget — each phrased so CI could prove a violation. -->
- NFR-01 Bundle budgets (min+gzip): root entry full import <= 6 kB; any single function <= 1 kB after shaking; /storage <= 2 kB — size-limit gate in CI
- NFR-02 Tree-shakability: importing one named export pulls zero unrelated modules — agadoo + size-limit scenario builds
- NFR-03 Coverage >= 95% lines/branches — vitest + c8 gate
- NFR-04 Performance parity: retry/parallelLimit within 10% of p-retry/p-limit; data functions within 10% of lodash equivalents or faster — vitest bench, pinned baselines, nightly regression gate
- NFR-05 validateEmail worst-case linear: 10^6 adversarial inputs each < 1 ms — property test in suite
- NFR-06 Zero runtime dependencies in the root entry (DOMPurify is peer + subpath only) — package.json audit in CI
- NFR-07 Portability: Node >= 18 LTS; last 2 evergreen Chromium/Firefox + Safari >= 15.4; one Web Crypto surface via conditional-exports shim; TypeScript >= 5.0 consumers resolve types through the exports map (spec §1.1)


## 4. Logical Architecture & Core Algorithm

<!-- For a non-obvious core algorithm, include a short LANGUAGE-FREE pseudocode sketch (control
     flow + invariants) alongside the prose + diagram (the design "pseudocode" fold); skip it when
     the approach is standard. If the design owns persistent state, capture the data model here —
     entities, relations, normal form, migration policy — within ADR-0004's secondary-SQL frame. -->
Flat utilities library behind an npm exports map (ADR-001): the root entry
'egl-utils-js' carries the async, data, validation, events, web, and crypto groups;
'egl-utils-js/storage' fences off browser-leaning storage/cookie wrappers;
'egl-utils-js/sanitize' isolates the DOMPurify-delegating sanitizer (optional peer,
ADR-003); 'egl-utils-js/errors' exports the shared typed error classes (EglError base,
stable .code). sideEffects: false plus named-exports-only make every function
individually shakeable; subpath entries keep peer-dependent and browser-only code out
of the root import. Dual-package hazard mitigated by keeping no module-level shared
state except error-class identity, checked via .code not cross-realm instanceof.
C4 component diagram: spec §4 (mermaid), seeded into docs/specs/01_spec_utils.md.

## 5. Public Interface

<!-- The API contract (the design "api" fold): each operation with its payload shapes, the error
     model (the failure taxonomy, not just the happy path), and the versioning / SemVer surface.
     A service/web project may keep the written-out contract under docs/api/ (capabilities.api_spec). -->
Consumers import via `import { parallelLimit, retry } from 'egl-utils-js';`. The public surface:

- Root 'egl-utils-js': delay, timeout, retry, parallelLimit, asyncQueue, EventEmitter, debounce, throttle, deepClone, deepMerge, pick, omit, groupBy, uniq, isObject, isEmpty, validateEmail, httpClient, urlSearchParams, uuid, hashString, measure, parseDuration — named exports only, no default export (ADR-001)
- 'egl-utils-js/storage': localStorageWrapper, sessionStorageWrapper, cookieHelper (browser-leaning entry)
- 'egl-utils-js/sanitize': sanitizeHtml (DOMPurify optional peerDependency; clear runtime error when missing)
- 'egl-utils-js/errors': EglError base + TimeoutError, RetryExhaustedError, AbortError (re-exported convention), HttpError, CloneError, StorageError, DurationParseError — all with stable .code (cross-realm-safe identity)
- Failure taxonomy per module group and pure/stateful contract table: spec §3; SemVer surface: any exports-map or error-code change is MAJOR-relevant


## 6. Verification & Test Strategy

Vitest on a Node 18/20/22 matrix; Playwright browser smoke (Chromium/Firefox/WebKit)
for the storage/cookie/sanitize entries (from M6); fast-check property tests for
validateEmail ReDoS resistance (NFR-05), deepMerge non-mutation, and the parseDuration
grammar. Per-PR quality gates: tsc --noEmit (checkJs), ESLint --max-warnings 0,
coverage >= 95% (NFR-03), size-limit budgets (NFR-01), agadoo shakeability (NFR-02),
publint + arethetypeswrong on the exports map. Nightly vitest bench vs pinned
lodash/p-limit/p-retry baselines; > 10% regression fails (NFR-04). Release engineering:
changesets-driven SemVer + changelog; npm publish with --provenance from CI OIDC;
lockfile-only installs and npm audit gate (spec §7).

Toolchain: built with tsup (esbuild) — dual ESM/CJS + .d.ts generated from JSDoc types (ADR-001), tested with Vitest (+ fast-check property tests; Playwright browser smoke from M6), checked with
ESLint --max-warnings 0; vitest --detectOpenHandles (leak/handle), coverage target ≥ 95% line. Every functional and
non-functional requirement above maps to a CI gate (see [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)).
