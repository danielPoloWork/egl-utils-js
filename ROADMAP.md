# Roadmap — egl-utils-js

The project's plan as a numbered, checkbox-driven list. When an item completes in a PR,
flip its checkbox (`- [ ]` → `- [x]`) **in the same PR**. New work goes at the bottom of
its section with a fresh `<milestone>.<task>` number; never renumber.

- **Versioning start:** pre-1.0 milestone-driven.
- **Session journal:** see [`docs/journal/`](docs/journal/). Latest checkpoint:
  [`2026-08-08 — a second peer, one sanitizer, and a catalogue closed`](docs/journal/2026/08/2026-08-08-bootstrap-popper.md).

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

- [x] 10.1 `/logging` subpath: logger factory (level threshold, child contexts, injected clock/sink/format/id), formatLogLine, formatTimestamp, LOG_LEVELS; throwing sinks contained; CRLF-hardened lines (spec 02 F40–F41) _(route: frontier-reasoning/high — sets-pattern: the sink/formatter contract every future adapter copies)_


---

## Milestone 11 — DOM foundation

The browser-leaning `/dom` entry and the helpers everything above it reuses (spec 03 §2,
F43–F48). Spec: [`docs/specs/03_spec_dom_ui_table.md`](docs/specs/03_spec_dom_ui_table.md).

- [x] 11.1 `/dom` subpath foundation: entry wiring, `bindElements` with a missing-element report and a `strict` mode, `DomContractError` on `egl-utils-js/errors`, and the deny-by-default api-floor scanner extended to policed DOM globals (spec 03 F43, NFR-14, NFR-16) _(route: frontier-reasoning/high — sets-pattern + security: extends the ADR-0017 gate to the DOM; the fail-fast contract every /dom export copies)_
- [x] 11.2 `delegate` with AbortController teardown, plus the `setEnabled`/`setVisible`/`setValue` native setters (spec 03 F44–F45, NFR-15) _(route: standard/high — teardown lifecycle is classically leak-prone)_
- [x] 11.3 `injectFragment` with a mandatory caller-supplied sanitizer, `autoGrow` behind an injected measure seam, and `withUrlParams` (spec 03 F46–F48) _(route: frontier-reasoning/high — security: the sanitize boundary is the deliverable)_


---

## Milestone 12 — UI components

Instance-based, framework-agnostic components: no design system in a default (spec 03 §2,
F49–F50).

- [x] 12.1 `inlineAlert`: per-instance timers and bindings, injectable class/icon maps, `textContent` by default with an opt-in `{html, sanitize}` pair (spec 03 F49) _(route: frontier-reasoning/high — sets-pattern: the component contract 12.2 and spec 04 copy)_
- [x] 12.2 `loadingOverlay`: reference counting, a minimum-visible clock started when the presentation settles, and focus save/blur/restore over injected `onShow`/`onHide` hooks (spec 03 F50) _(route: standard/high — the refcount and anti-flicker interplay is classically bug-prone)_


---

## Milestone 13 — Composable table pipeline

One owner of state, pure stages, one derived view — so filtering and sorting compose
instead of discarding each other (spec 03 §2, F42 and F51).

- [x] 13.1 `tablePipeline` on `/table`: commands, a memoized `view()`, one `'change'` event composing EventEmitter, over the spec-02 query primitives; pure and SSR-safe (spec 03 F42, NFR-13) _(route: frontier-reasoning/high — decision-heavy: the wave's flagship contract)_
- [x] 13.2 `bindTableControls` in `/dom`: debounced filter/search inputs, one delegated sort-header listener with `aria-sort`, pagination reflection, structural teardown, plus the Playwright end-to-end scenario (spec 03 F51, NFR-15) _(route: standard/high)_
- [x] 13.3 Make the absolute benchmarks visible to the regression gate — `tools/bench-regression.mjs` only collects a group when a benchmark name starts with `egl `, so every absolute suite (`no-baseline.bench.js` and the 13.1 NFR-13 case) runs on every CI benchmark job and is then **discarded**, despite `no-baseline.bench.js` documenting itself as feeding that gate. A regression in `validateEmail`'s linear cost or in the pipeline's derivation would not be caught. Fix the collector (or the naming convention) and re-record `baseline.json` on comparable hardware, not on a workstation _(route: standard/medium — a verification blind spot, not a coding task; found by 13.1)_ — classification is now a total, unit-tested pure function (10 discarded benchmarks recovered, 13 entries → 23) and absolute figures are held to an environment-tagged collapse floor, per [ADR-0036](docs/adr/0036-collecting-every-benchmark-and-the-collapse-floor.md); recording on CI hardware is a documented `workflow_dispatch` input


---

## Milestone 14 — Bootstrap element builders

The opt-in `/bootstrap` entry and the no-peer half of the catalog: real-DOM builders with
escape-by-default population (spec 04 §2, F52–F65).
Spec: [`docs/specs/04_spec_bootstrap_toolkit.md`](docs/specs/04_spec_bootstrap_toolkit.md).

- [x] 14.1 `/bootstrap` subpath foundation: entry wiring, the F52 builder contract (escape-by-default, the `{html, sanitize}` pair, fragment batching, owned teardown) and the atom builders — bsIcon with the two icon-set data presets, bsBadge, bsButton, bsButtonGroup, bsCloseButton, bsSpinner, bsProgress, bsPlaceholder (spec 04 F52–F60, NFR-19/NFR-20) _(route: frontier-reasoning/high — sets-pattern + security: the escape contract every manager copies)_ — nodes over strings, the injectable document, the class-token rule and the measured atom budget fixed by [ADR-0037](docs/adr/0037-builder-contract-nodes-escape-and-the-atom-budget.md)
- [x] 14.2 Composite builders: bsCard, bsListGroup, bsBreadcrumb, bsAlert over the F49 engine, bsPagination (spec 04 F61–F65, NFR-21) _(route: standard/medium)_ — literal composition, delegation scoped to direct children, and the tree-shakeability of a frozen constant fixed by [ADR-0038](docs/adr/0038-composites-compose-and-what-a-frozen-constant-costs.md)


---

## Milestone 15 — Bootstrap table manager

The toolkit's flagship: a full Bootstrap table facade that composes the spec-03 pipeline
and hides nothing (spec 04 §2, F66–F67).

- [x] 15.1 bsTable core: column descriptors → thead/tbody rendered through one fragment, style flags, escaped cells with `format` hooks, delegated row events, and the owned `tablePipeline` exposed as `.pipeline` (spec 04 F66; NFR-17's pre-declared composing exception) _(route: frontier-reasoning/high — decision-heavy: the toolkit's flagship composition)_ — the borrowed pipeline, the per-column markup decision, the cell that refuses to guess and the measured budget fixed by [ADR-0039](docs/adr/0039-a-facade-with-a-door-and-what-the-table-costs.md)
- [x] 15.2 bsTable controls: per-column filter row speaking the F33 grammar with custom `{operators}`, global search, page-size select, F65 pagination and `aria-sort` headers wired through F51; toolbar slot; one-pass structural teardown (spec 04 F67, NFR-15/NFR-21) _(route: standard/high)_ — the operator vocabulary moved onto the pipeline (spec 03 F42 amended), the pager wired through its own F65 hooks, and a ceiling that sat below its own parts corrected by [ADR-0040](docs/adr/0040-one-grammar-one-pager-and-a-ceiling-below-its-own-parts.md)


---

## Milestone 16 — Bootstrap interactive wrappers

The peer-backed half: lifecycle wrappers over Bootstrap's behaviors, resolved lazily and
failing typed when the peer is absent (spec 04 §2, F68–F81) — closes the catalog at 24/24.

- [x] 16.1 The F68 resolution contract (lazy, injected-first, stable `EGL_PEER_MISSING` on `egl-utils-js/errors`) + bsToast, bsModal, and bsLoadingOverlay over the F50 gate (spec 04 F68–F71, NFR-18) _(route: frontier-reasoning/high — sets-pattern: the optional-peer contract every wrapper copies)_ — a peer looked up rather than imported, resolution deferred to the operation that needs it, and the one bounded override of the F50 containment rule fixed by [ADR-0041](docs/adr/0041-a-peer-looked-up-not-imported.md)
- [x] 16.2 Navigation set: bsCollapse, bsAccordion, bsDropdown, bsTabs, bsNavbar (spec 04 F72–F76, NFR-21) _(route: standard/medium)_ — ids minted against the live document (a counter would collide in the dual-package case), the 16.1 lifecycle extracted rather than copied five times, and the first budget ceiling derived from its parts instead of estimated, per [ADR-0042](docs/adr/0042-ids-are-the-accessibility-and-a-ceiling-derived-not-guessed.md)
- [x] 16.3 Overlay & observation set: bsOffcanvas, bsCarousel, bsScrollspy (spec 04 F77–F79) _(route: standard/medium)_ — three shapes rather than one group (the scrollspy has no open state, so it is written plainly instead of inheriting three methods that would throw), an image that cannot reach the page unlabelled, and the entry ceiling unmoved for a third milestone, per [ADR-0043](docs/adr/0043-three-shapes-that-are-not-a-group.md)
- [x] 16.4 Popper-backed set: bsTooltip and bsPopover with the one-sanitizer contract, naming `@popperjs/core` in the typed failure (spec 04 F80–F81, NFR-18/NFR-19) — **closes the Bootstrap 5 catalogue at 24/24** _(route: standard/high — security: content handed to a third-party renderer)_ — the second peer detected by translating Bootstrap's own diagnostic (nothing else is probeable), exactly one sanitizer over content handed to a third-party renderer, and a `setContent` that sequences instead of fighting the transition, per [ADR-0044](docs/adr/0044-a-second-peer-one-sanitizer-and-a-catalogue-closed.md)
- [ ] 16.5 Fix the cross-realm `AbortSignal` in the listener-owning composites ([BUG-0003](docs/bugs/2026/08/BUG-0003-cross-realm-abort-signal-in-composites.md)): `bsAlert`, `bsPagination` and `bsListGroup({onSelect})` each build an internal `AbortController` and hand its signal to `addEventListener` on an element from the caller's `{document}`, which a different realm's DOM refuses — so the server-render and iframe path the option exists for is broken for exactly those three. Take the controller from the target's own view behind a shared `dom-helpers` seam, since every future listener-owning builder inherits the trap, and flip the case the 16.1 node-safety suite currently pins as a known failure _(route: standard/medium — found by 16.1's NFR-18 suite; a defect in M14.2 code, so it ships on its own)_


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
| §1 (02) | Objective & business context | 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 10.1 | ✅ |
| §2 (02) | Functional requirements F26–F41 | 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 10.1 | ✅ |
| §3 (02) | Non-functional requirements | 9.1, 9.2, 9.3, 9.5, 9.6, 10.1 | ✅ |
| §4 (02) | Logical architecture | 9.1, 9.3, 10.1 | ✅ |
| §5 (02) | Public interface | 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 10.1 | ✅ |
| §6 (02) | Verification & test strategy | 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 10.1 | ✅ |

_Spec 02 is complete as of M10 (v0.3.0): F26–F41 all delivered._

### Spec 03 — DOM toolkit, UI components & the table pipeline (F42–F51)

| Spec § | Requirement | Roadmap items | Status |
|--------|-------------|---------------|--------|
| §1 (03) | Objective & business context | 11.1, 11.2, 11.3, 12.1, 12.2, 13.1, 13.2 | ✅ |
| §2 (03) | Functional requirements F42–F51 | 11.1, 11.2, 11.3, 12.1, 12.2, 13.1, 13.2, 15.2 | ✅ |
| §3 (03) | Non-functional requirements | 11.1, 11.2, 12.1, 12.2, 13.1, 13.2, 13.3 | ✅ |
| §4 (03) | Logical architecture | 11.1, 13.1, 13.2 | ✅ |
| §5 (03) | Public interface | 11.1, 11.2, 11.3, 12.1, 12.2, 13.1, 13.2, 15.2 | ✅ |
| §6 (03) | Verification & test strategy | 11.1, 11.2, 11.3, 12.1, 12.2, 13.1, 13.2 | ✅ |

_Spec 03 is complete as of M13 (v0.6.0): F42–F51 all delivered._

### Spec 04 — Bootstrap 5 toolkit (F52–F81)

| Spec § | Requirement | Roadmap items | Status |
|--------|-------------|---------------|--------|
| §1 (04) | Objective & business context | 14.1, 14.2, 15.1, 15.2, 16.1, 16.2, 16.3, 16.4, 16.5 | 🚧 |
| §2 (04) | Functional requirements F52–F81 | 14.1, 14.2, 15.1, 15.2, 16.1, 16.2, 16.3, 16.4 | 🚧 |
| §3 (04) | Non-functional requirements | 14.1, 14.2, 15.1, 15.2, 16.1, 16.4, 16.5 | 🚧 |
| §4 (04) | Logical architecture | 14.1, 15.1, 16.1 | 🚧 |
| §5 (04) | Public interface | 14.1, 14.2, 15.1, 15.2, 16.1, 16.2, 16.3, 16.4 | 🚧 |
| §6 (04) | Verification & test strategy | 14.1, 14.2, 15.1, 15.2, 16.1, 16.2, 16.3, 16.4, 16.5 | 🚧 |
