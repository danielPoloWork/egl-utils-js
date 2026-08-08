# Architecture Decision Records

One numbered Markdown file per decision, in the lightweight
[Michael Nygard](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
format. Numbering is sequential and never reused or renumbered. Template:
[`template.md`](template.md).

Open an ADR when a choice affects the public surface or compatibility, when two reasonable
options exist and the rationale is non-obvious, when a **design pattern** is adopted, or
when superseding a prior decision. Do **not** open one for routine implementation details
or trivially reversible choices.

Status transitions: `Proposed` → `Accepted` → (`Superseded by ADR-XXXX` | `Deprecated`).

## Index

| ADR | Title | Status |
|-----|-------|--------|
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions | Accepted |
| [0002](0002-adopt-cross-language-source-layout.md) | Adopt the cross-language source layout | Accepted |
| [0003](0003-error-taxonomy-stable-codes.md) | Error taxonomy — stable codes over cross-realm instanceof | Accepted |
| [0004](0004-signal-first-cancellation-contract.md) | Signal-first cancellation contract for async combinators | Accepted |
| [0005](0005-validate-email-linear-scan.md) | validateEmail — a hand-rolled linear scan, no regex | Accepted |
| [0006](0006-typed-event-emitter-contract.md) | Typed EventEmitter — single-payload maps and non-silent isolation | Accepted |
| [0007](0007-http-client-facade-contract.md) | httpClient — a fetch facade with a no-token-storage auth contract | Accepted |
| [0008](0008-one-webcrypto-surface-conditional-exports.md) | One Web Crypto surface via conditional exports — never Math.random | Accepted |
| [0009](0009-parse-duration-grammar.md) | parseDuration — a strict, ordered h/m/s grammar, no calendar units | Accepted |
| [0010](0010-storage-in-memory-fallback-contract.md) | Storage wrappers — silent in-memory fallback, quota as StorageError | Accepted |
| [0011](0011-cookie-helper-security-defaults.md) | cookieHelper — secure-by-default attributes, encoded values, no HttpOnly claim | Accepted |
| [0012](0012-sanitize-default-profile.md) | The curated sanitize profile — deny-by-default, and how DOMPurify is reached | Accepted |
| [0013](0013-benchmark-fair-comparison-methodology.md) | Benchmark methodology — what counts as a fair comparison, and what we refuse to compare | Accepted |
| [0014](0014-nightly-regression-gate-design.md) | The nightly NFR-04 gate — enforce a parity floor, not a diff against history | Accepted |
| [0015](0015-final-size-budgets-and-the-httpclient-exception.md) | Final size budgets, and the one per-function budget composition cannot meet | Accepted |
| [0016](0016-release-pipeline-and-supply-chain.md) | Release pipeline — trusted publishing, a manual trigger, and one documented advisory | Accepted |
| [0017](0017-platform-api-floor-gate.md) | Verifying the platform-API floor — BCD data plus a deny-by-default inventory | Accepted |
| [0018](0018-version-on-the-root-surface.md) | Re-export `VERSION` from the root entry | Accepted |
| [0019](0019-subpath-family-and-code-unit-text-semantics.md) | The spec-02 subpath family, and code units as the text measure | Accepted |
| [0020](0020-strict-ipv4-parsing-and-the-sortable-key-codec.md) | Strict IPv4 parsing, and a fixed-width sortable key codec | Accepted |
| [0021](0021-filter-expression-grammar.md) | A total filter-expression grammar, interpreted without regular expressions | Accepted |
| [0022](0022-comparator-total-order-semantics.md) | Comparator semantics — a total order, pinned blanks, and locale by opt-in | Accepted |
| [0023](0023-duration-round-trip-and-the-error-record.md) | `formatDuration` as an exact inverse, and one record shape for any thrown value | Accepted |
| [0024](0024-page-session-id-scope-and-budget.md) | `pageSessionId` — a correlation id, not a credential, and the 2 kB `/storage` clause it breaks | Accepted |
| [0025](0025-resource-repository-over-an-injected-client.md) | A REST resource as a Repository over an injected client | Accepted |
| [0026](0026-brace-expansion-override-replaces-the-audit-exception.md) | A range-scoped override replaces the `brace-expansion` audit exception | Accepted |
| [0027](0027-logging-formatter-sink-split.md) | A logger split into a threshold, a formatter, and a sink | Accepted |
| [0028](0028-dom-entry-fails-fast-and-the-floor-gate-sees-the-dom.md) | The `/dom` entry fails fast, and the floor gate learns to see the DOM | Accepted |
| [0029](0029-delegation-teardown-and-setter-symmetry.md) | Teardown as a signal, and setters that stay symmetric | Accepted |
| [0030](0030-sanitize-is-a-required-parameter.md) | The sanitizer is a required parameter, not a default | Accepted |
| [0031](0031-component-instances-and-the-alert-budget.md) | Components are instances that own their state — and what one costs | Accepted |
| [0032](0032-overlay-gate-refcount-floor-and-focus.md) | The overlay gate — a reference count, a floor measured from the appearance, and contained presentation failures | Accepted |
| [0033](0033-js-yaml-overrides-stay-inside-their-major-line.md) | A patched js-yaml on both major lines — and why the replacement range is pinned, not open | Accepted |
| [0034](0034-one-owner-one-derivation-and-the-pipeline-budget.md) | One owner, one derivation — and what the pipeline costs | Accepted |
| [0035](0035-the-controls-bridge-and-the-dom-budget.md) | The controls bridge — one-way inputs, injected wording, and what /dom costs | Accepted |
| [0036](0036-collecting-every-benchmark-and-the-collapse-floor.md) | Collect every benchmark, and gate the absolute ones on a collapse floor | Accepted |
| [0037](0037-builder-contract-nodes-escape-and-the-atom-budget.md) | The builder contract — nodes over strings, escaping by construction, and what an atom costs | Accepted |
| [0038](0038-composites-compose-and-what-a-frozen-constant-costs.md) | Composites compose — the close control is not an icon, and what a frozen constant costs | Accepted |
| [0039](0039-a-facade-with-a-door-and-what-the-table-costs.md) | A facade with a door — the borrowed pipeline, the cell that refuses to guess, and what the table costs | Accepted |
| [0040](0040-one-grammar-one-pager-and-a-ceiling-below-its-own-parts.md) | One grammar, one pager — and a ceiling that sat below its own parts | Accepted |
| [0041](0041-a-peer-looked-up-not-imported.md) | A peer looked up, not imported — and the one place containment loses | Accepted |
| [0042](0042-ids-are-the-accessibility-and-a-ceiling-derived-not-guessed.md) | Ids are the accessibility — and the first ceiling derived rather than guessed | Accepted |
