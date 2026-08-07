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


## Rejected

| # | Pattern | Considered for | Rejected because | ADR / PR |
|---|---------|----------------|------------------|----------|
| 1 | Singleton | A module-level default logger (`import { log } from 'egl-utils-js/logging'`), so call sites need no construction | Module-level mutable state is what spec 01 §4 forbids for the dual-package hazard — two realms would hold two loggers, and one realm's reconfiguration would silently not apply to the other. It also makes tests order-dependent (whoever reconfigures the shared instance last wins) and makes two components unable to hold different levels. A factory costs one line at the call site and removes all three problems | [ADR-0027](../adr/0027-logging-formatter-sink-split.md) |
| 2 | Singleton (UI component) | One static alert controller re-pointed at a container by an `onInit(containerId)` call, so any call site can raise an alert without holding an instance | The shared slot is the defect: a second component on the same page inherits the first one's pending auto-hide timer and writes into whichever container initialised last, so a dialog's message closes early or lands on the page behind it — silently and intermittently. An instance per container makes the interference impossible rather than unlikely, and costs one variable | [ADR-0031](../adr/0031-component-instances-and-the-alert-budget.md) |

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
