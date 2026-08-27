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
| [0008](0008-one-webcrypto-surface-conditional-exports.md) | One Web Crypto surface via conditional exports — never Math.random | Superseded by ADR-0054 |
| [0009](0009-parse-duration-grammar.md) | parseDuration — a strict, ordered h/m/s grammar, no calendar units | Accepted |
| [0010](0010-storage-in-memory-fallback-contract.md) | Storage wrappers — silent in-memory fallback, quota as StorageError | Accepted |
| [0011](0011-cookie-helper-security-defaults.md) | cookieHelper — secure-by-default attributes, encoded values, no HttpOnly claim | Accepted |
| [0012](0012-sanitize-default-profile.md) | The curated sanitize profile — deny-by-default, and how DOMPurify is reached | Accepted (peer reach superseded by ADR-0055) |
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
| [0043](0043-three-shapes-that-are-not-a-group.md) | Three shapes that are not a group — and the clause that did not move | Accepted |
| [0044](0044-a-second-peer-one-sanitizer-and-a-catalogue-closed.md) | A second peer, one sanitizer — and a catalogue closed | Accepted |
| [0045](0045-a-controller-from-the-node-s-own-realm.md) | A controller from the node's own realm — and a bug report that undercounted | Accepted |
| [0046](0046-one-proposal-triaged-and-the-no-bundler-wave-adopted.md) | One proposal triaged — and the no-bundler wave adopted | Accepted |
| [0047](0047-an-unknown-option-key-is-a-typeerror.md) | An unknown option key is a `TypeError` — and the destructuring is the schema | Accepted |
| [0048](0048-one-word-one-meaning.md) | One word, one meaning — the vocabulary v1.0.0 freezes | Accepted |
| [0049](0049-commands-throw-queries-answer.md) | Commands throw, queries answer — the instance contract | Accepted |
| [0050](0050-the-1x-runtime-floor.md) | The 1.x runtime floor — Node 22, Safari 16.4 | Accepted |
| [0051](0051-the-sanitizer-s-peer-range.md) | The sanitizer's peer range is compatibility, not security | Accepted |
| [0052](0052-withurlparams-moves-to-the-root.md) | `withUrlParams` is also a root export | Accepted |
| [0053](0053-the-full-taxonomy-reaches-the-root.md) | The whole error taxonomy reaches the root, and spec 01 §5 says what it covers | Accepted |
| [0054](0054-one-web-crypto-surface-without-the-conditions.md) | One Web Crypto surface, without the conditions — and two builds instead of four | Accepted |
| [0055](0055-the-sanitizer-s-peer-is-looked-up.md) | The sanitizer's peer is looked up, not imported — one contract for both peers | Accepted |
| [0056](0056-descriptors-are-checked-too.md) | Descriptors are checked too — and where the rule deliberately stops | Accepted |
| [0057](0057-the-api-reference-is-published-per-release.md) | The API reference is published per release, and documents only the latest | Accepted |
| [0058](0058-the-per-function-budget-keeps-its-exceptions-named.md) | The per-function budget keeps its exceptions named, not exempted | Accepted |
| [0059](0059-one-file-one-global-and-a-budget-repinned.md) | One file, one global — composed by re-export, and a budget re-pinned | Accepted |
| [0060](0060-the-cdn-default-and-what-the-tarball-proves.md) | The CDN default is the artifact — and the tarball is what proves it | Accepted |
| [0061](0061-served-bytes-are-their-own-accounting.md) | Served bytes are their own accounting — keyed by entry, not by chunk | Accepted |
| [0062](0062-a-sibling-not-a-wrapper.md) | A sibling, not a wrapper — where remote rows enter the table | Accepted |
| [0063](0063-the-url-is-the-state-and-the-page-goes-last.md) | The URL is the state — and the page goes last | Accepted |
| [0064](0064-the-gate-that-was-watching-nothing.md) | The gate that was watching nothing — a scanner with a test suite | Accepted |
| [0065](0065-a-set-of-keys-and-the-page-it-can-see.md) | A set of keys, and the page it can see | Accepted |
| [0066](0066-a-csv-is-not-an-inert-document.md) | A CSV is not an inert document | Accepted |
| [0067](0067-five-declarations-and-no-scroll-listener.md) | Five declarations and no scroll listener | Accepted |
| [0068](0068-a-colgroup-a-separator-and-a-ceiling-in-sight.md) | A colgroup, a separator, and a ceiling now in sight | Accepted |
| [0069](0069-an-order-is-a-permutation-and-the-ceiling-held.md) | An order is a permutation, a drag is a displacement — and the ceiling held | Accepted |
| [0070](0070-two-primitives-extracted-and-a-ceiling-recomputed.md) | Two primitives extracted, a trap that knows what it does not do, and a ceiling recomputed rather than raised | Accepted |
| [0071](0071-a-manager-not-three-globals-and-a-dismissal-is-an-answer.md) | A manager, not three globals — a dismissal is an answer, and an eleventh entry | Accepted |
| [0072](0072-a-queue-a-rule-nobody-has-to-guess-and-one-toast-per-story.md) | A queue, a rule nobody has to guess, and one toast per story | Accepted |
| [0073](0073-bootstraps-own-attribute-and-a-snippet-that-cannot-drift.md) | Bootstrap's own attribute, a preference that is not a third state, and a snippet that cannot drift | Accepted |
| [0074](0074-bootstraps-own-mixins-five-queries-and-a-seam-written-once.md) | Bootstrap's own mixins, five queries instead of eleven, and a seam written once | Accepted |
| [0075](0075-one-query-point-and-a-seam-that-crossed-a-boundary.md) | One query point, and a seam that crossed a boundary | Accepted |
| [0076](0076-a-worker-count-decided-and-a-server-that-was-not-the-cause.md) | A worker count decided, one budget instead of six, and the server that was not the cause | Accepted |
| [0077](0077-a-subject-entry-a-primitive-that-stayed-one-and-a-family-not-a-god-object.md) | A subject entry, a primitive that stayed one, and a family rather than a god object | Accepted |
| [0078](0078-latest-wins-per-rule-a-level-that-is-not-a-block-and-an-order-that-is-the-contract.md) | Latest-wins per rule, a level that is not a block, and an order that is the contract | Accepted |
| [0079](0079-a-costume-that-is-only-a-constant-and-a-node-where-the-css-can-see-it.md) | A costume that is only a constant, and a node where the CSS can see it | Accepted |
| [0080](0080-a-guard-that-is-the-promise-and-findings-from-outside-the-engine.md) | A guard that is the promise, a rejection that keeps its name, and findings from outside the engine | Accepted |
