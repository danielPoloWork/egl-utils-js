# Roadmap — egl-utils-js

The project's plan as a numbered, checkbox-driven list. When an item completes in a PR,
flip its checkbox (`- [ ]` → `- [x]`) **in the same PR**. New work goes at the bottom of
its section with a fresh `<milestone>.<task>` number; never renumber.

- **Versioning start:** pre-1.0 milestone-driven.
- **Session journal:** see [`docs/journal/`](docs/journal/). Latest checkpoint:
  [`2026-08-26 — reduced motion, the last capability in M20`](docs/journal/2026/08/2026-08-26-reduced-motion.md).

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
- [x] 16.5 Fix the cross-realm `AbortSignal` in the listener-owning composites ([BUG-0003](docs/bugs/2026/08/BUG-0003-cross-realm-abort-signal-in-composites.md)): `bsAlert`, `bsPagination` and `bsListGroup({onSelect})` each build an internal `AbortController` and hand its signal to `addEventListener` on an element from the caller's `{document}`, which a different realm's DOM refuses — so the server-render and iframe path the option exists for is broken for exactly those three. Take the controller from the target's own view behind a shared `dom-helpers` seam, since every future listener-owning builder inherits the trap, and flip the case the 16.1 node-safety suite currently pins as a known failure _(route: standard/medium — found by 16.1's NFR-18 suite; a defect in M14.2 code, so it ships on its own)_ — one seam for what turned out to be **seven** call sites rather than the three the report named, fixed by [ADR-0045](docs/adr/0045-a-controller-from-the-node-s-own-realm.md)


---

## Milestone 17 — v1.0.0 readiness & the first stable release

Not a capability wave: **no new surface ships here.** Specs 01–04 are delivered and the
public surface is 110 exports across 10 entries — the question a 1.0 answers is not "is it
ready" (no open items, no open bugs, every gate green) but **"what are we committing never
to change again"**, since after 1.0 every export, every `EGL_*` code and every exports-map
path is MAJOR-protected.

So this milestone spends its budget on the things a major boundary is the *only* cheap
moment for, and on the review that looks for the ones nobody has thought of. The known
backlog — the `bsTable` extras catalogued in spec 04's non-goals — is deliberately **not**
here: it is additive, and additive work belongs in 1.x.

- [x] 17.1 v1.0.0 readiness review: audit the whole public surface for what we would regret freezing — shape consistency across builders (an `Element` from some, an instance from others), option-name and callback-signature drift between sibling APIs, error-code coverage, the exports-map shape, and anything a consumer could reasonably read two ways. Findings become items in this milestone rather than being folded in (the roadmap 7.6 precedent). The review does **not** propose new features _(route: standard/high — verification review; the 1.0 decision itself stays with the owner)_ — [`docs/releases/v1.0.0-readiness-review.md`](docs/releases/v1.0.0-readiness-review.md): no defect found and every gate green, but **seven divergences sit inside a surface about to become MAJOR-protected** — unknown option keys accepted in silence across all 52 option bags, `label` meaning two different things, two auto-dismiss vocabularies, `update()` meaning three, `show()` returning three types, one component that accepts writes after `destroy()`, and a `dompurify` peer range half of which is known-vulnerable. Filed as **17.7–17.12**; the split that prompted the item (9 builders return an `Element`, 3 a shared wrapper, 15 a bespoke instance) is deliberate and stands — it is the instance side that diverged
- [x] 17.2 Raise the supported-runtime floor for the 1.x line: Node 18 left maintenance in April 2025 and Node 20 in April 2026, so a 1.x born now would carry unmaintained runtimes for years. Decide and apply the new floor (`engines`, the CI matrix, `SUPPORT_MATRIX` in `tools/api-floor-inventory.js`, and the Safari figure), amending spec 01 NFR-07 in the same PR. **Breaking by construction, which is why it belongs here**: after 1.0 it costs a major _(route: frontier-reasoning/high — decision-heavy: the only cheap moment for it, and the floor governs the api-floor gate)_ — **Node >= 22, Safari >= 16.4**, CI matrix **22 / 24 / 26**, per [ADR-0050](docs/adr/0050-the-1x-runtime-floor.md): support the maintained lines and make the floor the oldest of them (which picks 22 today and explains itself next time), while the Safari figure moves to narrow a claim CI could never verify — Playwright ships one recent WebKit build, which is exactly what let the 7.6 `AbortSignal.timeout` defect reach production. Safari 17.4 was rejected: deleting ~200 B of tested code is the wrong side of the trade the 7.6 review already made, so `anySignal` stays. The gate then did its job — `AbortSignal.timeout`'s fallback is **deleted** as dead code, `AbortSignal.any`'s guard keeps its Safari reason after its Node one lapsed, and five dependabot majors the old floor held shut are released. First PR in this project to **shrink** the budgets: root −50 B, and `httpClient`'s documented exception back to its original 1.35 kB
- [x] 17.3 Publish the generated API reference: `docs/api/` is built by `pnpm docs:api` and gitignored, so a consumer of a 110-export surface has the README and their editor's JSDoc and nothing navigable. Add a Pages workflow that generates and publishes it per release, and link it from the README _(route: standard/medium)_ — done per [ADR-0057](docs/adr/0057-the-api-reference-is-published-per-release.md): `.github/workflows/docs.yml` deploys to Pages on a **published release** rather than on the tag, so the site never describes a version nobody can install yet — the same human gate AGENTS.md §11 puts on the release itself. The site documents the **latest release only** and now says which, via `includeVersion`; a versioned archive is recorded as rejected-for-now with the condition to revisit. No new gate: CI has built this reference warning-free on every PR since 7.5, so publishing adds an address, not a risk. **One manual step remains** — Pages must be switched on once (`administration:write` is not grantable to `GITHUB_TOKEN`), which the workflow checks for and fails with the exact command; `github-setup.md` §4 carried the wrong recipe (a branch-sourced site) and is corrected
- [x] 17.4 Close the NFR-01 clause ADR-0015 left open — whether the per-function 1 kB budget exempts composing facades, or keeps naming them one by one as exceptions. Practice has amended it four times over (`httpClient`, `bsTable`, `tablePipeline`, `bindTableControls`); a 1.0 should ship the clause it actually enforces _(route: standard/medium — decision-heavy, and it is written down as the owner's call)_ — **the owner chose named exceptions over a category exemption**, per [ADR-0058](docs/adr/0058-the-per-function-budget-keeps-its-exceptions-named.md): the clause stays `<= 1 kB` unqualified, and a function that composes another public export and misses it takes a **named, measured exception row documented by ADR in its own PR**. Measuring first corrected the item's own premise — those four names are governed by **four different clauses**, and NFR-01 has exactly **one** exception (`httpClient`, 1310 B) with **27 of 28** root functions complying, the largest of them 25% clear. So the pressure is live and a category exemption would retire it for one case; and the chosen rule is not new, being what spec 02 NFR-08 has stated verbatim for three waves. Recorded as an observation rather than unified: NFR-12 keeps a *closed, enumerated* exemption (F42/F49/F50/F51) and NFR-17 has no 1 kB clause at all — four clauses answering different questions about different kinds of symbol, which is deliberate. No code, no budget moves
- [x] 17.5 Cut **v1.0.0**: the first release whose version means what SemVer says it means. Changelog prose and release notes as ever, plus a short compatibility statement naming the supported runtimes and what the stability promise covers _(route: standard/high — the release decision stays with the owner)_ — prepared: the **major** changeset that makes the bump 1.0.0 rather than 0.10.0 (all seven queued changesets were `minor`), `changeset version` applied, `docs/changelog/v1/v1.0.0.md` and `docs/releases/v1.0.0.md` written, and the compatibility statement placed where it outlives the release notes — a **Stability promise** section in the README and a concrete list in [`maintenance.md`](docs/workflow/maintenance.md), each naming what is *outside* the promise (byte budgets, generated `.d.ts` internals, message wording, peer behaviour) as explicitly as what is inside. **The tag, the GitHub Release and the npm publish remain the owner's** (AGENTS.md §6.1/§11): merging this PR publishes nothing
- [x] 17.6 Decide the `/sanitize` peer-resolution contract before 1.0 freezes it: today `/sanitize` static-imports `dompurify` — fatal at module load on a page with no bundler and no import map — while `/bootstrap` resolves its peer lazily, injected-first, failing typed (ADR-0041). Two optional peers, two contradictory mechanisms, and only one survives a bundler-free page. The decision needs an ADR; if the chosen contract is incompatible with the static import, the flip ships inside this item (the 17.2 breaking-by-construction logic), and the purely additive remainder lands in M18 item 18.1 — spec 05 F82 is written mechanism-neutral and defers to that ADR _(route: frontier-reasoning/high — decision-heavy + security: the contract is the deliverable, and it pre-empts a 17.1 finding)_ — decided **lookup, not import**, per [ADR-0055](docs/adr/0055-the-sanitizer-s-peer-is-looked-up.md): `options.dompurify` → `globalThis.DOMPurify` → `EGL_PEER_MISSING`, which is ADR-0041's contract verbatim, so the library now has **one** peer mechanism rather than two. ADR-0041 argued the opposite for this entry and its reasoning was sound — a static import is right for an entry that exists only to use the peer — but the premise was an npm consumer with a bundler, and ADR-0046 made the bundler-free page first-class; no `exports` condition can serve a static import to one and a lookup to the other, so the choice was exclusive. **Breaking for bundler consumers**, who now inject once or per call. The flip landed here, so F82's *load* half already holds and the browser fixture's import map is **deleted** — 18.1 keeps the three-engine proof. Fixing the shape detection also exposed a latent bug (a bound instance passed with `window` hit the factory branch and threw `purify is not a function`). Unusually for this milestone, no budget moved: `/sanitize` 1457 B → 1484 B inside its row

Items 17.7–17.12 were **filed by the 17.1 readiness review**, 17.13 by 17.7 and 17.14 by 17.2 —
per AGENTS.md §10 and the roadmap 7.6 precedent, findings become items rather than being
folded into the work that found them. Numbering fixes identity, not sequence: **17.5 cuts the
release and stays last** whatever order the rest run in. The review's own suggested order is
17.7 → 17.8 → 17.9 → 17.2 → 17.10–17.14 → 17.4/17.6 → 17.3 → 17.5.

- [x] 17.7 Decide whether an **unknown option key is rejected or ignored**, and apply the answer across all 52 option bags. Today every builder validates the options it knows and silently drops the ones it does not: `bsBadge('x', { varient: 'danger' })` returns a default badge, and `bsToast({ autoHideMs })` — the vocabulary 17.8 is about — is discarded without a word. **Breaking by construction if strict is chosen**, which is why it cannot wait: code that passes an unknown key "works" today. Weigh it against the case for silence (a caller's config object stays forward-compatible) and against the development-only middle route, whose cost is two behaviours to document and test. Needs an ADR (review §2.1) _(route: frontier-reasoning/high — decision-heavy: the answer governs every option bag the library will ever add)_ — **rejected**, per [ADR-0047](docs/adr/0047-an-unknown-option-key-is-a-typeerror.md): a `TypeError` naming the key, with each function's **destructuring pattern as its schema** so the accepted set cannot drift from the implementation, and the development-only route rejected for want of a reliable development signal on the bundler-free path spec 05 commits to. It found three silent key-drops in this repository's own code the moment it existed. Cost: a shared per-entry floor — 17 of 98 size rows re-baselined, four documented budget exceptions grown and one new named one (`compileFilter`), no component or builder clause moved, root still inside its 6 kB ceiling
- [x] 17.8 Freeze the **naming vocabulary** the 1.0 makes permanent, in one ADR and one renaming pass: `label` is the accessible name in six builders and the visible text in `bsButton` and `BsTableColumn`; auto-dismiss is `autoHideMs` on the alerts and `autohide`/`delay` on `bsToast`; `update()` re-renders from data in three components and repositions in two, while `bsTable` calls the same job `setData()`; the `Ms` unit suffix is carried by `autoHideMs`/`minVisibleMs`/`debounceMs` and not by `delay`/`interval`/`timeout`/`maxWait`. Also **write down** the two callback rules the review found already consistent (data-carrying callbacks take the event last; DOM primitives take it first) so they survive as rules rather than as coincidence (review §2.2–§2.4, §4) _(route: standard/high — breaking renames across the public surface)_ — settled by [ADR-0048](docs/adr/0048-one-word-one-meaning.md): **`label` is what the user sees, `ariaLabel` is the accessible name** (six renames, chosen this direction because it matches the platform and puts the churn on the options passed least); one **`autoHideMs: number | false`** on `bsToast`, Bootstrap's pair translated at the constructor boundary only; **`set<Noun>` takes new state** (`setData`, `setValue`, `setView`) while a **no-argument recompute keeps the vendor's name** (`update`, `refresh`); `onPage`→`onPageChange`. The `Ms` rule and both callback rules are written down and cost no rename. Eleven breaking changes, every one of them failing loudly thanks to 17.7 — which is why that had to land first
- [x] 17.9 Settle the **instance contract** across the 15 shapes: what `show()` returns (`void`, an `Element`, and a release closure today), what a method call after `destroy()` does — four instances throw a `TypeError` naming the API, `bsProgress` silently writes to a detached node — and which members each shape owes (`element` 12/15, `on()` 7/15, `instance()` 5/15, `isShown()` 2/15 and absent from `bsModal`). Decide alongside it whether a state violation deserves an `EGL_*` code or stays a `TypeError`, since ADR-0003's registry freezes at 1.0, and fix `bsAlert`'s failures naming `inlineAlert` rather than the API the caller invoked (review §2.5, §2.6, §3.1) _(route: standard/high — sets-pattern: every 1.x component copies whatever this settles)_ — settled by [ADR-0049](docs/adr/0049-commands-throw-queries-answer.md) as **commands throw, queries answer, `destroy()` is idempotent**: one sentence for every shape (naming the caller's method, not the internal chokepoint), four silent commands fixed, `show()` returning `void` everywhere with the two exceptions renamed for what they do (`loadingOverlay.acquire`, `bsToast.add`), and the member matrix turned into rules — `element` where a node is owned (the F50 gate exempt by design), `isShown()` wherever `show`/`hide` exist, `instance()` only where there is exactly one Bootstrap component, `on()` wherever events flow. A state violation **stays a `TypeError`** (a code would be additive later, so freezing one now is the harder call to reverse), composing entries own their diagnostics through an internal api parameter, and 17.8's loose end closes: `document` now works on `bsPagination` and `bsTable` as it always did on `bsToast`
- [x] 17.10 Decide where **`withUrlParams`** lives. It is on `/dom`, and its own JSDoc says it never touches `document`, `location` or `URL` — the one pure function on the entry that exists to fence DOM code off, one import away from `urlSearchParams` on the root, with which it shares a documented contract. Moving an export between entries after 1.0 is breaking; re-exporting it from the root and deprecating the `/dom` binding is additive and is the cheap answer available now (review §2.7) _(route: fast/low — a small placement decision)_ — re-exported from the root, `/dom` binding kept for compatibility, per [ADR-0052](docs/adr/0052-withurlparams-moves-to-the-root.md). Not free: the addition cost 138 B in the full root bundle, 50 B over NFR-01's original 6 kB clause — the first time that ceiling has needed to grow rather than shrink — so the same PR amends it to **6.05 kB**
- [x] 17.11 Decide the **`dompurify` peer floor** before `^3` is frozen as the compatible range for the security entry: GHSA-55q2-fjhq-7xh7 (moderate) affects `<= 3.4.12`, patched in `3.4.13`, and this repo's lockfile resolves to exactly 3.4.12. `sanitizeHtml` is **not** exposed by that advisory — it pins `IN_PLACE: false` — but narrowing a peer range after 1.0 breaks every consumer inside the part removed. Refresh the lockfile in the same PR, and decide whether the audit gate should stay at `--audit-level high` when the advisory sits on the sanitizer's peer (review §2.8) _(route: standard/medium — security: the peer range is the sanitizer's supply chain)_ — **`^3.4.13`**, and the reasoning written down per [ADR-0051](docs/adr/0051-the-sanitizer-s-peer-range.md): **a peer range is a compatibility statement, not a security mechanism**, because raising a floor is breaking and this project will not ship a major per advisory — so the floor's job is to exclude what is already known bad at 1.0, and later advisories are the consumer's to patch, which they can because they own the dependency. The gate moves to **`--audit-level moderate`**, on the narrower ground that a DOMPurify advisory is the one finding in this tree that can require a change to `sanitizeHtml`'s own configuration; the two dev-only advisories it then surfaces are **fixed with pnpm overrides rather than excepted** (the ADR-0026 precedent), leaving `ignoreGhsas` empty — the first time this project has had both a sub-`high` threshold and zero suppressions
- [x] 17.12 Close the two **surface-documentation gaps** the review found, both additive: the root re-exports 8 of the 10 error classes — `DomContractError` and `PeerMissingError` are missing — while ADR-0003 and `index.js`'s own module comment both state the taxonomy is re-exported from the root, so honour the clause or amend it; and spec 01 §5 still enumerates 23 root exports and 7 error classes against today's 35 and 10, so either reconcile it, scope it explicitly to F1–F25, or delegate it to the 17.3 generated reference (review §3.2, §3.4) _(route: fast/medium)_ — per [ADR-0053](docs/adr/0053-the-full-taxonomy-reaches-the-root.md): the clause is **honoured**, both classes re-exported from the root, with a test keyed off `/errors`' own export list so an eleventh class can't drift the same way again; spec 01 §5 gets a scope note (it is F1–F25's original surface, not the current one) rather than a rewrite, pointing at specs 02–04's own §5 additions and at 17.3's future generated reference. Cost another 70 B in the root bundle — the second NFR-01 amendment this milestone, 6.05 kB → **6.1 kB**
- [x] 17.13 Extend the ADR-0047 rule to caller-supplied **descriptor** shapes, which 17.7 deliberately left out: `bsTable` column definitions, `bsCarousel`/`bsAccordion`/`bsTabs`/`bsNavbar` items, `bsListGroup`/`bsBreadcrumb` items, `bsCard`'s `image`, and the `controls` sub-configs. A mistyped `sortible` on a column is as silent as a mistyped option was, and columns are hand-written per application, so the exposure is if anything higher — but they are read per item on a different code path, and a per-row check has a per-row cost that has to be measured before it is adopted. Same question, same freeze deadline _(route: standard/medium)_ — **adopted**, per [ADR-0056](docs/adr/0056-descriptors-are-checked-too.md), across **14 shapes** on three entries (the roadmap's list plus `/table`'s own `TableColumn` and `/dom`'s `TableBindings`, which are the same class of thing and share the deadline). The per-item cost the item required measured first: **0.18 µs per descriptor**, which is ~13× the cost of *reading* one and **0.34%** of a 500-item `bsListGroup` build — the render dominates by three orders of magnitude, so relative cost was the misleading number. A per-**row** check stays rejected on the same evidence: columns are configuration, rows are data. ADR-0047's "the destructuring is the schema" only half transfers, and the ADR says where: at a funnel the values are used, elsewhere the pattern is a written schema whose one silent failure mode is harmless. Cost: **3 budget rows** against 17.7's seventeen, and `bsTable` now projects columns down to the F42 subset before handing them to `tablePipeline` — which the typedef always claimed it did
- [x] 17.14 Collapse the `#webcrypto` shim, which the 17.2 floor made vestigial: `globalThis.crypto` landed in **Node 19**, so the node shim's `?? webcrypto` fallback and its `node:crypto` import now cover only runtimes below the floor — and with both shims reduced to `globalThis.crypto` the two-file conditional import, the `dist/node` build pair and the root entry's `node` export condition all lose their reason to exist. Supersedes [ADR-0008](docs/adr/0008-one-webcrypto-surface-conditional-exports.md), shrinks the published tarball by two of four builds, and touches the exports map — which is why it was kept out of the floor PR and why it should land **before** M18 pins that map byte-identical (spec 05 NFR-23) _(route: standard/high — packaging + a superseded ADR)_ — done per [ADR-0054](docs/adr/0054-one-web-crypto-surface-without-the-conditions.md): two shims → one plain module, and the whole `imports` field, the `node` export condition, the `dist/node` pair and the two source entries in `files` all deleted. **One entropy door and no `Math.random` — ADR-0008's actual principles — are kept**; only the machinery that carried a `node:crypto` import for the Node 18 floor is gone. The verification payoff beyond a smaller tarball: agadoo and the size budgets already gate the neutral artifact, so **what CI measures is now what every consumer gets** — the node pair was exempt from the shakeability gate by design


---

## Milestone 18 — Browser distribution

The no-bundler consumer becomes first-class: a plain HTML page — no Node, no npm, no
bundler — loads the library from a static server or a CDN and gets the same typed
contracts. Nine of ten entries already pass exactly this path in CI; this wave closes the
tenth (`/sanitize`, per the 17.6 ADR), ships the missing single-file artifact and CDN
resolution, and documents and gates what has so far been a fixture-only truth. Spec:
[`docs/specs/05_spec_browser_distribution.md`](docs/specs/05_spec_browser_distribution.md).
**Runs after v1.0.0** — additive by construction once 17.6 has extracted the only
breaking-risk piece, per the owner's recorded 1.x stance. The candidate 1.x feature waves
identified by the same triage (M19–M21 below, plus unnumbered widget candidates) are
recorded in
[ADR-0046](docs/adr/0046-one-proposal-triaged-and-the-no-bundler-wave-adopted.md).

- [x] 18.1 `/sanitize` no-bundler behavior per the 17.6 ADR: the entry loads with no import map, the peer is reachable per that contract, and absence surfaces as `EGL_PEER_MISSING` naming `dompurify` — never a module-resolution failure at load (spec 05 F82) _(route: standard/high — security: sanitizer reachability is security posture)_ — proved on three engines from a static server by `src/test/browser/no-bundler-sanitize.spec.js`, on a fixture with **no import map and no DOMPurify at all**: the shared smoke fixture supplies the peer in its `<head>`, so the *absent* case — the security-relevant half, whose wrong answer is returning the caller's markup unsanitized — was unobservable there. Seven assertions per engine, including the built entry carrying no bare specifier, absence throwing rather than passing through, and a classic `<script>` landing *after* the module still satisfying the lookup (ADR-0055 needed no change)
- [x] 18.2 The global single-file artifact: `dist/global/egl-utils.global.js`, IIFE + sourcemap, `window.egl` namespacing the full public surface, peers external, no load side effects; the budget row lands pinned to measured + ≤ 7% under the 40 kB authoring ceiling (spec 05 F83, NFR-22) _(route: standard/high — sets-pattern: the artifact every CDN consumer scripts against)_ — the namespace is composed by `export *` from a non-entry source module so it cannot drift by omission, and the `var egl = …` assignment is the bundler's, which keeps `sideEffects: false` true and makes "no side effect beyond defining `egl`" a property of the build rather than a promise; every F83 claim is a gate (`tools/assert-global-artifact.mjs`) run against the built file in `check:package`, including the sub-namespace/root collision that `export *` would otherwise shadow silently. **Measured 31 444 B, budget pinned to 33.6 kB (+6.9%)** — 25% under the sum of the ten entry rows — and NFR-22 amended with the figure and with the metric its own gate uses, per [ADR-0059](docs/adr/0059-one-file-one-global-and-a-budget-repinned.md)
- [x] 18.3 CDN resolution and the packaging gates: `unpkg`/`jsdelivr` fields target the artifact, the exports map stays byte-identical, and a packaging test asserts the fields name files present in the packed tarball (spec 05 F84, NFR-23) _(route: standard/medium)_ — two fields, one value, and the `package.json` diff is **two added lines above an untouched exports map**. The value is the IIFE rather than the root entry because the URL a CDN answers for a bare package name is fetched by a classic `<script src>`, where an ESM file is a syntax error on the consumer's page. `tools/assert-packaged-files.mjs` reads the **packed tarball's own file list** — the only thing a CDN can see — and asserts every advertised path is in it: both CDN fields, all 41 exports-map targets and the artifact's sourcemap; it also asserts `main`/`module`/`browser` stay **absent**, since `browser` would silently redirect bundler consumers onto the single-file artifact. Per [ADR-0060](docs/adr/0060-the-cdn-default-and-what-the-tarball-proves.md)
- [x] 18.4 The no-bundler documentation: README "Use from a browser, without npm" — per-entry deep ESM URLs, the artifact route, how each peer is supplied on each route, and the same-version rule for shared chunks; every snippet mirrored by an 18.5 fixture (spec 05 F85) _(route: fast/medium)_ — the shared-chunk claim is not asserted on faith: `errors.js`, `table.js` and `bootstrap.js` were checked and do pull the identical `chunk-47ELFAOV.js` today, which is what makes the same-version rule concrete rather than a hedge. Forward-linked from the existing Sanitize and Bootstrap sections rather than duplicating their examples. No new ADR: the mechanism decisions (peer lookup, the artifact, the CDN fields) are already ADR-0041/0055/0059/0060 — this item only documents them
- [x] 18.5 CI no-bundler smoke and unbundled transfer accounting: Playwright loads the package exactly as the docs say (deep ESM with no import map; classic `<script src>`) on three engines, and size rows gate each documented request waterfall plus the artifact (spec 05 F86–F87, NFR-24) _(route: standard/medium)_ — **closes M18.** Twelve assertions per engine over both routes, including F83's no-side-effects clause **measured** (the window's own property names diffed across the artifact's load: exactly `egl`) and the README's artifact snippet run verbatim. F87 got its own gate rather than `.size-limit.json` rows, because a deep-ESM route is a set of **content-hashed** chunks — one comment line in `errors.js` renames four of nine, measured then reverted — so the budgets are keyed by entry name and the closure is resolved at run time, per [ADR-0061](docs/adr/0061-served-bytes-are-their-own-accounting.md), which also amends spec 05 §6. The accounting found the route advice the README now carries: **`/bootstrap` costs 31 276 B over 7 requests, the whole artifact 31 605 B over 1**


---

## Milestone 19 — Table data & bsTable extras

Adopted wave ([ADR-0046](docs/adr/0046-one-proposal-triaged-and-the-no-bundler-wave-adopted.md)).
Spec: [`docs/specs/06_spec_table_data.md`](docs/specs/06_spec_table_data.md), authored in
its own planning PR before implementation — **F88–F100 and NFR-25–NFR-30**. Scope: the spec
04 §1 backlog quoted verbatim — *"CSV/Excel export, sticky headers, column resize and
reorder"* — plus the two capabilities the ADR-0046 triage found absent and highest-value:
asynchronous data and row selection. Execution order among M19–M21 was the owner's post-1.0
call; M19 was chosen first.

**This is the first wave planned after 1.0, and that governs it.** Spec 06 NFR-25 makes
*additive-only* a hard, mechanically-proved requirement: no existing export, option name,
error code or exports-map path moves, because all 113 are MAJOR-protected. Where a
capability could have been delivered by changing `tablePipeline`, it is delivered beside it
instead — which is why §4 attaches async and selection *around* the F42 derivation rather
than inside it. Two shapes for the async adapter remain defensible, so F88–F91 fix the
**observable contract** and defer the mechanism to an ADR in 19.1, the way spec 05 F82
deferred to ADR-0055.

- [x] 19.1 Async/remote data for the pipeline (spec 06 **F88–F91**): a source contract `{load(query, signal)}`, latest-request-wins with the losing load **aborted** (not merely ignored), a transport-neutral query serialization, and load status in the derived view where a failure **leaves the previous rows in place**. Composes `httpClient`/`createResource`/`urlSearchParams` by injection, importing them nowhere. The adapter-vs-option mechanism is deliberately left to this item's ADR; the spec fixes only the observable contract _(route: frontier-reasoning/high — sets-pattern + decision-heavy: the data contract every later data-driven component reuses)_ — **
emotePipeline is a sibling of `tablePipeline`, not a wrapper around it** ([ADR-0062](docs/adr/0062-a-sibling-not-a-wrapper.md)): a binder that fed the server's already-filtered page into a pipeline that filters again would have reused the most code and shipped a silent double-derivation, so the two share a command vocabulary and no implementation. The race rule compares identity **at apply time**, not just at abort — a property test over randomized interleavings fails after one case when that check is removed. Surface diff: **+2 exports, 113 → 115 bindings, root unchanged** (NFR-25's proof); `{tablePipeline}` unchanged at 3 389 B, so a consumer who does not import the new one pays none of it. Spec 06 NFR-30 corrected here: entry rows move per PR, because the size gate runs per PR
- [x] 19.2 Pipeline state ↔ URL (spec 06 **F92–F93**): a pure, SSR-safe round-trip that **preserves unknown query parameters** and degrades malformed input to defaults rather than throwing, plus a `/dom` history binding that restores in **one** `batch` transaction — four restored commands firing four `change`s would land back on page 1. Api-floor amendment: `history.pushState`/`popstate` _(route: standard/high)_ — `tableStateToParams`/`tableStateFromParams` on `/table` and `bindTableHistory` on `/dom`, per [ADR-0063](docs/adr/0063-the-url-is-the-state-and-the-page-goes-last.md). **The batch was necessary and not sufficient**: every command except `setPage` resets the page inside its own commit, so the restore applies the page **last** — batching alone would have landed every shared link on page 1. Six api-floor entries added and the scanner now polices `history`. Surface 115 → 118, additions only, proved as a diff (NFR-25). The F92 property suite found [BUG-0004](docs/bugs/2026/08/BUG-0004-view-filters-lose-a-proto-column.md) in F42 code — a column keyed `__proto__` was filtered for real and reported by the view as no filter — fixed here
- [x] 19.3 Row selection (spec 06 **F94–F95**): keyed by `rowKey`, never by identity or index, so a selection survives a server round-trip and a re-sort; single/multiple, `getSelection()`, the F6 observer shape, and select-all-on-page whose **meaning under an active filter is specified** rather than left to the reader. `bsTable` checkbox column with the indeterminate header state, keyboard operability and a real accessible name _(route: standard/high)_ — `tableSelection` on `/table` and `bsTable({selection})`, per [ADR-0065](docs/adr/0065-a-set-of-keys-and-the-page-it-can-see.md). **Select-all means this page and only this page**, and the invisible remainder is a number the caller can always read: `stats(rows)` returns `offPage`, which is what a confirmation dialog owes the user. Rows leaving the source are **kept** — pruning would make "select forty, filter, act" act on eleven, silently — with `prune()` as the named opt-out. Surface 118 → 119, additions only. NFR-27 measured: selectAll over 10k rows **3.77 ms**, getSelection with 10k keys **0.040 ms**, both against a 10 ms budget. The tests found two defects on the way: a radio group name that was not unique across tables, and a dead branch deleted rather than mock-covered. Spec 06 F95's "pays nothing" clause corrected — true of the runtime, false of the bundle
- [x] 19.4 Export (spec 06 **F96–F97**): RFC 4180 CSV from the derived view or the selection, client-side and zero-dep, with **formula injection neutralized by default** — a CSV opened in a spreadsheet is a code-execution surface, and the default is documented and defeatable. Clipboard on `/dom` with the permission failure typed, so "nothing happened" is distinguishable from success. Excel stays out of core, a caller callback being the extension point (the zero-runtime-deps rule) _(route: standard/medium — security: the export is an injection surface)_ — `tableCsv` on `/table` and `copyToClipboard` on `/dom`, per [ADR-0066](docs/adr/0066-a-csv-is-not-an-inert-document.md). The injection default has **one exception that makes it liveable**: a field whose whole text is a number is left alone, because prefixing every negative number would corrupt whole columns to buy nothing and is how a security default gets switched off wholesale. Four typed clipboard refusals (`unsupported`/`insecure`/`denied`/`failed`) and **no `execCommand` fallback**, since a fallback would restore the very ambiguity F97 removes. The round-trip is proved against an RFC 4180 parser written from the spec rather than from the writer. Surface 119 → 123, additions only; the api-floor gate caught `navigator.clipboard` on its first run — a read that optional chaining hid until 19.8. **The artifact is at 91% of NFR-22's 40 kB ceiling** with 19.5–19.7 to go
- [x] 19.5 Sticky header (spec 04 backlog; spec 06 **F98**) — within a caller-owned scroll container, without per-frame layout measurement, and without breaking the header's existing `aria-sort` and sort controls _(route: standard/medium)_ — `bsTable({sticky})`, per [ADR-0067](docs/adr/0067-five-declarations-and-no-scroll-listener.md). **`position: sticky` and nothing else**: no scroll listener, no `requestAnimationFrame`, no measured layout — five declarations applied once, which is why it needs no api-floor amendment and costs 372 B. Applied per `th` rather than to `thead`, so the F95 selection column sticks along with it for free; the collapsed border is redrawn as an inset shadow and the cell given a `--bs-*` background, because a sticky cell otherwise loses its rule and lets rows scroll through it. `sticky.maxHeight` bounds the F71 wrapper and **refuses to be passed without `responsive`**, since a height applied nowhere is a header that never sticks with nothing to say why. **Surface unchanged at 123** — a whole capability as an option. The artifact projection from 19.3/19.4 is corrected: this item cost 256 B, not ~1500 B, so ~3.2 kB of the NFR-22 ceiling remain for 19.6–19.7
- [x] 19.6 Column resize (spec 04 backlog; spec 06 **F99**) — pointer-driven **with a keyboard-operable alternative**, widths readable and restorable so a caller can persist them, minimum widths enforced, and no row re-render _(route: standard/medium)_ — `bsTable({resize})`, per [ADR-0068](docs/adr/0068-a-colgroup-a-separator-and-a-ceiling-in-sight.md). **Widths live on a `<colgroup>`**, so a resize writes one property on one node that is not a row and "no row re-render" is structural rather than a promise — asserted by node identity, not by counting. The grip is **one** widget for both paths: `role="separator"` with a tab stop and `aria-value*`, the platform's own window-splitter pattern, so the drag and the arrow keys carry one state instead of two that can disagree. `table-layout: fixed` is applied **lazily at the first change**, because enabling a capability must not re-lay-out a table nobody has touched. Pointer capture keeps all five listeners on a node this library built (ADR-0045). What a caller reads is the width the table **enforces**, not the pixel the engine painted — they differ by the container under a `width: 100%` table, and only the former round-trips. **The budget decision this item owed**: the artifact is at 38 076 B of NFR-22's 40 kB, so 19.7 has 1 924 B and this item cost 1 165 B
- [x] 19.7 Column reorder (spec 04 backlog; spec 06 **F100**) — spec 03 §1's drag-and-drop non-goal is **superseded**, on the condition F100 states: drag is permitted as *an* affordance, never the only one, and the authoritative interface is the programmatic order, so a caller can build their own affordance and persist order without touching the DOM _(route: standard/high)_ — `bsTable({reorder})`, per [ADR-0069](docs/adr/0069-an-order-is-a-permutation-and-the-ceiling-held.md). **The order is a permutation of column keys and the pipeline never sees it** — reorder is presentation, so the F42 derivation is untouched and no new command exists. Applying one **moves nodes rather than rebuilding them**, and the leading offset is computed per row, so the header, the body, the F67 filter row and the empty-state row are all handled without the permutation knowing which is which. A drag is a **displacement** — how far the pointer travelled against half the neighbour's width — because the absolute rule written first failed in a real engine: with the handle on the leading edge it demanded the column's own width plus half the neighbour's before anything moved. Live swaps rather than a drop indicator, so the drag owns no extra node. **The ceiling held**: +822 B served, leaving **1 102 B under NFR-22's 40 kB**, which is therefore not amended — but ADR-0041's 25 kB `/bootstrap` clause now has **609 B**, and M20 builds on that entry. Spec 06 is delivered with this item; 19.9 is the defect it found

- [x] 19.9 Fix [BUG-0005](docs/bugs/2026/08/BUG-0005-filter-row-misaligned-under-a-selection-column.md), found by 19.7: the F67 filter row renders one `<td>` per column with no leading cell, while the header row and every body row prepend one for the F95 selection column — so a table with `selection` **and** `controls.filterRow` has had every filter input drawn under its neighbour since 19.3, with the last column appearing to have none. Silent and visual: the wiring is correct (each input filters the column its `aria-label` names), so a sighted user and a screen-reader user see different tables. Decide between an empty leading `<td>` and a `<th scope="row">` carrying the selection column's accessible name, and check whether any other opt-in pair mirrors the columns without the prologue _(route: standard/medium — a defect in 15.2 code exposed by 19.3, so it ships on its own)_ — an empty `<td>` carrying the selection column's own class, because the cells beside it are `<td>` for a stated reason (they hold controls, and a header cell there would attach itself to the data below) and an empty cell does not change that; a row header would also claim the filter row is *about* the selection column, which it is not. **No other row mirrors the columns without the prologue** — all six per-column loops checked. The ADR-0069 permutation needed no change, exactly as its per-row offset was designed to allow, and a regression test now pins that. **No released version was affected**: M19 is unreleased, so the ledger entry's `affected-versions` is corrected from `v1.1.0` to none

- [x] 19.8 Close two blind spots in the api-floor scanner that roadmap 19.2 walked into: `tools/check-api-floor.mjs` strips template literals **whole**, interpolations included, so `` `${location.pathname}` `` is invisible to its deny-by-default scan; and its member pattern needs a bare `.`, so optional chaining is invisible too — `globalThis.location?.protocol` in `storage.js` has never been scanned, and neither has anything reached that way since. Both were verified by removing an inventory entry and watching the check stay green. ADR-0017 promised deny-by-default and currently delivers it only for the syntax someone thought of; 19.2 kept its own reads scannable by hand, which is a workaround and not the fix. Expect the fix to surface un-inventoried uses elsewhere — that is the gate working, and each one is an explicit ADR-0017 decision _(route: standard/medium — a verification gap, not a feature; found by 19.2)_ — the scan is now `tools/api-floor-scan.js`, pure and **tested**, per [ADR-0064](docs/adr/0064-the-gate-that-was-watching-nothing.md). The deliverable is the 22-test suite, not the regexes: this scanner has been found blind twice by different waves, and a pattern fixed without a test is only the next blind spot. Template literals keep their interpolations (a hand-rolled tokenizer, because interpolations nest), optional chaining is a member read, and a computed key is **refused** rather than waved through. It surfaced exactly one real finding — `location.protocol` in `storage.js`, unscanned since M6 — and the new tests caught a third bug inside this PR, a `?[` pattern that should have been `?.[`. 19.2's concatenation workaround in `dom-history.js` is removed, since its reason is gone


---

## Milestone 20 — Application UX utilities

Adopted wave ([ADR-0046](docs/adr/0046-one-proposal-triaged-and-the-no-bundler-wave-adopted.md)).
Spec: [`docs/specs/07_spec_application_ux.md`](docs/specs/07_spec_application_ux.md), authored
in its own planning PR before implementation — **F101–F111 and NFR-31–NFR-36**. Scope: the
layer an application writes on top of a finished component catalogue — **behaviour that
outlives a single component**. Execution order among the items is the owner's call;
numbering fixes identity, not sequence.

**Two ceilings bind this wave, and the spec settles both before the first item starts** —
which is the whole reason it was planned rather than begun. `/bootstrap` measures 24 406 B
against [ADR-0041](docs/adr/0041-a-peer-looked-up-not-imported.md)'s 25 kB clause, leaving
**594 B**, while `bsModal` and `bsToast` alone — the two components 20.1 and 20.2 wrap —
measure 1 266 B and 2 473 B. The wave does not fit and no care makes it fit, so **F101–F108
land on a new entry** (spec 07 NFR-32) rather than inside a ceiling ADR-0041 sized for the
*finished* catalogue. And because the F83 artifact carries the whole surface, a new entry
lands in it wherever it lives: at 38 911 B against NFR-22's 40 kB there are 1 089 B, so the
wave **re-derives that ceiling by spec 05's own method** and commits the arithmetic (NFR-33).
Raising the number without redoing the derivation is the one thing that clause forbids.

- [x] 20.1 Promise-based dialogs over `bsModal` (spec 07 **F101–F103**): `confirm`/`prompt`/custom returning a promise that **resolves** with the dialog's answer — a dismissal is an answer, not an error, and exactly one settlement survives any race of dismissals — with focus trapped while open and restored to where it came from, through the F109 primitives rather than a second implementation. Owes the ADR that fixes the surface shape (free functions vs a manager instance) and the new entry's name, both deferred by spec 07 §4 _(route: frontier-reasoning/high — sets-pattern: the promise-wrapper shape later dialogs copy, and it carries the entry decision)_ — `createDialogs` on the new **`egl-utils-js/ui`** entry, per [ADR-0071](docs/adr/0071-a-manager-not-three-globals-and-a-dismissal-is-an-answer.md). **A manager, not three free functions**: spec 07 §6 asks for a `destroy()` that settles a dialog open *now*, and a returned promise has nowhere to hang one — plus thirteen shared options that want defaulting once, and `confirm`/`prompt` as module exports would shadow the platform globals at every import site. Only "could not be asked" rejects (`EGL_DOM_CONTRACT`, `EGL_PEER_MISSING`); the answer is recorded **before** anything starts closing, so exactly-once stops depending on transition timing, and the suite counts settlements rather than reading values. The three-engine suite earned its place: **WebKit moved focus out of the dialog on the first Tab** with Bootstrap left to place it, so the dialog now places focus itself and ADR-0070's trap keeps the narrow scope it documented. NFR-22 is **re-derived a second time to 57 kB** (eleventh input, 57 278 B) with the row re-pinned to 42 kB — and the eleventh entry cost `/bootstrap` 9 B and `/dom` 2 B without either changing a line, which their deep-ESM routes paid for at +2 607 B / +2 requests and +524 B / +1
- [x] 20.2 Toast manager over `bsToast` (spec 07 **F104–F105**): a queue with a max-visible cap, dedupe and update-by-id — with what "identical" means part of the contract — plus a `promise()` helper that shows **one** toast and transitions it rather than three that tell the story out of order, passing the caller's settlement through untouched _(route: standard/medium)_ — `createToasts` on `/ui`, per [ADR-0072](docs/adr/0072-a-queue-a-rule-nobody-has-to-guess-and-one-toast-per-story.md). **"Identical" is written down**: same `variant`, `title` and `message`, and only when message and title are both strings — node content is exempt rather than compared by a rule that would never fire, a duplicate is *dropped* while the toast already up has its lifetime restarted (Bootstrap's own `show()` clearing its timeout), and **an explicit `id` leaves the dedupe system entirely** in both directions, which a test found the first implementation getting wrong. F69 has no update, so an update **hides and redraws in the slot it vacates** — reserving that slot so newer arrivals cannot overtake it, with a dismissal outranking a pending replacement — because mutating the node would mean reimplementing the variant vocabulary that makes F69's no-stale-classes property structural. `promise()` returns the **caller's own promise**, so the settlement passes through and an unhandled rejection stays theirs. NFR-22 re-derived a **third** time to 59 kB (59 447 B, same eleven inputs): the derivation is redone whenever any input moves, not only when an entry is added
- [x] 20.3 Theme management (spec 07 **F106–F107**): `data-bs-theme` get/set/toggle over Bootstrap's own mechanism, `prefers-color-scheme` tracking that follows the system only while the user has expressed no choice, persistence through the F21 storage wrapper, a documented `<head>` snippet that applies a persisted theme **before first paint**, and a toggle control whose accessible name names the state it will move to _(route: standard/medium)_ — `createTheme` and `themeSnippet` on `/ui`, per [ADR-0073](docs/adr/0073-bootstraps-own-attribute-and-a-snippet-that-cannot-drift.md). **`'auto'` is the absence of a stored value**, not a third state, so "no choice yet" and "follow the system" are literally one condition and cannot disagree; the preference is held **in memory with storage as its mirror**, which a test forced — deriving it from storage on every read made a failed write silently revert the manager's own view, so the attribute said dark while `resolved()` said light and the next system change undid the choice. The `<head>` snippet is **emitted rather than documented** (421 B, the one export here that imports nothing): a README snippet shares the key and the attribute by coincidence, and the suite asserts the emitter and the manager agree by running the string. **This item, not 20.4, owed the NFR-34 floor amendment** — "follow the system" is a media query — so `matchMedia` joins the scanner's policed globals and three entries are declared, of which `MediaQueryList.change` (Safari 14) is the one worth checking rather than assuming. NFR-22 re-derived a **fourth** time to 60 kB (60 914 B), `/storage` moving 3 B without changing a line because `/ui` now shares a chunk with it
- [x] 20.4 Breakpoint observation (spec 07 **F108**): `matchMedia` over Bootstrap's breakpoint names with a subscribe API and a current-value read, so a component asks once instead of every component re-deriving the same query. **The NFR-34 api-floor amendment this item was written to owe already landed in 20.3**, which needed a media query first — `matchMedia`, `MediaQueryList.matches` and `MediaQueryList.change` are declared and the scanner polices the global (ADR-0073); what remains here is the breakpoint vocabulary and the subscribe shape _(route: standard/medium)_ — `createBreakpoints` and the frozen `BOOTSTRAP_BREAKPOINTS` map on `/ui`, per [ADR-0074](docs/adr/0074-bootstraps-own-mixins-five-queries-and-a-seam-written-once.md). The four predicates are Bootstrap's four SCSS mixins **with the meanings its source gives them rather than the ones their names suggest** — `down('md')` is *narrower than md*, the BS4→BS5 change people trip over — read from `scss/mixins/_breakpoints.scss`, whose own inline comment contradicts its code. **Five queries, not eleven**: BS5's `-down` is the complement of `-up` and `-only`/`-between` are intersections of two `-up`s, so one `min-width` per non-zero breakpoint derives the whole vocabulary and the 0.02px subtraction never appears in this library. The two places a mixin degenerates — `down('xs')`, and a reversed `between` — **throw** rather than return a plausible boolean. `on()` reports a *crossing* rather than a media change, so a drag from 800 to 900 px says nothing and a jump from 500 to 1500 says it once. The `matchMedia` seam is **extracted on its third use** and the F106 manager rewritten onto it, because "what does an absent `matchMedia` mean" is exactly the answer that drifts when written twice; 20.6 inherits it. `createBreakpoints` measures 1 237 B against a 9 567 B entry — NFR-02 as a number. NFR-22 re-derived a **fifth** time to 61 kB (61 685 B)
- [x] 20.5 A11y primitives on `/dom` (spec 07 **F109–F110**): a reusable focus trap and focus save/restore **extracted** from the F50 overlay — where a correct implementation already exists and nothing else can reach it — including the empty-root case that turns a trap into a lock; plus a live-region announcer that leaves focus unmoved. F110 closes the gap [ADR-0069](docs/adr/0069-an-order-is-a-permutation-and-the-ceiling-held.md) named: a column moved by F100's keyboard path is announced to nobody today _(route: standard/high — focus and live-region timing are classically bug-prone)_ — `focusTrap`, `saveFocus` and `liveRegion`, per [ADR-0070](docs/adr/0070-two-primitives-extracted-and-a-ceiling-recomputed.md). **`saveFocus` is the extraction and the trap is new**: the overlay had focus save/restore and never had a trap, so the honest half is lifted out and `loadingOverlay` now calls it — one implementation of "put focus back where it was", three callers. The trap is **scoped to Tab and says so**, with no document-level `focusin` guard, because a primitive that fights focus moved by assistive technology is the wrong primitive; everything between the edges is left to the platform's own tab order. No layout is read to decide tabbability — a forced layout per Tab press is the cost F98 refused. An empty root focuses **itself** under a temporary `tabindex="-1"`, which is the case that turns a trap into a lock. **NFR-22 is re-derived, not raised**: spec 05's own method (the sum of the measured entry figures) reads 52 104 B today against ≈39.8 kB at M18, so the clause becomes 52 kB while the size-limit row stays pinned at measured + 2% and remains the gate
- [ ] 20.7 Make the Playwright suite deterministic under local parallelism. Measured while verifying 20.1: a full `pnpm test:browser --project=chromium` run fails **2 of 142 tests on `main` and 3 of 150 with 20.1 applied**, always a different pair, always passing on a re-run in isolation — so it is contention, not a defect. The suite is `fullyParallel` with one worker per core, and each worker asks the repo's minimal static server for Bootstrap's bundle and stylesheet per test; 20.1 removed its own share of that by inlining both from `node_modules` and raising its file's timeout, which is a fix for one file rather than for the cause. Bound the workers, serve the peer assets from memory, or pin the timeouts deliberately — and decide whether the same shape can bite CI, where a red run people learn to re-run is worse than no gate at all _(route: standard/medium — a verification-infrastructure defect, filed by 20.1 rather than folded into it)_
- [x] 20.6 Reduced-motion policy helper on `/dom` (spec 07 **F111**): one query point components consult, on the same subscribe shape as F108. A helper, not a manager — a MotionManager stays rejected (ADR-0046) _(route: fast/low)_ — `reducedMotion` on `/dom`, per [ADR-0075](docs/adr/0075-one-query-point-and-a-seam-that-crossed-a-boundary.md). **The interesting problem was not the helper — it was the seam.** `mediaResolver` (ADR-0074) was `/ui`-internal because its first two consumers were both there; F111 sits on the other side of the boundary spec 07 §4 draws (`/ui` depends on `/dom` primitives, never the reverse), so the seam moved to `dom-media.js` rather than being copied a third time — one answer to "does absent `matchMedia` throw or degrade" instead of a plausible second. `on()` passes the new boolean directly rather than F108's `{current, previous}` pair, since `previous` is always the logical negation for one axis and would carry no information. **The measurement discipline caught a real mistake**: a first draft imported `bootstrap-elements.js`'s `assertPlainObject` for one validation, which cost `/dom`'s deep-ESM route **over 4 kB** — the whole atom builder contract — for a helper that itself measures under 300 B; replaced with the same three-line inline check `dom-a11y.js`'s primitives already use, which is exactly the dependency spec 07 §4 sends this item to `/dom` to avoid. NFR-22 re-derived a **fifth** time to 62 kB (61 938 B) — the first re-derivation in the wave that `/dom`, not `/ui`, caused


---

## Milestone 21 — Form engine

Provisional wave ([ADR-0046](docs/adr/0046-one-proposal-triaged-and-the-no-bundler-wave-adopted.md)):
the largest adopted gap, and the one behind a frozen non-goal — spec 04 §1 excludes "a
form-validation framework", so this wave's spec (08) formally supersedes that clause
before any implementation. Same rules as M19/M20; execution order is the owner's post-1.0
call.

- [ ] 21.1 Form value binding & serialization: `getValues`/`setValues` over native controls, JSON and `FormData` output, reset-to-initial _(route: frontier-reasoning/high — sets-pattern: the form contract everything below builds on)_
- [ ] 21.2 Validation engine: declarative sync/async/cross-field rules, severity levels, incremental validation _(route: standard/high)_
- [ ] 21.3 Bootstrap adapter: `is-invalid`/`invalid-feedback`/`was-validated` wiring over the engine _(route: standard/medium)_
- [ ] 21.4 Submit lifecycle: busy state, double-submit guard, `HttpError` body → field-error mapping _(route: standard/high — security: mapping untrusted server payloads onto the DOM)_
- [ ] 21.5 Dirty/touched tracking and an unsaved-changes guard _(route: standard/medium)_


---

## Spec Coverage Map

Tracks which spec section is fulfilled by which roadmap item(s). Every spec section has a
row with at least one fulfilling item and a status glyph. Legend: ⏳ not started · 🚧 in
progress · ✅ done · ❎ N/A.

### Spec 01 — core utils (F1–F25, frozen)

| Spec § | Requirement | Roadmap items | Status |
|--------|-------------|---------------|--------|
| §1 | Objective & business context | 1.1, 7.6 | ✅ |
| §2 | Functional requirements | 1.1, 1.2, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 6.1, 6.2, 6.3, 7.6, 17.6 | ✅ |
| §3 | Non-functional requirements | 1.3, 1.4, 2.6, 3.6, 5.3, 6.4, 7.1, 7.2, 7.3, 7.6, 8.1, 17.2, 17.4, 17.7, 17.10, 17.11, 17.12, 17.14 | ✅ |
| §4 | Logical architecture | 1.1, 7.6 | ✅ |
| §5 | Public interface | 1.2, 2.1, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 6.1, 6.2, 6.3, 7.6, 17.1, 17.6, 17.7, 17.12, 17.14 | ✅ |
| §6 | Verification & test strategy | 1.2, 1.4, 2.6, 4.4, 5.6, 6.4, 6.5, 7.1, 7.2, 7.6, 8.1 | ✅ |

### Spec 02 — core extensions: text, net, query & logging (F26–F41)

| Spec § | Requirement | Roadmap items | Status |
|--------|-------------|---------------|--------|
| §1 (02) | Objective & business context | 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 10.1 | ✅ |
| §2 (02) | Functional requirements F26–F41 | 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 10.1 | ✅ |
| §3 (02) | Non-functional requirements | 9.1, 9.2, 9.3, 9.5, 9.6, 10.1, 17.7 | ✅ |
| §4 (02) | Logical architecture | 9.1, 9.3, 10.1 | ✅ |
| §5 (02) | Public interface | 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 10.1, 17.13 | ✅ |
| §6 (02) | Verification & test strategy | 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 10.1 | ✅ |

_Spec 02 is complete as of M10 (v0.3.0): F26–F41 all delivered._

### Spec 03 — DOM toolkit, UI components & the table pipeline (F42–F51)

| Spec § | Requirement | Roadmap items | Status |
|--------|-------------|---------------|--------|
| §1 (03) | Objective & business context | 11.1, 11.2, 11.3, 12.1, 12.2, 13.1, 13.2 | ✅ |
| §2 (03) | Functional requirements F42–F51 | 11.1, 11.2, 11.3, 12.1, 12.2, 13.1, 13.2, 15.2, 17.9 | ✅ |
| §3 (03) | Non-functional requirements | 11.1, 11.2, 12.1, 12.2, 13.1, 13.2, 13.3, 17.9 | ✅ |
| §4 (03) | Logical architecture | 11.1, 13.1, 13.2 | ✅ |
| §5 (03) | Public interface | 11.1, 11.2, 11.3, 12.1, 12.2, 13.1, 13.2, 15.2, 17.7, 17.8, 17.9, 17.10, 17.13 | ✅ |
| §6 (03) | Verification & test strategy | 11.1, 11.2, 11.3, 12.1, 12.2, 13.1, 13.2 | ✅ |

_Spec 03 is complete as of M13 (v0.6.0): F42–F51 all delivered._

### Spec 04 — Bootstrap 5 toolkit (F52–F81)

| Spec § | Requirement | Roadmap items | Status |
|--------|-------------|---------------|--------|
| §1 (04) | Objective & business context | 14.1, 14.2, 15.1, 15.2, 16.1, 16.2, 16.3, 16.4, 16.5 | ✅ |
| §2 (04) | Functional requirements F52–F81 | 14.1, 14.2, 15.1, 15.2, 16.1, 16.2, 16.3, 16.4, 17.8, 17.9 | ✅ |
| §3 (04) | Non-functional requirements | 14.1, 14.2, 15.1, 15.2, 16.1, 16.4, 16.5 | ✅ |
| §4 (04) | Logical architecture | 14.1, 15.1, 16.1 | ✅ |
| §5 (04) | Public interface | 14.1, 14.2, 15.1, 15.2, 16.1, 16.2, 16.3, 16.4, 17.7, 17.8, 17.9, 17.13 | ✅ |
| §6 (04) | Verification & test strategy | 14.1, 14.2, 15.1, 15.2, 16.1, 16.2, 16.3, 16.4, 16.5 | ✅ |

### Spec 07 — application UX: dialogs, notifications, theme & a11y (F101–F111)

| Spec § | Requirement | Roadmap items | Status |
|--------|-------------|---------------|--------|
| §1 (07) | Objective & business context | 20.1, 20.2, 20.3, 20.4, 20.5, 20.6 | ✅ |
| §2 (07) | Functional requirements F101–F111 | 20.1, 20.2, 20.3, 20.4, 20.5, 20.6 | ✅ |
| §3 (07) | Non-functional requirements | 20.1, 20.2, 20.3, 20.4, 20.5, 20.6 | ✅ |
| §4 (07) | Logical architecture | 20.1, 20.5, 20.6 | ✅ |
| §5 (07) | Public interface | 20.1, 20.2, 20.3, 20.4, 20.5, 20.6 | ✅ |
| §6 (07) | Verification & test strategy | 20.1, 20.2, 20.3, 20.4, 20.5, 20.6 | ✅ |

### Spec 05 — browser distribution (F82–F87)

| Spec § | Requirement | Roadmap items | Status |
|--------|-------------|---------------|--------|
| §1 (05) | Objective & business context | 17.6, 18.1, 18.2, 18.3, 18.4, 18.5 | ✅ |
| §2 (05) | Functional requirements F82–F87 | 17.6, 18.1, 18.2, 18.3, 18.4, 18.5 | ✅ |
| §3 (05) | Non-functional requirements | 18.2, 18.3, 18.5, 20.5, 20.1, 20.2, 20.3, 20.4, 20.6 | ✅ |
| §4 (05) | Logical architecture | 18.2, 18.3 | ✅ |
| §5 (05) | Public interface | 18.1, 18.2, 18.3, 20.1 | ✅ |
| §6 (05) | Verification & test strategy | 18.1, 18.5 | ✅ |

### Spec 06 — table data, selection & column ergonomics (F88–F100)

| Spec § | Requirement | Roadmap items | Status |
|--------|-------------|---------------|--------|
| §1 (06) | Objective & business context | 19.1, 19.2, 19.3, 19.4, 19.5, 19.6, 19.7 | 🚧 |
| §2 (06) | Functional requirements F88–F100 | 19.1, 19.2, 19.3, 19.4, 19.5, 19.6, 19.7 | 🚧 |
| §3 (06) | Non-functional requirements | 19.1, 19.2, 19.3, 19.4, 19.6, 19.7, 19.8 | ✅ |
| §4 (06) | Logical architecture | 19.1, 19.2, 19.3 | 🚧 |
| §5 (06) | Public interface | 19.1, 19.2, 19.3, 19.4, 19.5, 19.6, 19.7 | 🚧 |
| §6 (06) | Verification & test strategy | 19.1, 19.2, 19.3, 19.4, 19.5, 19.6, 19.7 | 🚧 |
