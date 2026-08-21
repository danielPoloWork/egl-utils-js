# Software Specification: Table Data, Selection & Column Ergonomics (JavaScript (ES2023))

> Sixth-wave contract for `egl-utils-js` (milestone M19). Frozen once accepted: diverging
> implementation updates this spec in the same PR or adds an ADR superseding the relevant
> section. Functional numbering continues the global sequence
> ([`01_spec_utils.md`](01_spec_utils.md) owns F1–F25,
> [`02_spec_core_extensions.md`](02_spec_core_extensions.md) owns F26–F41,
> [`03_spec_dom_ui_table.md`](03_spec_dom_ui_table.md) owns F42–F51,
> [`04_spec_bootstrap_toolkit.md`](04_spec_bootstrap_toolkit.md) owns F52–F81,
> [`05_spec_browser_distribution.md`](05_spec_browser_distribution.md) owns F82–F87): this
> document owns **F88–F100** and **NFR-25–NFR-30**.
>
> **This is the first wave authored after 1.0.** Everything below is additive by
> construction — see §3 NFR-25, which is the constraint the whole wave is designed under.

## 1. Objective & Business Context

The table pipeline (F42) derives a view from **rows the caller already has**. That is the
right core, and it is where every real application stops being able to use it directly.

Four gaps, each of which currently pushes the work back onto the consumer:

- **The rows usually live on a server.** A table over ten thousand records does not ship
  them to the browser; it asks for a page at a time, with the filters and the sort applied
  server-side. Today `tablePipeline` has no vocabulary for that: a consumer wires their own
  fetch, their own race handling, their own loading flag, and their own translation of
  pipeline state into a query — and the hard part is not the fetch, it is that a user typing
  in a filter box produces overlapping requests whose responses arrive out of order. The
  naive implementation shows the wrong page and never says so.
- **The state is not addressable.** Filters, search, sort and page are exactly the state a
  user expects to survive a reload and to travel in a pasted link. Every consumer
  reimplements the same query-string round-trip, and most get the restore path subtly wrong
  (restoring one command at a time fires one `'change'` each, so the table re-derives four
  times and lands on page 1 because a filter change resets it).
- **Selection is table stakes and absent.** "Tick these rows, then act on them" is the most
  common thing a data table does. `bsTable` renders rows; nothing owns which are selected,
  what select-all-on-page means when a filter is active, or what happens to a selection when
  the underlying rows change.
- **Four ergonomics items have been backlog since spec 04.** Spec 04 §1 catalogues them
  verbatim — *"CSV/Excel export, sticky headers, column resize and reorder"* — and they are
  the difference between a table a developer demos and one an operator uses all day.

The first two are the ones [ADR-0046](../adr/0046-one-proposal-triaged-and-the-no-bundler-wave-adopted.md)'s
triage found absent and highest-value; the last two groups are the spec 04 backlog, quoted
rather than reinvented.

**The unifying constraint is 1.0.** This wave cannot change a single existing export,
option name, error code or exports-map path — those are MAJOR-protected as of v1.0.0. Every
requirement below is therefore a **new export, a new option on an existing bag, or a new
error code**, and where a capability could plausibly be delivered by changing `tablePipeline`
it is instead delivered beside it. That is a real design constraint, not a formality, and
§4 is shaped by it.

**Scope boundaries (deliberate non-goals of this wave):** a data-fetching library — this
wave defines a *contract* and composes whatever transport the caller injects, importing
`httpClient`/`createResource`/`urlSearchParams` nowhere (the F38/ADR-0025 injection rule);
virtual scrolling and windowing (still a spec 03 non-goal, and unaffected by anything here);
PDF/canvas export and print layout (still a spec 03 non-goal); Excel/XLSX generation, which
would need a runtime dependency and is served by the F96 extension point instead; grouping,
tree tables and pivoting; inline cell editing; and server-side HTML generation. Column
**drag-and-drop reordering** was a spec 03 non-goal and is **superseded here** by F99, on the
terms that requirement states.

## 2. Functional Requirements

### Asynchronous data — `egl-utils-js/table` (pure, zero DOM, SSR-safe)

- F88 **Source contract.** A remote source is an object `{load(query, signal)}` returning
  (or resolving to) `{rows, total}`, where `query` is the serialized pipeline state of F90
  and `signal` is an `AbortSignal` the pipeline owns. The contract is **injection-only**:
  this wave imports no transport, so any `httpClient`, `createResource`, `fetch` wrapper or
  hand-written function satisfies it. A source that returns a non-object, or an object whose
  `rows` is not an array or whose `total` is not a non-negative integer, is a `TypeError`
  naming which field was wrong — a server that answers the wrong shape must fail loudly at
  the boundary rather than produce an empty table.
- F89 **Latest-request-wins, and the losing request is aborted.** Every command that changes
  the query issues a load; a load still in flight when a newer one starts is **aborted via
  its signal** and its result is discarded even if it arrives first. The pipeline never
  applies an out-of-order response, and never leaves the view describing one query while its
  rows came from another. Consecutive identical queries do not re-issue (the query is
  compared by value), and an aborted load is not an error: it produces no `error` state and
  no `'change'` of its own.
- F90 **Query serialization.** The pipeline's derived state is available as a plain,
  JSON-safe object — filters, search, sort entries, page and page size — which is what F88's
  `load` receives and what F91 writes to a URL. It is **transport-neutral**: it is not a
  query string, not a `URLSearchParams`, and encodes no server's parameter naming. Two
  pipelines in the same state serialize equal, so it is usable as a cache key and as F89's
  comparison value.
- F91 **Async state in the derived view.** The read model gains a status the caller can
  render without tracking it themselves: whether a load is in flight, and the failure of the
  last one if it failed, cleared when a subsequent load succeeds. A failed load **leaves the
  previous rows in place** rather than blanking the table — an error banner over stale data
  is recoverable; an empty table that does not say why is not. The status is part of the
  same memoized read model as F42's `view()`, so one read gives a renderer everything it
  needs for one frame.

### Addressable state — `egl-utils-js/table` and `egl-utils-js/dom`

- F92 **State ↔ query string.** Pure, SSR-safe functions convert F90's state object to and
  from a query string, round-tripping exactly: parse(serialize(s)) equals `s` for every
  state the pipeline can hold. Unknown parameters in the input are **preserved, not
  dropped**, so a page whose URL also carries unrelated parameters can round-trip through
  this without losing them. Malformed input degrades to the default state rather than
  throwing: a hand-edited URL is untrusted input, and a table that refuses to render because
  a stranger typed `page=abc` is worse than one that shows page 1.
- F93 **History integration.** A `/dom` binding restores pipeline state from the current URL
  on start, writes it back on change, and restores again on `popstate`, so Back and Forward
  move through table states. Restoring applies as **one transaction** (F42's `batch`), so a
  four-part restore fires exactly one `'change'` and cannot be defeated by the page-reset
  rule. Whether a change pushes or replaces a history entry is the caller's choice, with a
  documented default; teardown is structural, per NFR-15. This requirement needs an
  api-floor amendment (NFR-28).

### Selection — `egl-utils-js/table` and `egl-utils-js/bootstrap`

- F94 **Selection model.** A selection is owned beside the pipeline, keyed by a caller-supplied
  **row key** (the `rowKey` vocabulary `bsTable` already has, spec 04 F72), never by row
  identity or index — an object reference does not survive a server round-trip and an index
  does not survive a sort. Modes are single and multiple. The surface answers `getSelection()`,
  reports changes through the F6 observer shape used everywhere in this library, and
  supports select-all-on-page. **What select-all means when a filter is active is specified,
  not left to the reader**: it selects the *current page of the derived view*, and the count
  of what is selected outside the current filter remains reportable, because "select all,
  then filter, then act" silently acting on invisible rows is a data-loss bug in every
  application that has ever shipped it. Rows disappearing from the source do not silently
  drop from the selection; the contract states which of "keep" or "prune" applies and why.
- F95 **`bsTable` selection wiring.** An opt-in checkbox column rendered by the F71 table
  manager over F94, including the header select-all control with an **indeterminate** state
  when the page is partially selected, keyboard operability, and an accessible name per
  checkbox that is not "checkbox". Selection is reflected on the row element in a way CSS can
  target without the caller re-rendering. Off by default: a table nobody selects in pays
  nothing (the NFR-02 rule).

### Export — `egl-utils-js/table` and `egl-utils-js/dom`

- F96 **CSV from the derived view.** Pure, zero-dependency serialization of the *current
  derived rows* (or the current selection) to RFC 4180 CSV: quoting only where required,
  doubled quotes inside quoted fields, `CRLF` line endings, and a configurable delimiter.
  Column headers come from the column definitions already in hand. **The formula-injection
  case is handled explicitly**: a field whose text begins `=`, `+`, `-`, `@`, tab or carriage
  return is neutralized by default, because a CSV opened in a spreadsheet is a code-execution
  surface and a library that hands one to a user without saying so has shipped the
  vulnerability for them. The default is documented and defeatable for callers who know
  their consumer is not a spreadsheet. **Excel/XLSX stays out of core** — it needs a runtime
  dependency, and the zero-dependency rule (NFR-06) is not negotiable for it; the caller
  callback is the extension point.
- F97 **Copy to clipboard.** A `/dom` helper writing an export (F96's CSV, or
  tab-separated for spreadsheet paste) to the clipboard, with the failure typed rather than
  swallowed: clipboard access is permission-gated and non-secure contexts refuse it, so
  "nothing happened" must be distinguishable from "it worked". Needs an api-floor amendment
  (NFR-28).

### Column ergonomics — `egl-utils-js/bootstrap`

- F98 **Sticky header.** The table header stays visible while the body scrolls, within a
  scroll container the caller owns, without measuring layout in JavaScript per frame.
  Opt-in, compatible with the F71 responsive wrapper, and it must not break the `aria-sort`
  and sort-control behaviour the header already carries.
- F99 **Column resize.** Pointer-driven column width adjustment with a keyboard-operable
  alternative — a resize affordance reachable only by dragging is inaccessible, and this
  library's own NFR-21 rule has refused that trade since spec 04. Widths are readable and
  restorable by the caller (so they can persist them), minimum widths are enforced, and the
  operation does not re-render rows.
- F100 **Column reorder.** Caller-visible column order with a user-facing mechanism to
  change it, and the same keyboard-operable requirement as F99. **This supersedes spec 03
  §1's "drag-and-drop column reordering" non-goal**, on one condition stated here rather than
  discovered later: drag is permitted as *an* affordance, never the only one, and the
  authoritative interface is the programmatic order — so a caller can implement their own
  affordance and persist order without touching the DOM.

## 3. Non-Functional Requirements

- NFR-25 **Additive-only (hard).** This wave changes **no** existing export signature,
  option name, error code, or `exports`-map path. Concretely: the 113 exports frozen at
  v1.0.0 keep their names and their meanings; new options are added to existing bags only
  where the bag already rejects unknown keys (ADR-0047), which makes the addition observable
  and the omission safe; new error codes are additions to the `EGL_*` registry, which
  ADR-0003 already classifies as minor. **Mechanically proved**: the public-surface
  inventory before and after the wave differs only by additions (§6).
- NFR-26 **Async correctness (hard).** No interleaving of commands and responses produces a
  view whose `rows` came from a query other than the one the same view describes. Proved by
  property test over randomized command/response interleavings including out-of-order
  arrival, abort-then-arrive, and identical-query coalescing — not by example tests, because
  the failure mode is a race and examples find only the races someone imagined.
- NFR-27 **Derivation and selection performance (hard).** F42's NFR-13 budget is unchanged
  and re-verified. New: selecting all on a 10,000-row source, and reading `getSelection()`
  with 10,000 keys selected, are each **≤ 10 ms** on the benchmark machine, and selection
  state costs **O(selected)** memory, never O(source) — a `Set` of keys, not a flag per row,
  so an unselected 100k-row table pays nothing.
- NFR-28 **Platform-API floor amendments are explicit (hard).** Unlike M18 (spec 05 NFR-24,
  which added none), this wave **does** need new platform APIs: `history.pushState` and
  `popstate` (F93), the async Clipboard API (F97), and whatever F98–F100 require. Each is an
  explicit entry in `tools/api-floor-inventory.js` with its guard and its reason, decided
  under [ADR-0017](../adr/0017-platform-api-floor-gate.md)'s deny-by-default rule. **The
  browserslist floor does not move**: an API newer than Safari 16.4 is either guarded with a
  documented fallback or the feature that needs it is not shipped. A feature is never
  delivered by quietly raising the floor, because raising it is breaking (ADR-0050).
- NFR-29 **The Node-safety split holds (hard).** `egl-utils-js/table` gains async, query
  serialization, selection and CSV **without gaining a DOM reference**: importing it in Node
  and exercising every new function must work with no `document`, no `window` and no
  `fetch`. Everything that touches the DOM, history or the clipboard lands on `/dom` or
  `/bootstrap`. This is spec 03 NFR-14's rule, restated because this wave is the first one
  where the temptation to break it is real — the URL and the clipboard both look like data.
- NFR-30 **Budgets (hard).** Every new entry point and function gets a size-limit row on the
  existing gate, in the same min+brotli metric, pinned at measured + ≤ 7% (the ADR-0015
  practice). The no-bundler transfer routes (spec 05 F87, `tools/transfer-budgets.js`) are
  re-pinned in the same PR that moves them — this wave grows routes M18 measured, and a
  budget that is not updated is a gate that starts lying.
  - **Corrected (roadmap 19.1).** This clause first said the `/table` and `/bootstrap`
    **entry ceilings** would be "re-derived once at the end of the wave rather than amended
    per item". That is not implementable: the size gate runs on **every** PR, so an entry row
    left at its pre-wave number simply fails the build of the first item that grows it, and
    "we will fix the number later" is not a state CI has. What the clause was reaching for
    is real and is kept: the **spec-03 NFR-12 prose clause** gets its final figure once, at
    wave end, rather than being amended seven times. The **rows** move per PR, each pinned at
    measured + ≤ 7% and each naming what grew them.

## 4. Logical Architecture & Core Algorithm

The wave's shape is dictated by NFR-25: **nothing is inserted into `tablePipeline`'s
derivation.** The existing pipeline keeps deriving a view from rows it holds; the new
capabilities attach *around* it.

```text
                    ┌──────────────────────────────────────────┐
   F92/F93          │            tablePipeline (F42)           │
  URL <──────────►  │  source → filters → search → sort → page │
   state            │  commands · view() · on('change')        │
                    └───────┬──────────────────────────┬───────┘
                            │ F90 query                │ view()
                            ▼                          ▼
                    ┌───────────────┐          ┌───────────────┐
   F88 source ────► │ async adapter │          │  selection    │ F94
   {load(q,signal)} │ F89 race rules│          │  keyed by     │
                    │ F91 status    │          │  rowKey       │
                    └───────┬───────┘          └───────┬───────┘
                            │ rows, total              │
                            └──────────┬───────────────┘
                                       ▼
                        ┌──────────────────────────────┐
                        │  bsTable (F71) + F95 checkbox│
                        │  F98 sticky · F99 resize     │
                        │  F100 reorder                │
                        └──────────────────────────────┘
                                       │
                                       ▼
                              F96 CSV · F97 clipboard
```

**Where async goes is the wave's first real decision, and this spec deliberately does not
make it.** Two shapes are defensible — an adapter that owns a pipeline and drives it, or a
new option on `tablePipeline` that swaps the derivation for a server round-trip — and they
differ in what "the pipeline's state" means when the server did the filtering. The choice
belongs in an ADR authored with the implementation of 19.1, the way spec 05 F82 was written
mechanism-neutral and deferred to [ADR-0055](../adr/0055-the-sanitizer-s-peer-is-looked-up.md).
What this spec fixes is the **observable contract** — F88's shape, F89's race rules, F90's
serialization, F91's status — which is what consumers depend on and what SemVer protects,
and which holds under either shape.

**The race rule is the core algorithm** and is worth stating as one: every state change
computes the F90 query; if it equals the in-flight query, nothing happens; otherwise the
in-flight load is aborted, a new load starts with a fresh signal, and **only the load whose
signal is still the current one may apply its result**. That last clause — comparing
identity at apply time rather than trusting the abort to have prevented arrival — is what
makes it correct: `AbortSignal` stops a `fetch`, but it cannot un-resolve a promise that
already settled in a microtask.

**Selection is a `Set` of row keys, not a property of rows.** Rows arrive from a server,
get replaced wholesale, and are never mutated by this library (F42). A selection stored on
rows would be destroyed by every reload; a selection stored as keys survives, which is also
what makes NFR-27's O(selected) memory claim true.

## 5. Public Interface

New, SemVer-protected once shipped. Names below are **indicative** where an ADR still owns
the shape (§4); what is contractual in this section is the *set of capabilities* and their
error model, not the identifiers, which the implementing PRs fix and freeze.

- On **`egl-utils-js/table`** (pure, Node-safe): the async source adapter (F88–F91), the
  state ↔ query-string pair (F92), the selection model (F94), and CSV serialization (F96).
- On **`egl-utils-js/dom`**: the history binding (F93) and the clipboard helper (F97).
- On **`egl-utils-js/bootstrap`**: the checkbox column (F95), sticky header (F98), column
  resize (F99) and reorder (F100) — all opt-in on the F71 table manager.
- **Error model**, continuing ADR-0003: argument and shape violations are `TypeError`s
  naming the option or field, as everywhere in this library; new *typed* failures get new
  `EGL_*` codes (additions are minor). A source rejecting is **not** an `EglError` — it is
  the caller's transport failing, surfaced through F91's status with the original error
  preserved as `cause`, because wrapping a consumer's `HttpError` in a new class of ours
  would hide the status code they need.
- **Unknown option keys are rejected** on every new bag, per ADR-0047/ADR-0056 — including
  the descriptor shapes (source objects, selection options, export options).

## 6. Verification & Test Strategy

- **F88–F91 (async)** — unit tests per rule; **property test** for NFR-26 over randomized
  interleavings (out-of-order arrival, abort-then-arrive, duplicate query coalescing, a
  source that resolves after `destroy()`), with an injected fake source so no network is
  involved and the schedule is deterministic. A test asserts the losing request's signal is
  actually aborted, not merely ignored — "we discarded the response" and "we stopped the
  work" are different promises and only the second saves the server.
- **F92 (URL round-trip)** — property test: `parse(serialize(s)) === s` over generated
  states, plus explicit cases for unknown-parameter preservation and for malformed input
  degrading to defaults rather than throwing.
- **F93 (history)** — jsdom tests over `pushState`/`popstate`, asserting the restore fires
  exactly **one** `'change'` (the batch rule) and that teardown detaches the `popstate`
  listener (NFR-15).
- **F94–F95 (selection)** — unit tests for each mode and for select-all-under-filter,
  including the case the requirement calls out: select-all, then narrow the filter, then
  read the selection. Browser tests (three engines) for the checkbox column's indeterminate
  state, keyboard operability and accessible naming.
- **F96 (CSV)** — property test that every generated field round-trips through a compliant
  parser; explicit cases for each formula-injection prefix, asserting neutralization by
  default **and** that the escape hatch actually disables it.
- **F97–F100 (DOM/browser)** — Playwright on three engines, since clipboard permissions,
  sticky positioning, pointer capture and drag are exactly the behaviours jsdom does not
  have. Clipboard failure paths are asserted with permission denied.
- **NFR-25 (additive-only)** — the public-surface inventory is enumerated before and after
  the wave (the 17.1 review's method, and `tools/assert-global-artifact.mjs` already
  enumerates it per entry); the diff must contain additions only. This is the gate that
  makes "additive" mechanical rather than asserted.
- **NFR-27 (performance)** — `src/bench/` suites under the existing NFR-04 regression gate,
  with the O(selected) memory claim asserted by construction (a selection of 1 key over a
  100k-row source holds 1 key).
- **NFR-28 (api-floor)** — `pnpm check:api-floor` passes with the amended inventory; each
  addition names its guard, and the browserslist floor is asserted unchanged in the diff.
- **NFR-29 (Node-safety)** — the existing node-safety suite is extended: import
  `egl-utils-js/table` in the default Node environment and exercise every new function with
  no `document`, `window` or `fetch` in scope.
- **NFR-30 (budgets)** — new size-limit rows; entry ceilings re-derived once at wave end;
  `tools/check-transfer-budgets.mjs` re-pinned in the same PR.
