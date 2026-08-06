# Software Specification: DOM Toolkit, UI Components & the Table Pipeline (JavaScript (ES2023))

> Third-wave contract for `egl-utils-js` (milestones M11–M13). Frozen once accepted:
> diverging implementation updates this spec in the same PR or adds an ADR superseding the
> relevant section. Functional numbering continues the global sequence
> ([`01_spec_utils.md`](01_spec_utils.md) owns F1–F25,
> [`02_spec_core_extensions.md`](02_spec_core_extensions.md) owns F26–F41): this document
> owns **F42–F51**.

## 1. Objective & Business Context

The first two waves are deliberately DOM-free. Applications, however, spend most of their
utility budget exactly where this library has so far said nothing: binding elements at
startup and discovering too late that one id was a typo; re-attaching listeners to every
row after every re-render; injecting HTML fragments and hoping they were safe; showing a
loading overlay that flickers for 30 ms or, worse, never hides because two async operations
raced; and building the same filter-sort-paginate table for the fourth time, discovering
each time that sorting silently discards the active filter.

This wave supplies those pieces — but under a constraint the first two waves earned the
right to impose: **the logic stays testable without a browser.** The table pipeline is a
pure state machine over the query primitives spec 02 froze (F33–F35), on a Node-safe entry,
so filtering and sorting can run server-side and be property-tested without a DOM. Only the
part that genuinely touches `document` lives on the browser-leaning `/dom` entry, and it
fails fast — with a typed error naming the contract — rather than throwing
`ReferenceError` in a server render.

The second constraint is that **components ship mechanism, never a design system.** No
Bootstrap class, no icon-font ligature, no framework assumption appears in a default. Class
maps, icon renderers, and presentation hooks are injected; the defaults are neutral.

**Scope boundaries (deliberate non-goals of this wave):** any framework-specific styling or
markup (the Bootstrap 5 toolkit is spec 04, built *on top of* this wave, never inside it);
virtual scrolling and windowing; drag-and-drop column reordering; PDF/canvas export and
print layout; a component lifecycle framework or reactive-state library — these components
are plain factories, not a rendering runtime; and server-side HTML *generation* (the
pipeline derives data; the caller renders).

## 2. Functional Requirements

Table pipeline — `egl-utils-js/table` (stateful by contract; pure core, zero DOM,
SSR-safe; joins the F33–F35 primitives already on this entry):

- F42 tablePipeline(options) — a controller owning one row set and deriving one view. Options: `{source, columns?, pageSize?, locale?}`; `columns` entries are `{key, type?, compare?, getValue?, searchable?, filterable?}`. **Commands** (each validates its arguments, updates state, and emits exactly one `'change'`): `setSource(rows)`, `setFilter(key, expressionOrPredicate|null)`, `setSearch(text)`, `toggleSort(key)` (asc → desc → none), `setSort(entries)`, `setPage(n)`, `setPageSize(n)`, `batch(fn)` (coalesces several commands into one `'change'`). **Read model**: `view()` → `{rows, total, totalFiltered, page, pageCount, sort, filters, search}`, memoized on a state version so repeated reads are free. **Observer surface**: `on`/`once`/`off` delegating to an internal `EventEmitter` (F6), `on` returning an unsubscribe function; `emit` is *not* public. Derivation order is fixed: source → per-column filters (AND) → global search (OR over searchable columns) → sort (stable, multi-key) → paginate. Filtering and sorting **compose** — applying one never discards the other, and any command that changes the result set resets `page` to 1 within the same transaction. `source` is never mutated; sorts operate on copies. TypeError for an unknown column key, a non-array source, or a malformed sort entry

DOM helpers — `egl-utils-js/dom` (browser-leaning: every export throws `DomContractError`
when no DOM is present, per NFR-14):

- F43 bindElements(map, {root=document, strict=false}) — resolves a `{name: selector}` map to `{elements: {name: Element|null}, missing: string[]}` in one pass; `missing` lists the names whose selector matched nothing, so a startup DOM contract is checkable rather than discovered on first click. With `strict: true` a non-empty `missing` throws `DomContractError` naming every missing selector. New error class **`DomContractError`** (code `EGL_DOM_CONTRACT`) joins the F-taxonomy on `egl-utils-js/errors`
- F44 delegate(root, type, selector, handler, {signal?, capture?}) — attaches **one** listener on `root` and invokes `handler(event, matchedElement)` for events whose target is, or is contained by, an element matching `selector` (resolved with `Element.closest`, bounded by `root`). Returns an idempotent unsubscribe function; an `AbortSignal` detaches it too. One listener survives any number of re-renders, so per-row rebinding is unnecessary by construction
- F45 setEnabled(el, enabled) / setVisible(el, visible, {hiddenClass?}) / setValue(el, value) — native property setters covering `input`, `select`, `textarea`, checkbox and radio. `setVisible` drives the `hidden` attribute by default and toggles `hiddenClass` instead when one is supplied; `setValue` selects the matching option for a `select` and sets `checked` for a checkbox/radio. Each is a no-op on `null` (a missing optional element must not require a guard at every call site) and throws TypeError for a non-Element, non-null first argument
- F46 autoGrow(textarea, {maxRows?, measure?, signal?}) — keeps a textarea's height equal to its content as the user types; returns a detach function, and honours an `AbortSignal`. The height measurement is reachable through an injected `measure` seam so the behaviour is testable where layout does not exist (jsdom reports zero heights)
- F47 injectFragment(target, url, {sanitize, position='replace', fetch?, signal?, headers?}) — fetches an HTML fragment and inserts it into `target`. **`sanitize` is required**: pass a sanitizer (for example `sanitizeHtml` from `egl-utils-js/sanitize`) or the literal `false` to declare the source trusted; omitting it throws TypeError rather than silently trusting remote markup. `position`: `'replace' | 'beforeend' | 'afterbegin'` — non-replace positions use `insertAdjacentHTML`, so existing nodes and their listeners survive. A non-2xx response rejects with `HttpError{status, body}` (F16's class, reused) and every error **propagates** — no dialog, no swallowed failure, so a caller can tell a half-rendered shell from a complete one
- F48 withUrlParams(url, params) — merges `params` into a URL's query string, replacing existing keys and skipping nullish values, preserving any fragment, and working on relative URLs. Pure and SSR-safe. Composed from `URLSearchParams` so a URL that already has a query string cannot acquire a second `?`

UI components — `egl-utils-js/dom` (stateful; instance-based, framework-agnostic):

- F49 inlineAlert(container, {classes?, icons?, autoHideMs?, dismissible?}) — a factory returning `{show(kind, message, options?), hide(), destroy()}` where `kind ∈ {'success','info','warning','danger'}`. Message text is rendered with `textContent`; rich content requires the `{html: true, sanitize}` pair, mirroring F47's contract. `classes` and `icons` are injected maps — defaults are neutral, framework-free class names, and **no icon set is assumed**. Each instance owns its auto-hide timer and its close-button binding, so two alerts on one page can never cancel each other's timer or steal each other's container; `destroy()` removes listeners and clears any pending timer
- F50 loadingOverlay({onShow, onHide, minVisibleMs=400, focus?}) — a reference-counted visibility gate over an injected presentation pair. `show()` increments the count and returns an **idempotent** release function; the overlay hides when the count reaches zero, so nested or concurrent async operations cannot tear it down early. `wrap(promiseOrFn)` shows around an operation and always releases. The minimum-visible clock starts when `onShow` *settles*, not when `show()` is called, so a fast response cannot produce a flash, and a `hide` arriving mid-appearance is honoured once the appearance completes. With `focus.save` the active element is captured before showing, any focus inside the overlay is cleared before hiding, and focus is restored afterwards if the element is still in the document. `isShown()` reports current state
- F51 bindTableControls(pipeline, bindings, {signal?, debounceMs=200, root=document}) — wires DOM controls to an F42 pipeline through its public commands only, and reflects state back on every `'change'`. `bindings`: `{filters?: {key: selector}, search?: selector, sortHeaders?: {root, selector}, pagination?: {prev?, next?, status?}, pageSize?: selector}`. Filter and search inputs are debounced (F7); sort headers use **one** delegated listener (F44) and receive `aria-sort`; pagination controls are enabled/disabled from the derived view. Returns an unbind function; teardown is structural — one internal `AbortController` detaches every listener, cancels every pending debounce, and unsubscribes from the pipeline, so no trailing callback can fire into a dead binding. **Row rendering stays the caller's**: the binding wires controls, never cells

## 3. Non-Functional Requirements

<!-- Hard budgets are numbers with units and directions; each maps to a mechanical CI
     check (§6). -->

- NFR-12 Bundle budgets (min+gzip, size-limit gate in CI): **`/dom` ≤ 4 kB** and the
  `/table` entry **≤ 3 kB** with F42 included (its query-primitive-only budget, 1.8 kB
  measured at 1722 B, stays a permanent scenario row so pipeline consumers pay for the
  pipeline and primitive consumers do not). Each entry's whole-entry budget is set to its
  measured size plus ≈7% headroom when it lands, with the measured figure recorded in the
  row name; the pre-implementation numbers above are ceilings on that measurement, not
  predictions to be met exactly. Every **plain function** added by this wave keeps its own
  1 kB single-import scenario row. **Instance-returning components (F49, F50) and the two
  composing facades (F42, F51) are exempt from the 1 kB per-function clause by this spec**
  — they compose subsystems by design, so the clause would measure the wrong thing; each
  instead takes a **named, measured row** in the ADR-0015 style (indicative ceilings, to be
  pinned on landing: `tablePipeline` ≤ 2.75 kB, `bindTableControls` ≤ 1.75 kB,
  `inlineAlert` ≤ 1.25 kB, `loadingOverlay` ≤ 1.25 kB). The **root entry is not touched by
  this wave**: its frozen 6 kB ceiling (spec 01 NFR-01, measured 5806 B) is neither spent
  nor renegotiated.
- NFR-13 Derivation performance: `tablePipeline.view()` over **10,000 rows with 3 active
  filters and a 2-key sort completes in ≤ 50 ms** on the CI runner, and a repeated `view()`
  with no intervening command is **O(1)** (memoized — asserted by identity, not timing).
  Measured by a `vitest bench` case with a pinned fixture; this is an **absolute budget,
  not a parity claim** (see NFR-04 non-extension below).
- NFR-14 Node-safety split, both directions: importing `egl-utils-js/table` and calling
  every export — F42 included — **succeeds on Node ≥ 18 with no DOM present**; and on
  `egl-utils-js/dom`, an export that must resolve the **ambient** document (one whose
  root or target defaults to `document`) throws **`DomContractError`** when there is none —
  never `ReferenceError`, never a silent no-op. **Amended in 11.2** (the original clause
  said *every* `/dom` export): an export handed an explicit element or root operates on
  that node and needs no global document, which is what makes `bindElements(map, {root})`
  and `delegate(root, …)` usable inside a server-side DOM implementation. Requiring an
  ambient document a function does not use would be a check for its own sake. Importing the
  entry is always safe; failure happens on use. Both directions are proved on the CI matrix,
  so an SSR consumer gets a diagnosable failure and the pipeline stays server-usable.
- NFR-15 Teardown completeness: for every export that attaches a listener, starts a timer,
  or subscribes (F44, F46, F49, F50, F51), the returned unbind/destroy function and an
  aborted `AbortSignal` each leave **zero live listeners, zero pending timers and zero
  subscriptions** — asserted by counting listener attachments through an instrumented root
  and by driving fake timers past every scheduled callback. No trailing debounce may fire
  after teardown.
- NFR-16 Platform-API floor is **enforced for DOM APIs, not merely declared**: the
  deny-by-default scanner's policed-globals list is extended to cover the DOM surface this
  wave introduces (at minimum `Element`, `HTMLElement`, `Event`, `CustomEvent`,
  `getComputedStyle`), so a member used but not inventoried fails CI exactly as a
  `document.*` member already does (ADR-0017's promise, currently unenforced for those
  globals). Every inventoried entry carries its MDN browser-compat-data path, and anything
  whose floor is newer than Safari 15.4 / Node 18 is `guarded` with a stated reason.
- NFR-04 non-extension (explicit, continuing spec 02): this wave makes **no
  performance-parity claims** against any third-party library — no pinned baselines are
  added and the nightly parity gate's scope does not grow. NFR-13 is an absolute budget on
  our own fixture, which is a different instrument (ADR-0013's refuse-to-compare clause: no
  fair baseline exists for a pipeline whose semantics we define).
- NFR-01/02/03/05/06/07 (spec 01) and NFR-08 (spec 02) apply unchanged: coverage ≥ 95%
  lines and branches, tree-shakability proved per import, zero runtime dependencies (the
  sanitizer reaches F47 and F49 as a **parameter**, so `/dom` never depends on the
  DOMPurify optional peer), Node ≥ 18 plus evergreen browsers with a Safari ≥ 15.4 floor.

## 4. Logical Architecture & Core Algorithm

Two entries carry this wave. `/table` gains the pipeline beside the primitives it composes;
`/dom` is new, browser-leaning, and split into three source files behind one entry — the
`index.js` barrel precedent, chosen so a consumer of a component still gets the helpers
without a second entry's four-file wiring cost:

```text
egl-utils-js/table      += tablePipeline                    [stateful, pure, SSR-safe]
                           └── composes compileFilter (F33), comparator (F34),
                               paginate (F35), EventEmitter (F6, by composition)
egl-utils-js/dom  (NEW)    dom.js            barrel         [browser-leaning, fail-fast]
                           dom-helpers.js    F43-F48
                           dom-components.js F49, F50
                           dom-table.js      F51
egl-utils-js/errors     += DomContractError (EGL_DOM_CONTRACT)
```

The load-bearing decision is the **purity boundary at the entry boundary**: state and
derivation live in `/table` and never touch `document`; every listener, attribute write and
measurement lives in `/dom`. F51 is the only bridge, and it speaks to the pipeline solely
through public commands and the `'change'` event — the pipeline does not know a binding
exists, which is why the same instance can pre-derive page 1 during a server render and
then be adopted by the browser.

Derivation is one pass with a fixed order and a version counter:

```text
state = { source, filters{}, search, sort[], page, pageSize, version }

command:  validate -> mutate state -> version++ -> emit 'change' (exactly once)
view():   if cache.version == state.version -> return cache.value
          rows := source
          rows := rows.filter(row => every active filter predicate accepts its column)
          rows := search ? rows.filter(row => any searchable column contains search) : rows
          totalFiltered := rows.length
          rows := stableSort(rows, sort.map(comparator))       // multi-key, stable
          page  := clamp(page, 1, pageCount(totalFiltered, pageSize))
          cache := { version, value: { paginate(rows), counts, sort, filters, search } }
```

Invariants: filters and sort are independent inputs to one derivation, so neither can
discard the other (the defect this design exists to prevent); a compound command is one
transaction and one event; `source` is treated as immutable.

## 5. Public Interface

Consumers import via the exports map, e.g.
`import { tablePipeline } from 'egl-utils-js/table';` and
`import { bindTableControls, inlineAlert } from 'egl-utils-js/dom';`. The wave's surface:

- `egl-utils-js/table` += `tablePipeline` (F42)
- `egl-utils-js/dom` (new): `bindElements`, `delegate`, `setEnabled`, `setVisible`,
  `setValue`, `autoGrow`, `injectFragment`, `withUrlParams`, `inlineAlert`,
  `loadingOverlay`, `bindTableControls` (F43–F51)
- `egl-utils-js/errors` += `DomContractError` with stable code `EGL_DOM_CONTRACT` (F43)

Error model, unchanged in kind from the earlier waves: **wrong types throw `TypeError`**
(programmer errors — an unknown column key, a non-Element target, a missing `sanitize`);
**expected-malformed user input never throws** (filter expressions stay total per NFR-09);
**environment and contract failures carry stable `EGL_*` codes** — `DomContractError` for a
missing DOM or missing required element, `HttpError` for a failed fragment fetch. Named
exports only, no default export (ADR-001). SemVer surface: every export above, the
`'change'` event's payload shape, the `view()` record shape, and the exports map are
MAJOR-protected once released; pre-1.0 each completed milestone ships as a MINOR.

## 6. Verification & Test Strategy

Vitest on the Node 18/20/22 matrix; coverage ≥ 95% lines and branches including every error
path. The suites are split to match the purity boundary, which is the point of the design:

- **`/table` (F42) is tested with no DOM at all** — plain Node. Property suites (fast-check)
  prove the invariants that make the pipeline worth having: filter and sort **compose** in
  either application order; a compound command emits **exactly one** `'change'`; `view()` is
  referentially identical when no command intervened; `page` is always within
  `[1, pageCount]`; the derived row set is always a subsequence of a sorted permutation of
  `source`, and `source` is never mutated.
- **`/dom` unit tests run in jsdom** (per-file `// @vitest-environment jsdom`), covering
  binding, delegation dispatch through `Element.closest`, the setters across every input
  type, injection wiring, alert lifecycle, and overlay ref-counting with fake timers.
  Layout- and focus-dependent behaviour is reached through injected seams (F46's `measure`,
  F50's `onShow`/`onHide`) precisely because jsdom has no layout — the seams exist for
  testability first and framework-agnosticism second.
- **Playwright covers what only a real engine can settle** (Chromium/Firefox/WebKit, the
  M6.4 job extended): that `autoGrow` actually grows against real layout, that F50's
  focus save/blur/restore leaves no `aria-hidden` focus warning, that delegation survives a
  full re-render, that `injectFragment` inserts sanitized markup which does **not** execute,
  and one end-to-end table scenario — populate → type a filter command → sort a header →
  page — asserting `aria-sort` and the rendered rows.
- **NFR-14 is a matrix test, both directions**: a Node cell imports `/table` and exercises
  every export with no DOM, and imports `/dom` and asserts each export throws
  `DomContractError` (by `.code`, never `instanceof` — ADR-0003).
- **NFR-15 is asserted mechanically**, not by inspection: listener attachments are counted
  through an instrumented root, and teardown must return the count to zero with fake timers
  driven past every scheduled callback.
- **NFR-13** is a `vitest bench` case on a pinned 10,000-row fixture, recorded in
  `docs/benchmarks/`; the memoization half is asserted by identity rather than by timing, so
  it cannot flake.
- Packaging gates per PR: size-limit budgets (NFR-12), agadoo shakeability, publint +
  arethetypeswrong, zero-runtime-dependency check, typedoc warning-free. **`pnpm
  check:api-floor` must fail on an un-inventoried DOM global** — the scanner extension is
  itself part of the M11 deliverable and is verified by planting a member and observing the
  failure (NFR-16). `python tools/consistency_lint.py` guards cross-artifact congruence on
  every PR, and the threat model is updated in the same PR as F47 and F49 (untrusted HTML)
  and F51 (user-typed filter expressions reaching the DOM layer).
