# ADR-0046: One proposal triaged — and the no-bundler wave adopted

- **Status:** Accepted
- **Date:** 2026-08-09
- **Deciders:** Daniel Polo
- **Related:** [spec 04 §1](../specs/04_spec_bootstrap_toolkit.md) (the non-goals this
  triage inherits, and the backlog it quotes verbatim),
  [spec 05](../specs/05_spec_browser_distribution.md) (authored by the same PR),
  ROADMAP 17.6 and M18–M21,
  [ADR-0041](0041-a-peer-looked-up-not-imported.md) (the peer-resolution contract the
  `/sanitize` decision is measured against),
  [ADR-0012](0012-sanitize-default-profile.md) (how DOMPurify is reached today),
  [spec 03 §1](../specs/03_spec_dom_ui_table.md) (the non-goals several rejections cite)

## Context

The owner brought a 74-section concept document — *"Specifica di idee — Libreria JavaScript
di estensione per Bootstrap 5.3.x"* — proposing an enterprise application-UI layer over
Bootstrap 5.3: component controllers with a uniform lifecycle, a `DataSource`/`Query`/filter
DSL, a rich DataTable, a form engine, theme/motion/a11y managers, a catalogue of advanced
widgets, and an ERP application shell. The document is written in Italian, so under
AGENTS.md §2 it cannot enter the repository; the owner keeps it untracked, and this record
is its English disposition. With it came an operating objective stated directly: **the
library must be usable from a plain HTML page, with no Node and no bundler.**

Two audits ground the triage.

**Distribution reality.** Nine of the ten entries already load and run from a static page
via `<script type="module">` — the Playwright suite proves it in CI on three engines, by
loading `/dist/esm/*.js` raw from a hand-rolled static file server. The browser build is
platform-neutral, its chunk imports are relative, `#webcrypto` resolves to
`globalThis.crypto` at build time, and `/bootstrap` reaches its peer by lookup
(injected → `globalThis.bootstrap` → typed `EGL_PEER_MISSING`), which is exactly what a CDN
page needs. What breaks, and what is missing:

- `dist/esm/sanitize.js` opens with `import createDOMPurify from "dompurify"` — a bare
  specifier, fatal at module load on a page with no bundler and no import map. The test
  fixture papers over it with an import map; a consumer gets an opaque resolution error.
  Two optional peers, two contradictory mechanisms — and ADR-0041 argues the lookup side
  from the CDN consumer's seat.
- No single-file global artifact exists (`tsup` emits `esm` and `cjs` only), so classic
  `<script src>` pages have nothing to load.
- `package.json` carries no `unpkg`/`jsdelivr`/`browser` field, so the bare CDN URL
  resolves to nothing; only deep `/dist/esm/...` paths work, and no documentation names
  them.
- All 98 size budgets model post-tree-shaking bundler output; nothing measures what a
  static page actually transfers.

**Coverage reality.** Much of the proposal is already this library, delivered under its own
contracts: the composed table pipeline, the full 24/24 Bootstrap catalogue as lifecycle
wrappers and builders, the reference-counted overlay gate, escape-by-default population,
the teardown discipline, the typed error taxonomy. A second group is genuinely absent and
utilities-shaped: async table data, row selection, the catalogued `bsTable` extras, promise
dialogs, a toast manager, theme management, a breakpoint observer, URL-persisted pipeline
state, reusable a11y primitives, a form engine. A third group conflicts with the library's
identity or its recorded non-goals: a component lifecycle framework with auto-init
scanning, a TypeScript-first rewrite, a reactive `StateStore`, an ERP application shell.

One correction is carried forward here rather than by editing history: spec 04 §1 catalogues
**four** `bsTable` backlog items — *"CSV/Excel export, sticky headers, column resize and
reorder"* — while the 2026-08-09 v1-readiness journal shorthanded them as three. Journals
are immutable checkpoints; the count is corrected in this record and in spec 05.

## Decision

Adopt **browser distribution** as the fifth capability wave: spec 05 owns F82–F87 and
NFR-22–NFR-24, milestone **M18** implements it, and it runs **after v1.0.0** because every
part of it is additive — except one. The `/sanitize` peer-resolution contract is the one
piece a 1.0 would freeze wrong, so deciding it becomes **ROADMAP 17.6**, inside the
readiness milestone, before the surface is MAJOR-protected; spec 05's F82 is written
mechanism-neutral and defers to that ADR. Plan the adopted feature work as **provisional
numbered milestones now** — M19 (table data & `bsTable` extras), M20 (application UX
utilities), M21 (form engine) — each carrying its items and route annotations, each still
owing its own spec (06–08) in its own planning PR before implementation starts, and with
execution order among them deliberately left as the owner's post-1.0 call: the numbering
fixes identity, not sequence. Defer the advanced-widget catalogue as unnumbered candidates
recorded here. Reject the proposals that conflict with the library's charter or its frozen
non-goals, enumerated in the appendix.

## Alternatives Considered

- **Adopt the proposal wholesale, as a new framework or sibling package** — the document
  describes a coherent product (its §66 even ships a ten-milestone roadmap). Rejected: the
  product it describes is an application UI framework — lifecycle manager, plugin registry,
  auto-init, application shell — and this repository's charter is a utilities library.
  Framework ambitions land as composable functions here or they do not land; a separate
  package is a separate decision for a separate day.
- **Reject the document wholesale** — defensible on non-goals alone. Rejected: the
  distribution audit says the owner's no-bundler objective is one line of `/sanitize` and
  one missing artifact away from being real, and the coverage audit shows the table-data
  and UX gaps are genuine, small in surface, and compose from primitives that already
  exist (`httpClient`, `urlSearchParams`, the pipeline's `'change'` event, `bsModal`,
  `bsToast`, the storage wrappers).
- **Author specs 06–08 now, alongside spec 05** — most thorough on paper. Rejected: specs
  freeze on acceptance, and M17 is about to move exactly the inputs those specs would
  freeze against — 17.1's shape-consistency findings, 17.2's runtime floor (which the
  api-floor inventory is computed from), 17.4's facade-budget clause. With one PR in
  flight at a time, authoring them now buys no schedule and guarantees amendment churn.
- **Leave the `/sanitize` decision to M18, after 1.0** — cheapest today. Rejected: if the
  chosen contract is incompatible with the static import, changing it post-1.0 is a
  breaking change for bundler consumers; deciding it pre-1.0 is precisely the kind of work
  M17 exists to spend the major boundary on. Leaving it for 17.1 to "find" was also
  rejected — it is already found, and the house pattern (M8, 13.3, 16.5) files found work
  as an explicit item immediately.

## Consequences

- ROADMAP gains 17.6 (a decision item inside M17), M18 with F-numbered items, and M19–M21
  as provisional milestones whose items carry no F-numbers until their specs exist. The
  coverage map gains a spec 05 sub-table only; specs 06–08 will bring theirs.
- The README milestone table grows four rows; GitHub milestones M18–M21 are created with
  the planning PR, which attaches to M18 (the #105 precedent).
- The patterns catalogue records the pattern-level rejection this triage entails —
  Registry + auto-init scanning — as a *Rejected* row linking this ADR.
- The Italian source document never enters git; this ADR's appendix is the durable English
  record of every verdict, so future wave planning cites this file, not the file that
  cannot be committed.
- Costs accepted: M19–M21 items are planned against specs that do not exist yet, so their
  wording may be refined (never renumbered) by the wave planning PRs; and the widget
  catalogue stays unnumbered, which is a deliberate under-commitment.

## Appendix — disposition of the proposal, section by section

Verdicts: **Delivered** (exists under this library's contracts) · **Adopted** (planned,
with its ROADMAP home) · **Partial** (part exists, the delta is dispositioned) ·
**Deferred** (recorded candidate, unnumbered) · **Rejected** (with the governing reason) ·
**Aligned / N/A** (agreement or not applicable to a utilities library).

| Proposal § | Verdict | Rationale / where |
|---|---|---|
| §1 Product vision | Aligned | Layered, opt-in, tree-shakeable, no fork, vendor as peer — the shape specs 03/04 already enforce. The "extension library" identity itself is not adopted: this stays a utilities library. |
| §2.1 Composition over inheritance | Delivered | Wrappers compose Bootstrap's constructors, `getOrCreateInstance` and events (F68–F81; ADR-0041/0042). |
| §2.2 Uniform controller API | Rejected | A one-size lifecycle (`mount`/`refresh`/`setState` on everything) publishes methods half the components would have to throw; the house rule is shape-per-need (ADR-0043). |
| §2.3 Synthetic lifecycle events | Rejected | Bootstrap's own events are subscribed directly; a second lifecycle vocabulary is surface without behavior. |
| §2.4 DOM event namespace (`bex:*`) | Rejected | Components expose `on()` over vendor events or compose the F6 emitter; no `CustomEvent` bus is shipped. |
| §2.5 Config merge order | Partial | Options-over-defaults exists per export. Global and theme configuration layers are rejected: module-level mutable state is what spec 01 §4 forbids. |
| §2.6 TypeScript-first | Rejected | The toolchain is JSDoc-typed ES2023 with generated `.d.ts` (AGENTS.md §9); consumers receive full types either way. |
| §2.7 No jQuery | Delivered | Native DOM throughout. |
| §3 Package structure | N/A | The house layout is ADR-0002's cross-language tree. |
| §4 Core framework (`ComponentController`, `ComponentRegistry`, `AutoInitializer`, `ConfigResolver`, `PluginRegistry`) | Rejected | A component lifecycle framework is a spec 03 §1 non-goal; ambient auto-init inverts explicit composition (patterns catalogue, *Rejected*); `MutationObserver` sits outside the deny-by-default api floor (NFR-16). |
| §5 `DataSource<T>` | Adopted → 19.1 | Scoped to an async source contract for the table pipeline — not a generic client-side CRUD/ORM. |
| §6 Query model & filter DSL | Partial → 19.1/19.2 | The F33 grammar and pipeline filters exist; the missing piece — serializing pipeline state for a server — is adopted with the async source. |
| §7 DataTable (7.1–7.19) | Partial → M19 | Delivered: population, sort, filter, search, paging, composition, loading/empty, rendering security (F42, F66–F67). Adopted: selection (19.3), CSV/clipboard export (19.4), sticky header (19.5), column resize (19.6), column reorder (19.7), URL-persisted state (19.2), async robustness (19.1). Deferred: grouping/aggregation, inline editing, column chooser/pinning, infinite scroll. Rejected: virtualization (spec 03 §1 non-goal; only a superseding ADR reopens it). |
| §8 + §15 Form controller & validation engine | Adopted → M21 | Sits behind spec 04's "form-validation framework" non-goal: M21's own spec supersedes that clause formally before any implementation. |
| §9–§14, §16 Field controllers (input/textarea, select, checkbox/radio, range, input group, floating label, file upload) | Deferred | Widget-tier candidates; revisited after M21 fixes the form contract they would attach to. |
| §17–§43 Component controllers (accordion → tooltip) | Delivered (lifecycle level) | The full catalogue is F52–F81. Enrichment beyond the vendor's behavior is not adopted wholesale; the exceptions that earn items are §29's promise dialogs (20.1) and §39's toast manager (20.2). §38's `LoadingManager` already exists as F50/F71; §33's pagination as F65 + the pipeline. §41–§43 (typography/image/figure behaviors) are low-priority deferred candidates. |
| §44 `BreakpointObserver` / `ResponsiveController` | Split | The observer is adopted → 20.4 (`matchMedia` needs an api-floor amendment). `ResponsiveController` is rejected: conditional mount/unmount by viewport is application logic. |
| §45 `ThemeManager` | Adopted → 20.3 | Bootstrap 5.3's `data-bs-theme` is the mechanism; §56.19's toggle folds into the same item. |
| §46 `MotionManager` | Rejected; helper → 20.6 | An animation-preset system is design-system territory; only a reduced-motion policy helper is adopted. |
| §47 Style/variant manager | Rejected | Builders already take variants as data; a class-juggling API would duplicate Bootstrap's vocabulary as mutable state. |
| §48 `StateStore` | Rejected | A reactive-state library is a spec 03 §1 non-goal. |
| §49 URL state / deep-linking | Adopted → 19.2 | Pipeline-scoped serialization + history integration; router integration stays out. |
| §50 Accessibility as cross-cutting | Partial → 20.5 | Focus save/restore exists inside F50; a reusable focus trap and a LiveRegion announcer are adopted. Roving tabindex and a keyboard-nav manager stay deferred. |
| §51 Security | Delivered | Escape-by-default, the required-sanitizer pair, one-sanitizer rule, no `eval` (NFR-19; ADR-0030/0037/0044). URL protocol allow-listing for data-driven `href`/`src` is noted as a hardening candidate. |
| §52 Performance | Delivered | Size budgets, shakeability and benchmark gates are enforced (NFR-01/02/04); virtualization per §7. |
| §53 Memory-leak rules | Delivered | The teardown contract is NFR-15 with ADR-0029/0045. |
| §54 Error handling | Delivered | `EglError` taxonomy with stable codes (ADR-0003). |
| §55 i18n | Partial (by policy) | Intl primitives plus injected wording (NFR-21) are the house policy; a string catalogue with pluralization is an application concern — rejected. |
| §56.1–56.15 Advanced widgets | Deferred | Unnumbered candidates: combobox/autocomplete, date/time/range pickers, tree view, stepper, command palette, context menu, virtual list and infinite scroll (windowing is a spec 03 non-goal — superseding ADR required), dropzone/upload, split pane, empty state, popconfirm, notification center. |
| §56.16–56.18, §56.20–56.25 ERP shell (`ApplicationShell`, `AppHeader`, `NavigationRail`, `HeroSection`, `DynamicCardGrid`, `AppFooter`, `PageHeader`, `ActionBar`, `StatusBar`) | Rejected | Application scaffolding: layout regions, routing, permissions and workspace state belong to an application — or to a separate package with its own charter — not to a utilities library. |
| §56.19 `ThemeToggle` | Adopted → 20.3 | Folded into the theme item. |
| §57 Behaviors as mixins | Rejected | Capabilities ship as composable functions, not a mixin framework; `PermissionAware` is application logic. |
| §58 Programmatic API shape | Aligned | Named exports and options objects are already the house idiom. |
| §59 Declarative `data-*` API | Rejected | Auto-init; see §4. |
| §60 CSS naming | N/A | The library ships no CSS; its internal data attributes already use the `egl` prefix. |
| §61 Compatibility strategy | Delivered | `bootstrap ^5` optional peer, an explicit browserslist floor, the api-floor gate (ADR-0017), no implicit polyfills. |
| §62 Bundling & distribution | Adopted → spec 05 / M18 | The wave this ADR admits. Subpaths, ESM, `sideEffects` and dual build already hold; the global artifact, CDN resolution, documentation and no-bundler gates are the gap. |
| §63 Testing strategy | Delivered | The house strategy meets or exceeds each bullet: property suites, a three-engine browser matrix, a sanitizer bypass corpus, leak checks. |
| §64 Observability / diagnostics mode | Rejected | A development-diagnostics subsystem is not a utilities concern; `/logging` and `normalizeError` are the primitives an application builds it from. |
| §65 Documentation strategy | Delivered | Per-export JSDoc and README recipes exist; the navigable reference is ROADMAP 17.3. |
| §66–§67 Proposed roadmap & priorities | Superseded | Mapped onto M18–M21 plus the deferred candidates; execution order among M19–M21 is the owner's post-1.0 call. |
| §68 Decisions to avoid | Aligned | Every listed anti-decision is already forbidden by house rules: no vendor monkey-patching, no `innerHTML` for untrusted data, no SQL from the browser, no global state singletons, no mandatory framework. |
| §69 Three-layer design | Delivered | The agnostic-core / `/bootstrap` layering rule is spec 04 §1's backbone; the vendor is reached only through the lookup contract. |
| §70–§71 TypeScript contracts & examples | N/A | Illustrative; this library's types are generated from JSDoc. |
| §72 Enterprise quality bar | Delivered | Each criterion is an existing gate or contract in this repository. |
| §73–§74 References & conclusion | Aligned | The closing thesis — query, selection, paging and persistence as reusable capabilities rather than table internals — is the design brief M19 inherits. |

## References

- [spec 04 §1](../specs/04_spec_bootstrap_toolkit.md) — the verbatim backlog: *"CSV/Excel
  export, sticky headers, column resize and reorder"*.
- [spec 05](../specs/05_spec_browser_distribution.md) — the wave this ADR admits.
- [ADR-0041](0041-a-peer-looked-up-not-imported.md) — the resolution contract 17.6 measures
  `/sanitize` against.
- `src/test/browser/fixture.html` — the import-map crutch that marks the exact gap F82
  closes.
- docs/journal/2026/08/2026-08-09-browser-distribution-planning.md — the session checkpoint
  for this triage.
