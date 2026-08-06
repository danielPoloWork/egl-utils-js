# Software Specification: Core Extensions — Text, Net, Query & Logging (JavaScript (ES2023))

> Second-wave contract for `egl-utils-js` (milestones M9–M10). Frozen once accepted:
> diverging implementation updates this spec in the same PR or adds an ADR superseding
> the relevant section. Functional numbering continues the global sequence started by
> [`01_spec_utils.md`](01_spec_utils.md) (F1–F25): this document owns **F26–F41**.

## 1. Objective & Business Context

Applications keep re-implementing the same second tier of utilities per project: string
shaping for fixed-width output, IPv4/CIDR handling for network-facing tooling, typed
filter/sort primitives behind every data table, duration/error formatting for
diagnostics, a REST resource layer hand-written once per endpoint family, a per-tab
session identity, and a structured console logger. Re-implementation per app costs
correctness (each copy re-discovers the same edge cases), auditability (no shared tests
or budgets), and consistency (each copy hardcodes its own locale, class names, and
policies).

This wave extends `egl-utils-js` with those utilities as **pure, Node-safe,
individually tree-shakeable named exports**, under the same enterprise gates as the
first 25 items. Policy is always injected (locale, sink, storage, transport, operators);
mechanisms ship with neutral defaults.

**Scope boundaries (deliberate non-goals of this wave):** display-oriented date/time
formatting (`Intl.DateTimeFormat` is the platform way); client-side HTTP→HTTPS redirect
helpers (transport security belongs to the server/HSTS layer); reflection-based logger
context capture (breaks under minification — replaced by an explicit `child(context)`
API); DOM, UI-component, and table-pipeline utilities (they follow in spec 03 on
browser-leaning entries).

## 2. Functional Requirements

Text — `egl-utils-js/text` (pure):

- F26 truncate(str, maxLength, {ellipsis='…', position='end'}) — returns `str` unchanged when it fits (so the marker is never re-applied: truncation is idempotent); otherwise a shortened string of **at most** `maxLength` code units including the ellipsis — exactly `maxLength`, except one unit shorter when the cut would split a surrogate pair (ADR-0019: a lone surrogate is never emitted); when `maxLength` is below the ellipsis length the ellipsis itself is truncated, so the budget always holds; `position: 'end'|'start'`; TypeError on non-string input; `''` in → `''` out
- F27 wrapText(str, width, {breakLongWords=false}) — `'\n'`-joined lines, each ≤ `width` code units (a single unbreakable word may exceed it unless `breakLongWords`; with `breakLongWords` a width narrower than one code point overflows by one unit rather than looping); runs of whitespace collapse to one space and existing line breaks are preserved as paragraph boundaries, making re-wrapping at the same width a no-op; total function over strings — `''` → `''`, never throws on string input
- F28 fixedWidth(str, width, {align='left', truncate='end', pad=' '}) — returns exactly `width` code units for every string input (pads or truncates); the logging column-alignment primitive

Net — `egl-utils-js/net` (pure, total: `null` for invalid content, TypeError for wrong input type):

- F29 isIpv4(value) — strict dotted-quad predicate: four decimal octets 0–255, no leading-zero ambiguity, no hex/octal/shorthand forms; never throws on strings
- F30 parseIpv4(value) → [a, b, c, d] octet tuple or null; formatIpv4(octets) → canonical dotted string or null (inverse pair; round-trip law in §6)
- F31 ipv4ToKey(value, {octets=4}) → zero-padded fixed-width key (3 digits per octet, e.g. '192168001010') whose lexicographic order equals numeric address order; ipv4FromKey(key) → dotted form or null; {octets: 1–4} supports partial-prefix keys
- F32 subnetMaskFromPrefix(prefix) — accepts '/24' | '24' | 24 (0–32); returns the dotted subnet mask via bit arithmetic; null on invalid content

Query primitives — `egl-utils-js/table` (pure; this entry later hosts the table
pipeline, spec 03 — one entry, one contract family):

- F33 compileFilter(expression, {caseSensitive=false, locale, operators}) — compiles a user-typed filter expression to a predicate `(value) => boolean`. Grammar (total — every string compiles, see NFR-09): plain text → substring match (default); `!=x` not-equals; `^p` prefix; `s$` suffix; `>n` `<n` `>=n` `<=n` numeric comparison with locale-aware operand parsing; `=null` `=empty` `=blank` and negations `!null` `!empty` `!blank`; `{operators}` registers custom leading-token operators without forking the grammar
- F34 comparator({type='auto', direction='asc', locale, collator, emptiesLast=true}) — comparison factory returning `(a, b) => number` and forming a total order (§6 property laws). `'auto'` probes boolean | number | date (Date instance or ISO-8601 string) | string; strings collate via `Intl.Collator(locale, {sensitivity: 'base', numeric: true})`; null/undefined/'' sort last regardless of direction
- F35 paginate(items, {page=1, pageSize}) → {items, page, pageCount, total} — pure slice; page clamped into [1, pageCount]; TypeError on non-array items or non-positive pageSize

Diagnostics — root entry (pure):

- F36 formatDuration(ms) — inverse of F25 parseDuration, same ordered h/m/s grammar (ADR-0009): descending units, each at most once, '0s' floor; sub-second remainders truncate; round-trip law `parseDuration(formatDuration(x)) === x` for whole-second x; TypeError on non-finite numbers
- F37 normalizeError(value) — total function mapping ANY thrown value (Error | object | primitive | null | undefined) to a uniform diagnostic record {name, message, stack?, code?, status?, detail?, cause} where `cause` is the original value untouched; response-like objects get status/body lifted; never throws

Web — root entry (stateful by contract: holds the injected client):

- F38 createResource(client, path, {id}?) — repository factory over an injected httpClient-compatible transport: {list(query?, opts?), get(id, opts?), create(body, opts?), update(id, body, opts?), patch(id, body, opts?), remove(id, opts?)}; ids and path segments URL-encoded; per-call opts (signal/timeout/headers) pass through to the client; TypeError when the client lacks a required verb method; the client is a parameter, never an import (tree-shaking + testability)

Storage — `egl-utils-js/storage` (stateful):

- F39 pageSessionId({key='egl.pageSessionId', storage}?) — stable per-tab identifier: a v4 UUID minted on first call and persisted through sessionStorage semantics (survives reloads, dies with the tab, distinct across tabs); in non-browser or blocked-storage contexts falls back to the in-memory store (stable within the realm's lifetime) without throwing; built on the F21/F22 wrapper contract and F18 uuid

Logging — `egl-utils-js/logging`:

- F40 logger({level='info', name, sink, format, now, id}?) — level-thresholded structured logger: methods trace/debug/info/warn/error gated by one threshold over LOG_LEVELS (trace < debug < info < warn < error < silent); child(context) returns a logger with 'parent.context' name; clock (now), sink, format, and id are injected with safe defaults; a throwing sink is caught and last-resorted to console.error — logging never throws into application code
- F41 formatLogLine(record) — pure line formatter 'YYYY-MM-DD HH:mm:ss.SSS LEVEL id --- [name] message' with fixed-width columns (F28) and CR/LF stripped from the message — and, one step stronger than this clause first required, from the `name` and `id` columns as well, so the one-record-one-line guarantee is total for every input rather than only for the message (log-injection hardening, ADR-0027); the `id` and `[name]` groups are omitted when empty rather than padded to blanks; formatTimestamp(date, {fractional=true}) — 'YYYY-MM-DD HH:mm:ss[.SSS]' in local time, accepting a Date or epoch milliseconds, no trailing separator when fractional is off; LOG_LEVELS — the frozen ordered level vocabulary

## 3. Non-Functional Requirements

<!-- Hard budgets are numbers with units and directions; each one maps to a mechanical
     CI check (§6). -->

- NFR-08 Bundle budgets (min+gzip, size-limit gate in CI): the root full-import ceiling
  is **unchanged at 6 kB** (spec 01 NFR-01 — this wave never re-negotiates it; the root
  size-limit row may re-baseline to measured+6% *within* that ceiling as F36–F38 land,
  then tightens to measured at wave end). Each **new entry's whole-entry budget is set to
  its measured size plus ≈7% headroom when the entry lands**, and the measured figure is
  recorded in the size-limit row name — the pre-implementation figures below are ceilings
  on that landing measurement, not predictions to be met exactly: `/text` ≤ 0.9 kB
  (**landed: measured 837 B**); `/net` ≤ 0.9 kB (**landed: measured 709 B**); `/table`
  (query primitives, pre-pipeline) ≤ 1.8 kB (**landed: measured 1722 B** — the
  pre-implementation 1.6 kB ceiling was an unmeasured estimate; the three primitives
  carry five comparison modes, locale-aware numeric reading, and a thirteen-token grammar
  between them); `/logging` ≤ 1.6 kB (**landed: measured 1390 B**, row tightened to
  1.45 kB); `/storage` **≤ 2.1 kB** with F39 included (**landed 9.5: measured
  2027 B** — this prediction was wrong: F39 reuses `uuid` per ADR-0008, which costs the
  entry 329 B, so spec 01 NFR-01's `/storage` clause is amended by
  [ADR-0024](../adr/0024-page-session-id-scope-and-budget.md). A wrappers-only import is
  1698 B, so the cost falls only on consumers of F39, and that scenario is a permanent
  size-limit row). The **root row re-baselines as root exports land** and tightens to measured at
  wave end (**complete as of 9.6: measured 5806 B, row tightened to 5.85 kB** — F36-F38
  were the wave's only root additions. The ceiling crunch ADR-0023 anticipated did not
  occur: F38 measured 286 B rather than the ~350 B estimated, because its client is
  injected rather than imported ([ADR-0025](../adr/0025-resource-repository-over-an-injected-client.md))).
  Every new root export gets its own 1 kB single-import scenario row; a
  composite that cannot meet 1 kB takes a **named, measured exception row** documented
  ADR-0015-style. **Landed exceptions: `comparator` at 1.05 kB** (measured 1006 B — six
  bytes over, see [ADR-0022](../adr/0022-comparator-total-order-semantics.md)) and
  **`logger` at 1.45 kB** (measured 1361 B: the factory composes the default formatter,
  the default sink, and F28 `fixedWidth`, so importing it is importing the subsystem —
  the same composition argument ADR-0015 accepted for `httpClient`, recorded in
  [ADR-0027](../adr/0027-logging-formatter-sink-split.md); the formatter alone is 876 B
  and `LOG_LEVELS` alone is 60 B, so the composition is what costs, not the entry); the
  candidate this clause anticipated, `compileFilter`, needed none (measured 954 B).
- NFR-09 Filter-grammar totality & input hardening: `compileFilter` never throws for any
  string expression (fast-check property over arbitrary Unicode — NFR-05's style);
  expressions beyond 1,024 code units degrade to plain substring matching; **no RegExp
  is ever constructed from user input**; predicate evaluation is a single linear scan —
  O(|value| + |expression|) with no backtracking.
- NFR-10 Node-safety: importing `/text`, `/net`, `/table`, `/logging` and calling every
  export succeeds on Node ≥ 18 with no DOM present (proved on the CI matrix); F39
  completes its in-memory fallback in Node without throwing or warning noise.
- NFR-04 non-extension (explicit): spec-02 functions make **no performance-parity
  claims** — no lodash/p-* pinned baselines are added, `docs/benchmarks/baseline.json`
  is untouched, and the nightly regression gate's scope does not grow. Rationale: no
  fair pinned baseline exists for this surface (ADR-0013's refuse-to-compare clause);
  correctness properties, not throughput, are the deliverable.
- NFR-01/02/03/05/06/07 (spec 01) apply unchanged to every new entry and export:
  tree-shakability proven per import, coverage ≥ 95% lines/branches, zero runtime
  dependencies, Node ≥ 18 + evergreen browsers + Safari ≥ 15.4 floor with
  BCD-verified platform-API inventory.

## 4. Logical Architecture & Core Algorithm

Four new **Node-safe, pure entries** join the exports map (ADR-001 family); the root
entry absorbs only three small functions (F36–F38) to respect the frozen 6 kB ceiling:

```text
egl-utils-js            (root)   += formatDuration, normalizeError, createResource
egl-utils-js/errors              (unchanged this wave)
egl-utils-js/storage             += pageSessionId          (browser-leaning, has fallback)
egl-utils-js/sanitize            (unchanged)
egl-utils-js/text       (NEW)    truncate, wrapText, fixedWidth            [pure]
egl-utils-js/net        (NEW)    isIpv4, parseIpv4, formatIpv4,
                                 ipv4ToKey, ipv4FromKey, subnetMaskFromPrefix [pure]
egl-utils-js/table      (NEW)    compileFilter, comparator, paginate       [pure]
                                 (the spec-03 table pipeline joins this entry later)
egl-utils-js/logging    (NEW)    logger, formatLogLine, formatTimestamp,
                                 LOG_LEVELS                                [stateful]
```

Design invariants: named exports only, `sideEffects: false`, no module-level mutable
state (dual-package hazard rule, spec 01 §4). `/logging` reaches F28 `fixedWidth` by
importing the `/text` **source module** directly (tree-shaken; the `/logging` size row
makes any accidental coupling measurable). `pageSessionId` composes the existing storage
wrapper probe and `uuid()` rather than touching platform globals itself. `createResource`
receives its transport as a parameter — dependency injection is the wave's construction
rule: locale, collator, operators, sink, format, clock, id, storage, and client are all
options with neutral defaults, never imports or hardcoded policy.

## 5. Public Interface

Consumers import via the exports map, e.g.
`import { compileFilter, comparator } from 'egl-utils-js/table';`. The public surface:

- Root `egl-utils-js` += `formatDuration`, `normalizeError`, `createResource` (named
  exports; F1–F25 and `VERSION` unchanged)
- `egl-utils-js/text`: `truncate`, `wrapText`, `fixedWidth`
- `egl-utils-js/net`: `isIpv4`, `parseIpv4`, `formatIpv4`, `ipv4ToKey`, `ipv4FromKey`,
  `subnetMaskFromPrefix`
- `egl-utils-js/table`: `compileFilter`, `comparator`, `paginate`
- `egl-utils-js/logging`: `logger`, `formatLogLine`, `formatTimestamp`, `LOG_LEVELS`
- `egl-utils-js/storage` += `pageSessionId`

Error model: **wrong input types throw `TypeError`** (programmer errors); **invalid
content is a domain outcome, not an exception** — the net parsers return `null`
(F15 `validateEmail` precedent) and the filter grammar is total (NFR-09). This wave adds
**no new error classes**; `normalizeError` consumes the existing `EglError` taxonomy
(stable `.code` lifted into the record). Pure/stateful contract per module as labeled in
§2. SemVer surface: every export and the exports-map shape above are MAJOR-protected
once released; pre-1.0, each completed milestone ships as a MINOR (spec 01 §11 policy).

## 6. Verification & Test Strategy

Vitest on the Node 18/20/22 matrix; coverage ≥ 95% lines and branches including every
error path (NFR-03). Property tests (fast-check) prove the laws:

- F26/F27/F28: output-length invariants (truncate ≤ max, wrapped lines ≤ width,
  fixedWidth exactly width) over arbitrary strings and widths
- F30/F31: `formatIpv4(parseIpv4(s)) === s` for canonical forms;
  `ipv4FromKey(ipv4ToKey(s)) === s`; key lexicographic order ≡ numeric address order
- F33: totality — arbitrary Unicode expressions compile and evaluate without throwing
  (NFR-09), plus a table-driven operator × type matrix for branch coverage
- F34: comparator total-order laws (reflexivity, antisymmetry, transitivity) and the
  empties-last invariant under both directions and multiple locales
- F36: `parseDuration(formatDuration(x)) === x` for whole-second x across the F25
  grammar domain
- F37: totality over Error/object/primitive/null/undefined inputs
- F40/F41: threshold gating per level, child-name composition, throwing-sink
  containment, CRLF stripping, no-trailing-separator timestamp — each a named test

Browser proof: a Playwright spec verifies F39 per-tab isolation (two contexts get
distinct stable ids; reload keeps the id) and the `/logging` bundle loads and logs in
all three engines. Packaging gates per PR: size-limit budget rows (NFR-08), agadoo
shakeability, publint + arethetypeswrong, zero-runtime-deps check. Platform-API floor:
this wave adds **no new policed globals** — `Intl.*` is ECMA-402 scope (covered by
`target`/`lib`, recorded in the comparator ADR), and F39 reuses the already-inventoried
storage/crypto surface through the existing wrappers; `pnpm check:api-floor` stays green
by construction. `python tools/consistency_lint.py` guards cross-artifact congruence on
every PR.
