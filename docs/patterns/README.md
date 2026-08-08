# Design Patterns Catalogue

Living index of every design pattern **adopted**, **planned**, **considered and rejected**,
or **under evaluation** for `egl-utils-js`. Mandatory reading whenever a PR introduces
or removes a pattern, and updated in the same PR.

- **Rules** — [`AGENTS.md`](../../AGENTS.md) §8.
- **Canonical taxonomy** — [`design-patterns.md`](design-patterns.md). All pattern names
  used here, in ADRs, and in commit messages must match its spelling and categorisation.

## Architecture style

_No single architectural style committed at intake (typical for a library, which exposes an API
rather than an application architecture). Record one in an ADR here if that changes._


## How to use this catalogue

- **Adding a pattern** — when a PR lands one, add a row to *Implemented / Planned* as
  `Implemented`, with the ADR link and the code location (a real path under
  `src/main/javascript/...`); a pattern decided in an ADR but not yet in code is added as `Planned`.
- **Refining** — update the row and link the new ADR.
- **Rejecting** — add it to *Rejected* with the reason; do not silently drop it.
- **Removing** — move the row to *Superseded*, link the superseding ADR, keep the history.

Status vocabulary: `Planned` (decided in an ADR, not yet landed) · `Implemented` (present
in `src/main/...`, ADR `Accepted`) · `Considered` · `Rejected` · `Superseded`.

## Implemented / Planned

_Patterns named in the spec at intake are seeded below as **Planned**; each becomes
**Implemented** with its ADR and a real code location in the PR that introduces it._

| # | Pattern | Status | Problem it addresses | Code location | ADR / PR |
|---|---------|--------|----------------------|---------------|----------|
| 1 | Observer | Implemented | Typed publish/subscribe decoupling: consumers react to named events with exact payload types, without the emitter knowing its subscribers | [events.js](../../src/main/javascript/it/d4np/utils/events.js) | [ADR-0006](../adr/0006-typed-event-emitter-contract.md) |
| 2 | Facade (httpClient) | Implemented | A small stable typed surface over `fetch`: merged timeout/cancellation signals, per-request bearer auth with no token storage, content-type-aware JSON, typed HttpError | [web.js](../../src/main/javascript/it/d4np/utils/web.js) | [ADR-0007](../adr/0007-http-client-facade-contract.md) |
| 3 | Facade (storage wrappers) | Implemented | localStorage/sessionStorage wrappers present a safe stable surface over Web Storage: JSON (de)serialization, a silent in-memory fallback when the real store is unavailable, and quota failures surfaced as typed StorageError | [storage.js](../../src/main/javascript/it/d4np/utils/storage.js) | [ADR-0010](../adr/0010-storage-in-memory-fallback-contract.md) |
| 4 | Adapter | Implemented | sanitizeHtml adapts DOMPurify behind a curated deny-by-default allowlist on a separate entry point, absorbing the two shapes of its export (browser-bound instance vs Node factory) so callers see one stable typed surface | [sanitize.js](../../src/main/javascript/it/d4np/utils/sanitize.js) | [ADR-0012](../adr/0012-sanitize-default-profile.md) |
| 5 | Interpreter | Implemented | A user-typed column filter needs more than "contains", so `compileFilter` defines a small grammar (comparison, prefix/suffix, equality, blank sentinels) and evaluates it without a RegExp — total by construction, so a half-typed expression is a valid program rather than an error, and extensible through injected operator tokens | [table.js](../../src/main/javascript/it/d4np/utils/table.js) | [ADR-0021](../adr/0021-filter-expression-grammar.md) |
| 6 | Strategy | Implemented | `comparator` selects an interchangeable comparison algorithm (auto-probed, string, number, date, boolean) behind one `(a, b) => number` interface, with the collator itself injectable — so a column chooses its ordering at runtime without the caller reimplementing the total-order rules | [table.js](../../src/main/javascript/it/d4np/utils/table.js) | [ADR-0022](../adr/0022-comparator-total-order-semantics.md) |
| 7 | Repository | Implemented | `createResource` mediates between calling code and one remote REST collection, collapsing the six near-identical methods every collection otherwise grows by hand into one factory whose only knowledge is a path and a client — the client injected as a parameter, so any compatible transport works and the function costs 505 B instead of inheriting the 1304 B facade | [web.js](../../src/main/javascript/it/d4np/utils/web.js) | [ADR-0025](../adr/0025-resource-repository-over-an-injected-client.md) |
| 8 | Strategy (logging sink & formatter) | Implemented | Destination and line shape are two independent axes of a log record's fate: `sink` selects where a record goes and `format` how it renders, each swappable at runtime behind a one-function interface — so a text file, a structured transport, and a capturing array in a test are the same logger with different strategies, and the sink receives the formatter so it decides whether formatting happens at all | [logging.js](../../src/main/javascript/it/d4np/utils/logging.js) | [ADR-0027](../adr/0027-logging-formatter-sink-split.md) |
| 9 | Facade (logger) | Implemented | Five level methods and `child()` over a subsystem of threshold comparison, record construction, clock and correlation-id resolution, formatting, dispatch, and failure containment — call sites say `log.info('…')` and never learn that any of it exists | [logging.js](../../src/main/javascript/it/d4np/utils/logging.js) | [ADR-0027](../adr/0027-logging-formatter-sink-split.md) |
| 10 | Dependency Injection (component policy) | Implemented | `inlineAlert` takes its class names, its icons, its clock-driven auto-hide and its teardown signal as options over neutral framework-free defaults, so the visual policy of a design system is supplied by the consumer rather than compiled into the component — the library ships the mechanism (nodes, timer, ARIA role, escaping) and never learns which CSS framework, if any, is in use | [dom-components.js](../../src/main/javascript/it/d4np/utils/dom-components.js) | [ADR-0031](../adr/0031-component-instances-and-the-alert-budget.md) |
| 11 | Bridge | Implemented | `loadingOverlay` separates the abstraction that varies by *behaviour* — reference counting, the minimum-visible floor, focus save/restore — from the implementor that varies by *presentation*, supplied as the `onShow`/`onHide` pair. Either side changes without touching the other: one gate drives a modal, a spinner, or a progress bar, and the spec-04 Bootstrap adapter becomes a preset that bridges the same hooks to `bootstrap.Modal` rather than a second implementation of the timing | [dom-components.js](../../src/main/javascript/it/d4np/utils/dom-components.js) | [ADR-0032](../adr/0032-overlay-gate-refcount-floor-and-focus.md) |
| 12 | Facade | Implemented | `tablePipeline` presents one small surface — commands, a `view()`, one event — over a four-stage subsystem (filter, search, sort, paginate) built from the F33-F35 primitives. A caller drives a table without knowing the derivation order, the memo, or that `Intl.Collator` is involved; the primitives stay individually importable for callers who want the pieces | [table.js](../../src/main/javascript/it/d4np/utils/table.js) | [ADR-0034](../adr/0034-one-owner-one-derivation-and-the-pipeline-budget.md) |
| 13 | Observer | Implemented | The pipeline announces state changes through one `'change'` event carrying the derived view, **composing** the F6 emitter rather than extending it — `on`/`once`/`off` are delegated and `emit` stays inside the closure, so subscribers can observe a state change but never manufacture one. Many subscribers (rows, pagination status, URL sync) read one snapshot, which is what lets the DOM bindings of 13.2 stay a consumer of the pipeline rather than a part of it | [table.js](../../src/main/javascript/it/d4np/utils/table.js) | [ADR-0034](../adr/0034-one-owner-one-derivation-and-the-pipeline-budget.md) |
| 14 | Mediator | Implemented | `bindTableControls` centralises the interaction between a table's DOM controls and its pipeline: the inputs, headers and pagination buttons never reference the pipeline, and the pipeline never learns a binding exists — each side knows only the mediator. That is what keeps the pipeline server-usable and lets the same instance be derived during an SSR pass and adopted by a browser afterwards, and it is why the binding holds no state of its own (the current page for a *next* click is read back from `view()`, never remembered) | [dom-table.js](../../src/main/javascript/it/d4np/utils/dom-table.js) | [ADR-0035](../adr/0035-the-controls-bridge-and-the-dom-budget.md) |
| 15 | Adapter (icon sets) | Implemented | `bsIcon` renders through an injected icon *set*, absorbing the two conventions every icon font uses — one class per icon name, or one class plus a ligature — behind a single `(name) => Element` interface, with `render` covering anything else (an SVG sprite, say). Both conventions ship as frozen **data** presets, so neither is privileged by being compiled in, and no icon font is bundled, imported, or assumed loaded. Same role the sanitize Adapter plays for DOMPurify: one stable surface over incompatible third-party shapes | [bootstrap-elements.js](../../src/main/javascript/it/d4np/utils/bootstrap-elements.js) | [ADR-0037](../adr/0037-builder-contract-nodes-escape-and-the-atom-budget.md) |
| 16 | Dependency Injection (builder policy) | Implemented | The Bootstrap builders take their document, their icon set, their extra classes, every human-readable string, and — for the one markup path — their sanitizer as options. Two consequences the layering depends on: `/bootstrap` never imports `/sanitize`, so the DOMPurify optional peer stays out of the entry entirely; and a builder works inside an iframe, a popup or a server-side DOM because the document is a parameter rather than an ambient assumption. The library ships Bootstrap's markup and class names; the application keeps its palette, its icon font, its language and its trust decisions | [bootstrap-elements.js](../../src/main/javascript/it/d4np/utils/bootstrap-elements.js) | [ADR-0037](../adr/0037-builder-contract-nodes-escape-and-the-atom-budget.md) |
| 17 | Composite | Implemented | `bsCard` and `bsListGroup` treat a component and its parts uniformly: every slot accepts content, a node, or an **array** of either, and a node may itself be another builder's output — a list group inside a card, a badge inside a list item — so a caller composes a tree without the library enumerating the combinations. The uniform `Content` shape is what makes that work: one rendering rule serves a leaf and a branch alike | [bootstrap-composites.js](../../src/main/javascript/it/d4np/utils/bootstrap-composites.js) | [ADR-0038](../adr/0038-composites-compose-and-what-a-frozen-constant-costs.md) |
| 19 | Facade (bsTable) | Implemented | `bsTable` presents one call over a subsystem of five parts — the F42 pipeline's derivation, the F52 builder rules, F44 delegation, Bootstrap's `table-*` vocabulary and the ARIA surface — so the common case is `bsTable(container, {columns, data})`. What makes it a facade rather than a wrapper is the door: `.pipeline` **is** the composed instance, not a copy or a private field, and one supplied by the caller is borrowed rather than adopted. A facade that cannot be escaped becomes a ceiling; this one is a shortcut you can step out of without rewriting the data flow | [bootstrap-table.js](../../src/main/javascript/it/d4np/utils/bootstrap-table.js) | [ADR-0039](../adr/0039-a-facade-with-a-door-and-what-the-table-costs.md) |
| 18 | Decorator | Implemented | `bsAlert` wraps the F49 `inlineAlert` instance, adding Bootstrap's class map and close-glyph convention while keeping the wrapped object's interface exactly — same `show`/`hide`/`destroy`, same timer semantics, same escaping rule. It adds presentation to a component without subclassing it and without touching its behaviour, which is why a fix to the alert engine reaches both entries at once and the two cannot drift | [bootstrap-composites.js](../../src/main/javascript/it/d4np/utils/bootstrap-composites.js) | [ADR-0038](../adr/0038-composites-compose-and-what-a-frozen-constant-costs.md) |


## Rejected

| # | Pattern | Considered for | Rejected because | ADR / PR |
|---|---------|----------------|------------------|----------|
| 1 | Singleton | A module-level default logger (`import { log } from 'egl-utils-js/logging'`), so call sites need no construction | Module-level mutable state is what spec 01 §4 forbids for the dual-package hazard — two realms would hold two loggers, and one realm's reconfiguration would silently not apply to the other. It also makes tests order-dependent (whoever reconfigures the shared instance last wins) and makes two components unable to hold different levels. A factory costs one line at the call site and removes all three problems | [ADR-0027](../adr/0027-logging-formatter-sink-split.md) |
| 2 | Singleton (UI component) | One static alert controller re-pointed at a container by an `onInit(containerId)` call, so any call site can raise an alert without holding an instance | The shared slot is the defect: a second component on the same page inherits the first one's pending auto-hide timer and writes into whichever container initialised last, so a dialog's message closes early or lands on the page behind it — silently and intermittently. An instance per container makes the interference impossible rather than unlikely, and costs one variable | [ADR-0031](../adr/0031-component-instances-and-the-alert-budget.md) |
| 3 | Template Method | Extending the table pipeline's stages through a base class with overridable `filter`/`sort`/`paginate` hooks, so a consumer could subclass it for a bespoke derivation | Inheritance freezes the stage skeleton into the public surface: every hook name and call order becomes SemVer-protected, a subclass can break the invariants the property suites guarantee (page in range, source unmutated), and an exported class defeats the per-import size scenarios by pulling every stage into any subclass. Stage variation is served instead by Strategy slots — a per-column `compare` and `getValue` — which vary the behaviour without publishing the skeleton | [ADR-0034](../adr/0034-one-owner-one-derivation-and-the-pipeline-budget.md) |
| 4 | Builder (fluent) | Assembling Bootstrap elements through a chain — `bsCard().header(x).body(y).build()` — which reads well for the deeply nested components (card, navbar, accordion) spec 04 commits to | Three costs, none of them paid by an options object. Every intermediate method becomes public surface SemVer must protect, so a chain of eight methods is eight times the API to keep stable. Nothing can be validated until `build()`, which moves errors away from the mistake — the opposite of the fail-fast contract the builders otherwise keep (an unnamed icon-only button throws before a node exists). And a chainable object cannot be tree-shaken per method, defeating the per-import size scenarios NFR-02 gates. Options objects are also already the house call shape, so a second one would split the library's idiom for no gain | [ADR-0037](../adr/0037-builder-contract-nodes-escape-and-the-atom-budget.md) |

## Superseded

_No superseded patterns yet._

| # | Pattern | Superseded by | When | ADR / PR |
|---|---------|---------------|------|----------|
| — | —       | —             | —    | —        |

## Candidate patterns to consider

The taxonomy in [`design-patterns.md`](design-patterns.md) lists every pattern in scope. As
the architecture takes shape, narrow that universe to the patterns plausibly applicable to
*this* artifact and list them here by category, each with a one-line "possible application".
A candidate remains a candidate until adopted (own ADR) or explicitly rejected.

## Out-of-scope categories

Record here any taxonomy category pre-classified as not applicable to this artifact (with a
one-line reason), so the policy of explicit rejection is honoured without filling the
*Rejected* table with N/A noise.
