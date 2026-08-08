# Software Specification: Bootstrap 5 Toolkit (JavaScript (ES2023))

> Fourth-wave contract for `egl-utils-js` (milestones M14–M16). Frozen once accepted:
> diverging implementation updates this spec in the same PR or adds an ADR superseding the
> relevant section. Functional numbering continues the global sequence
> ([`01_spec_utils.md`](01_spec_utils.md) owns F1–F25,
> [`02_spec_core_extensions.md`](02_spec_core_extensions.md) owns F26–F41,
> [`03_spec_dom_ui_table.md`](03_spec_dom_ui_table.md) owns F42–F51): this document owns
> **F52–F81**.

## 1. Objective & Business Context

The first three waves are deliberately design-system-free: mechanisms with injected
policy. Real applications, however, overwhelmingly ship one concrete design system —
Bootstrap 5 — and pay the same integration tax in every project: hand-assembled HTML
strings for badges, cards and tables (unescaped, per-app, subtly different each time);
per-row listener rebinding after every render; a fourth hand-rolled pagination bar; and
behavior wiring (`new bootstrap.Modal(...)`, toggler plumbing, dispose-on-teardown)
copy-pasted until one copy forgets the dispose.

This wave supplies a **complete, modular Bootstrap 5 toolkit** on an opt-in
`egl-utils-js/bootstrap` entry: one standalone, tree-shakeable manager for **every
component in the Bootstrap 5 catalog — all 24 of them** (Accordion, Alerts, Badge,
Breadcrumb, Buttons, Button group, Card, Carousel, Close button, Collapse, Dropdowns,
List group, Modal, Navbar, Navs & tabs, Offcanvas, Pagination, Placeholders, Popovers,
Progress, Scrollspy, Spinners, Toasts, Tooltips) — plus `bsTable`, a full table manager
composing the spec-03 pipeline. Adopting one manager never costs the rest.

The layering rule is the architecture's backbone: **`/bootstrap` composes the agnostic
core; the core never imports it.** Bootstrap *class names* are just strings, so the
builders keep the library's zero-runtime-dependency promise; Bootstrap *behaviors*
(Modal, Toast, Collapse…) are reached through an **optional peer**, resolved lazily and
failing with a typed error when absent — the `/sanitize` optional-peer precedent
(ADR-0012), applied to a second package. Everything a builder renders from caller data is
**escaped by default**: the unescaped-interpolation defect class this toolkit replaces is
designed out, not merely discouraged.

**Scope boundaries (deliberate non-goals of this wave):** shipping any CSS, theme or
icon font (the toolkit emits Bootstrap 5 markup and class names; the application loads
Bootstrap's stylesheet and any icon set itself); Bootstrap versions other than 5.x (a
future major gets its own entry if breaking); bundling or shimming `@popperjs/core`
(Popover/Tooltip name it in their failure, nothing more); a form-validation framework;
jQuery interop of any kind; and the `bsTable` extras already catalogued as backlog —
CSV/Excel export, sticky headers, column resize and reorder — which remain candidates
for a later spec, listed here so their omission is explicit.

## 2. Functional Requirements

Element builders — `egl-utils-js/bootstrap` (no Bootstrap JS involved; DOM-creating, per
NFR-20):

- F52 Builder contract (cross-cutting): every builder returns **real DOM nodes** created
  in the target's own document (never HTML strings); caller data reaches nodes only via
  `textContent`/`setAttribute` (NFR-19); rich content requires the explicit
  `{html: true, sanitize}` pair (F47/F49 precedent — `sanitize` is a function or the
  literal `false`); every builder accepts `{class: string|string[]}` to append custom
  classes after the Bootstrap ones; multi-node population goes through one
  `DocumentFragment` per call; instance-returning managers expose `.element` and
  `destroy()`, and `destroy()` plus an aborted `{signal}` satisfy NFR-15.
  **Amended in 14.1** ([ADR-0037](../adr/0037-builder-contract-nodes-escape-and-the-atom-budget.md))
  on two points this clause left open. Every builder additionally accepts
  `{document}`: "the target's own document" has no meaning for a builder with no target
  (an atom like `bsBadge('New')`), so the document is resolved from the option, then from
  the ambient global, and its absence is the NFR-20 `DomContractError` — without the
  option NFR-20 would be satisfiable only in its diagnostic direction and the builders
  would be unusable in an iframe, a popup, or a server-side DOM. And a **class token that
  cannot be a class is a `TypeError` naming the option**, never the platform's
  `InvalidCharacterError` `DOMException`; a caller's `class` string is split on whitespace
  rather than rejected, while `variant`/`size` values are *not* checked against a fixed
  vocabulary, since a project's custom `$theme-colors` entry is a legitimate variant
- F53 bsIcon(name, {set?, label?}) — icon adapter returning an element from an injected
  **icon set** (`{render}` or class-template pure-data map). Ships two data presets:
  `bootstrapIconsSet` (`<i class="bi bi-<name>">`) as the default and
  `materialIconsSet` (ligature span); `label` sets `aria-label` + `role="img"`, its
  absence sets `aria-hidden="true"` (decorative default)
- F54 bsBadge(text, {variant='secondary', pill?, positioned?}) — `<span class="badge
  text-bg-<variant>">`; `pill` adds `rounded-pill`; `positioned` renders the
  corner-positioned form with its visually-hidden text slot
- F55 bsButton({label?, variant='primary', outline?, size?, type='button', icon?,
  disabled?, onClick?, signal?}) — `<button>` with `btn btn[-outline]-<variant>
  [btn-<size>]`; `icon` (F53 input shape) may precede or replace the label — an icon-only
  button **requires an accessible name** (`label` rendered visually-hidden or
  `ariaLabel`), TypeError otherwise; `onClick` is attached with `{signal}` teardown
- F56 bsButtonGroup(buttons, {size?, vertical?, label}) — `role="group"` wrapper with
  required `aria-label`; accepts F55 results or existing button elements
- F57 bsCloseButton({onClick?, disabled?, label='Close', signal?}) — `<button
  class="btn-close">` with the accessible name configurable, never hardcoded markup
- F58 bsSpinner({kind='border', size?, variant?, label='Loading…'}) — border/grow
  spinner with `role="status"` and a visually-hidden label
- F59 bsProgress({value, min=0, max=100, variant?, striped?, animated?, label?,
  height?, format?}) — progress bar with `role="progressbar"` and the aria-value* triple
  always set (on the track, per Bootstrap 5.3, the bar itself being presentational);
  `label` is the accessible name; returns an instance with `update(value)` beside
  `.element`, `update` moving the width, the `aria-valuenow` and the visible text together
  so the three cannot drift apart. **`format` added in 14.1**
  ([ADR-0037](../adr/0037-builder-contract-nodes-escape-and-the-atom-budget.md)): the
  visible text inside the bar comes from an injected `(value, {min, max}) => string`
  defaulting to `false` — no text, which is Bootstrap's own default — because `'25%'` is a
  human-readable string and NFR-21 requires those to be injected rather than shipped (the
  F51 `formatStatus` precedent). Out-of-range values clamp into `[min, max]`
- F60 bsPlaceholder({lines=1, size?, animation?, widths?}) — placeholder/skeleton block;
  `animation: 'glow'|'wave'`; each line's width drawn from `widths` or a stable default
  cycle. The block is `aria-hidden`: a skeleton depicts content that does not exist yet, so
  announcing it announces nothing, repeatedly — the loading *state* belongs to a live region
  or F58
- F61 bsCard({header?, body?, footer?, title?, subtitle?, text?, image?, listGroup?,
  actions?}) — card composer; every slot accepts a string (escaped), a node, or an array
  of either; `image` renders `card-img-top` with **required `alt`** (empty string allowed
  for decorative); `actions` renders into the footer
- F62 bsListGroup(items, {flush?, numbered?, horizontal?, onSelect?, signal?}) — list
  group where each item is a string (escaped) or `{content, variant?, active?,
  disabled?, href?, badge?}`; with `onSelect` items render as actionable
  (`list-group-item-action`, correct `<a>`/`<button>` element) behind **one** delegated
  listener (F44), never per-item bindings; returns `{element, update(items), destroy}`
- F63 bsBreadcrumb(items, {divider?, label='breadcrumb'}) — `<nav aria-label>` +
  `breadcrumb` list; the last item is the current page (`aria-current="page"`, no link);
  `divider` sets the `--bs-breadcrumb-divider` custom property rather than injecting
  markup
- F64 bsAlert(container, options?) — the F49 `inlineAlert` engine (composed, not
  reimplemented) pre-configured with Bootstrap alert classes, `alert-dismissible` +
  F57 close button and `fade show` transitions; same instance API and per-instance
  timers as F49; `kind` maps to the four F49 kinds plus Bootstrap's full variant range
  via the injected class map. **Clarified in 14.2**
  ([ADR-0038](../adr/0038-composites-compose-and-what-a-frozen-constant-costs.md)): "full
  variant range" is reached by *retargeting a kind* in the class map
  (`{ classes: { info: 'alert-primary' } }`), not by widening F49's frozen four-kind
  vocabulary — a framework-agnostic component must not learn a framework's palette. The
  same PR amends **spec 03 F49** so an empty close icon no longer hides the close control:
  `.btn-close` draws its glyph in CSS, so its correct icon is empty, and hiding the button
  for that left a dismissible alert nobody could dismiss. `dismissible: false` remains how
  a caller asks for no button
- F65 bsPagination(container, {onPage, siblingCount=1, boundaryCount=1, size?,
  labels?, signal?}) — pagination bar instance: `{element, update(view), destroy}` where
  `update({page, pageCount})` re-renders prev/next plus a windowed page list with
  ellipsis markers; the active page carries `aria-current="page"`, disabled steps
  `disabled`; page clicks call `onPage(n)` through one delegated listener; `labels`
  injects every human-readable string (`previous`, `next`, `ellipsis`, nav `aria-label`)
  with language-neutral glyph defaults (F51's policy rule)

Table manager — `egl-utils-js/bootstrap` (composes F42/F51/F65):

- F66 bsTable(container, {columns, data, rowKey?, striped?, stripedColumns?, hover?,
  bordered?, borderless?, small?, responsive?, variant?, caption?, captionTop?, empty?,
  pageSize?, locale?, pipeline?, onRowClick?, signal?}) — renders a complete Bootstrap
  table from column descriptors (`{key, label, format?, align?, headerClass?, cellClass?,
  sortable?, html?, sanitize?}` extending F42's column shape) over **a `tablePipeline`
  instance exposed as `.pipeline`** — nothing is hidden behind the facade. `tbody`
  re-renders from the pipeline's `'change'` view through one `DocumentFragment`; cell
  content goes through `format(value, row)` returning a string (escaped) or a node —
  `{html, sanitize}` for rich cells per F52; `rowKey` (a property name or an extractor)
  stamps `data-key` for delegation; `onRowClick(row, event)` binds via **one** F44
  delegation; `empty` (string or node) renders when the view has no rows; `caption`
  renders a `<caption>`; style flags map to the documented `table-*` classes with
  `responsive` wrapping in `table-responsive[-<breakpoint>]`. Returns `{element, table,
  pipeline, setData(rows), destroy}`.
  **Amended in 15.1** ([ADR-0039](../adr/0039-a-facade-with-a-door-and-what-the-table-costs.md))
  on six points the pre-implementation clause left open or got wrong. The pipeline may be
  **borrowed instead of built**: `pipeline` renders an existing instance and `destroy()`
  then unsubscribes without tearing it down, because spec 03 §4's own argument for a pure
  pipeline is that one instance can pre-derive a page server-side and be adopted in the
  browser — combining it with `data`/`pageSize`/`locale` is a `TypeError`, never a silent
  precedence rule. `element` and `table` are **both** returned, and differ exactly when
  `responsive` wraps the table: `element` is what was appended and what `destroy()`
  removes, so hiding the `<table>` would force a `querySelector` into our own structure.
  A column's `{html, sanitize}` governs **its cells only** — the header takes the
  table-level pair, since a column that renders rich cells must not thereby reinterpret
  its own label, and a rich header is a `label` node needing no markup decision. A cell
  with no `format` renders primitives and blanks for nullish, and **throws a `TypeError`
  naming the column for anything else** — `String(value)` would ship `[object Object]`,
  and a `Date` would render in the runtime's default format, a human-readable string
  NFR-21 reserves for the caller. `onRowClick` makes rows **keyboard-operable**
  (`tabindex="0"`, Enter/Space), and neither a key pressed inside a cell's control nor a
  click on an `a`/`button`/`input`/`select`/`textarea`/`label` (or a
  `data-egl-no-row-click` element) inside the row also fires the row. Finally `sortable`
  stamps `data-sort-key` for F67 to wire in 15.2, and `captionTop`/`stripedColumns` cover
  the two documented Bootstrap classes the original list omitted
- F67 bsTable controls (same export, `controls` option): `controls: {filterRow?,
  search?, pageSize?, pagination?, toolbar?, formatStatus?, debounceMs?}` — renders a
  per-column filter row under the header (inputs speaking the **F33 grammar including
  custom `{operators}`**, placed only for columns with `filterable: true`), a global
  search input, a page-size select, and an F65 pagination bar, then wires them
  through **F51 `bindTableControls`** — public pipeline commands only, `aria-sort` on
  sortable headers, debounced inputs, one-way reflection. `toolbar` is a caller-rendered
  slot node placed in the header band; `destroy()` tears down controls, bindings,
  delegation and the pipeline subscription in one structural pass (NFR-15).
  **Amended in 15.2** ([ADR-0040](../adr/0040-one-grammar-one-pager-and-a-ceiling-below-its-own-parts.md))
  on four points. Custom `{operators}` reach the inputs because **the pipeline** now
  carries the vocabulary (spec 03 F42, amended in the same PR) and the input hands over
  text — the Bootstrap layer holds no grammar knowledge at all; without that change the
  promise was unkeepable, since `tablePipeline` forwarded only `locale` to
  `compileFilter`. The **pager is wired through its own F65 `onPage`/`update` rather than
  F51's prev/next pair** — F65 already contains prev and next, so routing both would put
  two controls on one job — and it rides the table's existing `'change'` subscription;
  only the status element goes through F51. Each control takes `true` for its defaults or
  an options object, and **every human-readable string is injectable**: `aria-label`s
  default to English (a name must be words — the F57/F65 precedent), the status keeps
  F51's language-neutral `'1 / 4'`, page sizes are digits, and an unpaginated choice
  appears **only** when the caller supplies its word. A column with `filterable: false`
  gets an empty cell rather than a box whose first keystroke the pipeline would reject,
  and the filter row is `<td>` cells inside `<thead>` so it is neither announced as
  headers for the data nor able to reach the sort delegation. The instance gains
  `controls`, the rendered nodes, for the reason `.pipeline` is public

Behavior wrappers — `egl-utils-js/bootstrap` (Bootstrap JS reached per NFR-18; every
wrapper returns `{element, instance, destroy}` plus the methods listed, forwards
`{bootstrap}` for injection, exposes the underlying Bootstrap instance as `.instance`,
and `destroy()` disposes it plus every listener the wrapper attached):

- F68 Behavior resolution (cross-cutting): a wrapper resolves the Bootstrap constructor
  **lazily at first use, never at module load** (`sideEffects: false` holds). Resolution
  order: the injected `{bootstrap}` option → the ambient `globalThis.bootstrap` (script/
  CDN usage) → throw an `EglError` with **stable code `EGL_PEER_MISSING`** naming the
  missing package and both remedies (install the `bootstrap` peer or load the bundle);
  F80/F81 additionally name `@popperjs/core` when Popper is what's absent. The error
  class/plumbing is fixed by the M16 ADR; the code, the laziness and the resolution
  order are frozen here. **Fixed in 16.1 by
  [ADR-0041](../adr/0041-a-peer-looked-up-not-imported.md)**: the carrier is a
  `PeerMissingError` class on `egl-utils-js/errors` with a `.peer` field naming the npm
  package, since every stable code in this library has a class (ADR-0003); the namespace
  is reached by **value lookup, never by `import` — static or dynamic** (a static one
  would fail at load for a consumer who only wanted a builder, a dynamic one would make
  every wrapper method asynchronous); resolution happens at the **first operation that
  needs Bootstrap**, not when a wrapper is constructed, and is not negatively memoized, so
  a bundle that loads late still works; and a namespace **present but lacking the
  component** raises the same code with a message naming the component, because the
  caller's problem — an unreachable capability — is identical. A bundler consumer, having
  no ambient global, passes `{ bootstrap }`
- F69 bsToast(container, {variant?, autohide?, delay?, animation?, labels?, bootstrap?,
  signal?}) — toast manager: `show(message, {title?, variant?, autohide?, delay?})`
  builds the toast node (escaped body/title, F57 close button, `role="alert"`/`"status"`
  by severity, correct `aria-live`/`aria-atomic`), shows it via `bootstrap.Toast`, and
  removes the node after `hidden.bs.toast`; consecutive `show`s never accumulate stale
  variant classes; also `hide()`, `destroy()`
- F70 bsModal(target, {bootstrap?, backdrop?, keyboard?, focus?, signal?}) — modal
  wrapper over `bootstrap.Modal.getOrCreateInstance(target)`: `show()`, `hide()`,
  `toggle()`, `on(event, handler)` → unsubscribe for the `*.bs.modal` lifecycle events
  (a name without a dot is qualified for the caller, so `'hidden'` and
  `'hidden.bs.modal'` are the same subscription); `destroy()` hides if shown,
  unsubscribes everything and disposes the instance — and where the dialog **is** shown it
  disposes on `hidden.bs.modal` rather than immediately, since disposing a shown modal
  leaves Bootstrap's backdrop on the page and the body scroll-locked; "shown" is tracked
  from the DOM events, because Escape and the data-API dismiss button close a dialog
  without passing through this wrapper. **Amended in 16.1**
  ([ADR-0041](../adr/0041-a-peer-looked-up-not-imported.md)): the wrapper also publishes
  what it wraps — `instance()` (resolving on first call) and `element` — the door
  ADR-0039 put on `bsTable` for the same reason, since a facade that cannot be escaped
  becomes a ceiling
- F71 bsLoadingOverlay({bootstrap?, target?, message?, minVisibleMs?, focus?, signal?})
  — the F50 gate (composed, not reimplemented) with its presentation pair pre-wired to a
  static-backdrop, non-dismissable Bootstrap modal holding an F58 spinner and an escaped
  `message`; builds its own modal element when `target` is absent and removes it on
  `destroy()`; the F50 API (`show` → idempotent release, `wrap`, `isShown`, `destroy`)
  passes through unchanged. **Clarified in 16.1**
  ([ADR-0041](../adr/0041-a-peer-looked-up-not-imported.md)): each hook resolves on the
  matching Bootstrap lifecycle event, so the F50 minimum-visible clock measures a real
  appearance rather than the call that requested one; and `show`/`wrap` resolve the peer
  **before** engaging the gate, so a missing peer surfaces as `EGL_PEER_MISSING` at the
  call instead of being absorbed by ADR-0032's hook containment — NFR-18's typed-failure
  promise wins over containment here, and only here, because a silent no-overlay hides a
  packaging mistake rather than a rendering one
- F72 bsCollapse(target, {toggler?, bootstrap?, signal?}) — collapse wrapper: `show`,
  `hide`, `toggle`, `on(...)`; when `toggler` is given the wrapper owns the click
  binding and keeps `aria-expanded` + the `collapsed` class in sync on it — the wiring
  Bootstrap's data-API does, but imperative and torn down by `destroy()`
- F73 bsAccordion(container, {items?, alwaysOpen?, flush?, bootstrap?, signal?}) —
  accordion manager: with `{items}` (`{header, body, open?}` — both escaped-or-node per
  F52) it **builds** the full accordion structure with unique ids and correct
  `aria-expanded`/`aria-controls`; without, it adopts existing markup; `open(i)`,
  `close(i)`, `on(...)`, `destroy()`; `alwaysOpen` maps to the parent-scoping behavior
- F74 bsDropdown(toggler, {bootstrap?, autoClose?, signal?}) — dropdown wrapper:
  `show/hide/toggle/update`, `on(...)`; `destroy()` disposes and unbinds
- F75 bsTabs(container, {tabs?, kind?, fade?, bootstrap?, signal?}) — navs & tabs
  manager: with `{tabs}` (`{label, pane, active?, disabled?}`) it builds the
  `nav`/`nav-tabs|pills` + `tab-content` pair with full ARIA wiring (`role="tablist"`,
  `role="tab"`/`aria-selected`/`aria-controls`, `role="tabpanel"`); without, it adopts
  existing markup; `select(i)`, `on(...)` over `*.bs.tab`; keyboard behavior is
  Bootstrap's own Tab plugin
- F76 bsNavbar(container, {brand?, items?, expand='lg', placement?, variant?,
  togglerLabel='Toggle navigation', bootstrap?, signal?}) — navbar composer: brand
  (text escaped or node), nav items (`{label, href, active?, disabled?, children?}` —
  `children` yields an F74-managed dropdown), and the responsive toggler wired to an F72
  collapse; `aria-current="page"` on the active item; returns `{element, collapse,
  destroy}`
- F77 bsOffcanvas(target, {bootstrap?, backdrop?, scroll?, signal?}) — offcanvas
  wrapper: `show/hide/toggle`, `on(...)` over `*.bs.offcanvas`, `destroy()`
- F78 bsCarousel(target, {items?, controls?, indicators?, interval?, ride?, bootstrap?,
  labels?, signal?}) — carousel manager: with `{items}` (`{content, caption?, alt?,
  active?}`) it builds slides, optional prev/next controls and indicators with injected
  `labels` (language-neutral defaults per F51's rule); `to(i)`, `prev()`, `next()`,
  `cycle()`, `pause()`, `on(...)`; without items it adopts existing markup
- F79 bsScrollspy(target, {bootstrap?, rootMargin?, smoothScroll?, signal?}) — scrollspy
  wrapper: `refresh()`, `on('activate', handler)` mapping `activate.bs.scrollspy`,
  `destroy()`
- F80 bsTooltip(target, {title?, placement?, trigger?, html?, sanitize?, bootstrap?,
  signal?}) — tooltip wrapper: `show/hide/toggle/enable/disable/setContent`; string
  content is passed with Bootstrap's `html: false` (escaped); `{html: true}` requires
  the F52 `sanitize` pair **before** the content reaches Bootstrap, and the wrapper sets
  Bootstrap's own `sanitize` off only in that already-sanitized path (one sanitizer, the
  caller's, never two half-trusted ones); requires Popper per F68
- F81 bsPopover(target, {title?, content?, placement?, trigger?, html?, sanitize?,
  bootstrap?, signal?}) — popover wrapper with the same contract as F80 for both
  `title` and `content`

## 3. Non-Functional Requirements

<!-- Hard budgets are numbers with units and directions; each maps to a mechanical CI
     check (§6). -->

- NFR-17 Bundle budgets (min+gzip, size-limit gate in CI): the **`/bootstrap` entry
  ≤ 25 kB** as a whole — **amended in 16.1 from 15 kB by
  [ADR-0041](../adr/0041-a-peer-looked-up-not-imported.md)**, on measuring 15083 B with
  three of the fourteen wrappers landed and eleven still to come. The clause is now sized
  for the **finished** catalogue rather than amended once per PR, while each entry row
  stays pinned to its own measurement (16.2 kB here) so unintended growth is still caught
  — the two instruments do different jobs. It holds ~30 managers; consumers tree-shake, so
  the per-import rows are the budget that matters. Following the NFR-12 rule as amended in
  practice: each budget below is an **indicative ceiling on the landing measurement, not
  a prediction** — on landing, every row is pinned to measured + ≈7% with the measured
  figure recorded in the row name, and a ceiling that proves wrong is amended **by ADR
  in the same PR, never silently and never by deleting the row**. Pure atom builders
  (F53–F60) keep a **1.2 kB** single-import clause — **amended in 14.1 from 1 kB by
  [ADR-0037](../adr/0037-builder-contract-nodes-escape-and-the-atom-budget.md)** on
  measuring the F52 contract every builder shares: `bsCloseButton`, the simplest builder
  that still resolves a document, validates class tokens and sets an ARIA surface, is
  **813 B**, so about four fifths of the old clause is obligation that
  NFR-19/NFR-20/NFR-21 impose rather than fat, leaving ~200 B for a builder's own markup.
  Five of the eight atoms measure inside 1 kB regardless (813–895 B) and are pinned there;
  three land just past it (`bsPlaceholder` 1005 B, `bsBadge` 1014 B, `bsProgress` 1101 B).
  **`bsButton` is additionally a named composing row at 1.85 kB** (measured 1688 B): it
  composes `bsIcon`, because F55 accepts an icon *name*, which is the ergonomic point of
  the option — the same exemption this clause already grants `bsTable`, extended
  explicitly rather than by inference. Instance managers and composing facades
  take named rows (indicative): `bsCard` ≤ 1.5 kB — **amended in 14.2 from 1.25 kB on
  measuring 1418 B** — `bsListGroup` ≤ 2.15 kB — **amended from 1.25 kB on measuring
  2006 B, and reclassified as a *composing* row: it composes `bsBadge` and owns a
  delegated listener** — `bsBreadcrumb` ≤ 1.3 kB — **amended from 0.75 kB on measuring
  1184 B, a ceiling that sat *below the shared F52 contract floor* (`bsCloseButton`, the
  thinnest builder that still resolves a document, validates class tokens and sets an ARIA
  surface, measures 763 B), so no builder of any kind could have met it** — all three by
  [ADR-0038](../adr/0038-composites-compose-and-what-a-frozen-constant-costs.md);
  `bsAlert` ≤ 2 kB (composes F49; **measured 1521 B, ceiling held**); `bsPagination` ≤
  1.5 kB (**measured 1406 B, ceiling held**); **`bsTable` ≤
  9.5 kB** (a facade over F42 + F51 + F65 measures roughly as the sum of what it
  composes — the NFR-12 lesson, pre-declared; **F66's half measured 5324 B in 15.1,
  3250 B of it the pipeline, and the whole measured 8842 B in 15.2 — amended from
  6.5 kB by [ADR-0040](../adr/0040-one-grammar-one-pager-and-a-ceiling-below-its-own-parts.md),
  because the rows of the three parts this clause itself names already sum to 6774 B
  (pipeline 3275 + bindTableControls 2093 + bsPagination 1406), so the ceiling was
  unmeetable before a single cell was rendered — the `bsBreadcrumb` error of ADR-0038
  repeated one wave later. The measurement also settles the design claim: F67's controls
  added 3518 B against 3499 B of composed parts, i.e. 19 B of glue**);
  `bsLoadingOverlay` ≤ **2.73 kB** — **amended in 16.1 from 1.75 kB on measuring 2550 B by
  [ADR-0041](../adr/0041-a-peer-looked-up-not-imported.md): the parts it composes,
  `loadingOverlay` (958 B, 12.2) and `bsSpinner` (778 B, 14.1), already sum to 1736 B
  against a 1792 B ceiling, leaving 56 B for its own code. That is the third ceiling in
  this wave written below its own parts (ADR-0038's `bsBreadcrumb`, ADR-0040's `bsTable`),
  so the rule is now stated rather than rediscovered: a ceiling for a composing symbol is
  derived from the rows of what it composes, never estimated**;
  `bsAccordion`/`bsTabs`/`bsNavbar`/`bsCarousel` ≤ 1.5 kB; every remaining
  behavior wrapper ≤ 1.25 kB — **confirmed right for its class in 16.1: `bsModal`, which
  wraps a behaviour and builds nothing, measures 1060 B. A wrapper that also *builds*
  takes a composing row instead: `bsToast` ≤ 2.32 kB (measured 2170 B), reclassified by
  ADR-0041 because it composes `bsCloseButton` and assembles a node, which is a different
  job from wrapping**. The **root entry is not touched by this wave** (spec 01
  NFR-01 stays frozen); `/errors` grows 34 B for `PeerMissingError` (measured 351 B, well
  inside its 0.4 kB spec-02 clause) and no other entry's budget moves.
- NFR-18 Optional-peer containment: `bootstrap` (and transitively `@popperjs/core`) is
  an **optional peerDependency, never a runtime dependency** — the zero-dependency gate
  (NFR-06) still passes. The builder and table files (F52–F67) never reference the peer
  at all: with no `bootstrap` installed and no global loaded, **importing the entry and
  running every builder succeeds** (proved in CI). Behavior wrappers resolve per F68 —
  lazily, injected-first — and a missing peer is a **typed failure at use**
  (`EGL_PEER_MISSING`, checked by `.code`, never a `ReferenceError` at import). No
  module-level side effects: `sideEffects: false` holds for the entry.
- NFR-19 Escape-by-default (the toolkit's XSS posture): **no builder ever concatenates
  caller data into markup** — data lands via `textContent`/`setAttribute` only; the sole
  path to raw HTML is the explicit `{html: true, sanitize}` pair, where `sanitize` is a
  function (e.g. F24 `sanitizeHtml`, reached **as a parameter** — the entry never
  imports `/sanitize`) or the literal `false` as a signed trusted-content declaration.
  Proved by an adversarial corpus (script tags, event-handler attributes, javascript:
  URLs, broken-out attribute quotes) rendered through **every** builder option that
  accepts caller content and asserted inert (§6). The threat model gains the F66 row
  (untrusted records rendered at scale) and the F80/F81 row (content handed to a
  third-party renderer) in the same PRs.
- NFR-20 Node-safety: the entry follows the amended NFR-14 rule — **importing
  `egl-utils-js/bootstrap` is always safe** with no DOM present; a builder given a
  container/element operates in that node's own document, an export that must resolve
  the **ambient** document throws `DomContractError` (`EGL_DOM_CONTRACT`, by `.code`)
  when there is none — never `ReferenceError`, never a silent no-op. Proved in both
  directions on the CI matrix.
- NFR-21 Accessibility contract, mechanical: every manager sets the ARIA surface
  Bootstrap 5 documents for its component — asserted per builder in jsdom (roles,
  `aria-label`/`aria-current`/`aria-expanded`/`aria-selected`/`aria-controls`,
  aria-value* on F59, `role="status"|"alert"` + `aria-live` on F58/F64/F69, `aria-sort`
  via F51 on F67) — and **an icon-only or glyph-only control without an accessible name
  is a `TypeError`**, not a warning (F53/F55/F57/F65/F78). Every human-readable string a
  manager would emit is injectable with a language-neutral default (F51's policy rule,
  applied wave-wide).
- NFR-04 non-extension (explicit, continuing specs 02–03): no performance-parity claims,
  no pinned third-party baselines, no new absolute benchmark obligations; the nightly
  gate's scope does not grow in this wave.
- NFR-01/02/03/05/06/07 (spec 01), NFR-08/09/10 (spec 02) and NFR-12/14/15/16 (spec 03)
  apply unchanged: coverage ≥ 95% lines and branches, tree-shakability proved per
  import, zero runtime dependencies, Safari ≥ 15.4 / Node ≥ 18 floor with the
  deny-by-default api-floor inventory (any DOM global this wave newly touches is
  inventoried in the same PR), and NFR-15 teardown completeness for every listener,
  timer, subscription **and Bootstrap instance** a wrapper owns (`destroy()` must
  `dispose()` it — a disposed-but-listening or listening-but-disposed half-state is a
  test failure).

## 4. Logical Architecture & Core Algorithm

One new browser-leaning entry, three source files behind a barrel (the `/dom` precedent),
layered strictly **on top of** the existing waves:

```text
egl-utils-js/bootstrap (NEW)   bootstrap.js            barrel     [browser-leaning, opt-in]
                               bootstrap-elements.js   F52-F65    (no peer — classes are strings)
                               bootstrap-table.js      F66-F67    (composes /table + /dom + F65)
                               bootstrap-behaviors.js  F68-F81    (optional peer, lazy per F68)

composition edges (one direction only — the core never imports /bootstrap):
  bsAlert (F64)          → inlineAlert (F49)
  bsLoadingOverlay (F71) → loadingOverlay (F50) → bootstrap.Modal (peer)
  bsTable (F66-F67)      → tablePipeline (F42) + bindTableControls (F51)
                           + bsPagination (F65) + delegate (F44)
  every builder          → the F52 contract (escape, fragments, teardown)
  wrappers (F69-F81)     → F68 resolution → injected bootstrap | globalThis.bootstrap
  sanitizer              → always a parameter (F24 never imported)
```

The load-bearing decisions: **classes are data, behaviors are a peer** — the split
between `bootstrap-elements.js` (which must work with nothing but a DOM) and
`bootstrap-behaviors.js` (which reaches the peer lazily per F68) makes the
zero-dependency promise and the CDN-script usage pattern both hold; **compose, never
reimplement** — the Bootstrap layer contributes markup, class maps and peer wiring,
while state, timers, refcounts, delegation and derivation stay in the spec-02/03
mechanisms it composes; and **`bsTable` hides nothing** — `.pipeline` is public, so an
application that outgrows the facade drops one layer without rewriting its data flow.

## 5. Public Interface

Consumers import via the exports map, e.g.
`import { bsTable, bsToast, bsBadge } from 'egl-utils-js/bootstrap';`. The wave's
surface:

- `egl-utils-js/bootstrap` (new): `bsIcon`, `bootstrapIconsSet`, `materialIconsSet`,
  `bsBadge`, `bsButton`, `bsButtonGroup`, `bsCloseButton`, `bsSpinner`, `bsProgress`,
  `bsPlaceholder`, `bsCard`, `bsListGroup`, `bsBreadcrumb`, `bsAlert`, `bsPagination`
  (F52–F65); `bsTable` (F66–F67); `bsToast`, `bsModal`, `bsLoadingOverlay`,
  `bsCollapse`, `bsAccordion`, `bsDropdown`, `bsTabs`, `bsNavbar`, `bsOffcanvas`,
  `bsCarousel`, `bsScrollspy`, `bsTooltip`, `bsPopover` (F68–F81)
- `package.json` += `bootstrap` as an **optional** peerDependency (`^5`), mirroring the
  `dompurify` precedent; `@popperjs/core` is **not** declared — it is Bootstrap's own
  peer, and F80/F81 name it in their failure message instead
- The stable error code **`EGL_PEER_MISSING`** joins the taxonomy on
  `egl-utils-js/errors` (its carrier class fixed by the M16 ADR)

Error model, unchanged in kind: **wrong types and missing accessible names throw
`TypeError`** (programmer errors); **expected-malformed user input never throws** (F67
filter expressions stay total per NFR-09); **environment failures carry stable `EGL_*`
codes** — `EGL_DOM_CONTRACT` for a missing DOM, `EGL_PEER_MISSING` for a missing peer,
`HttpError` untouched. Named exports only, no default export (ADR-001). SemVer surface:
every export above, the `{html, sanitize}` contract, the F68 resolution order and both
error codes are MAJOR-protected once released; pre-1.0 each completed milestone ships as
a MINOR.

## 6. Verification & Test Strategy

Vitest on the Node 18/20/22 matrix; coverage ≥ 95% lines and branches including every
error path. The suites split along this wave's two boundaries — peer/no-peer and
jsdom/real-engine:

- **Builders (F52–F65) are tested in jsdom with no Bootstrap anywhere** (per-file
  `// @vitest-environment jsdom`): DOM-shape assertions per builder (element, class
  list, ARIA surface per NFR-21), the F52 contract (fragment batching, `.element`,
  `destroy()`), and table-driven option matrices for branch coverage.
- **NFR-19 is an adversarial corpus, not a code review**: every content-accepting
  option of every builder is fed script tags, event-handler attributes and quote
  breakouts, asserting the payload lands as inert text; the `{html: true, sanitize}`
  path asserts the caller's sanitizer runs (a spy) and that omitting `sanitize` with
  `html: true` throws.
- **NFR-18 both ways**: one suite imports the entry with **no peer installed or
  global**, runs every builder green, and asserts each wrapper's first use throws with
  `.code === 'EGL_PEER_MISSING'` (never `instanceof`, never `ReferenceError`); the
  wrapper suites then run against the real `bootstrap` package (a devDependency, as
  DOMPurify already is) and against an **injected fake** proving the `{bootstrap}`
  option wins over the global.
- **NFR-15 extends to peer instances**: teardown assertions count listeners through an
  instrumented root **and** assert `dispose()` was called on the underlying Bootstrap
  instance; fake timers are driven past every scheduled callback.
- **Playwright covers what only a real engine settles** (the M6.4 job, fixture extended
  to load `bootstrap.bundle.min.js` — bundling Popper — from the pinned devDependency):
  toast show/auto-hide/removal, modal and offcanvas open/close with focus behavior,
  F71's anti-flicker gate over a real modal, collapse/accordion/tab/dropdown toggling
  with `aria-expanded`/`aria-selected` transitions, carousel advance, scrollspy
  activation on scroll, tooltip and popover appearing through Popper, and one `bsTable`
  end-to-end — populate → filter command → sort → page — through the Bootstrap controls.
- **NFR-20 is a matrix test**: a Node cell imports the entry, asserts import safety, and
  asserts the ambient-document builders throw `DomContractError` by `.code`.
- Packaging gates per PR: size-limit rows per NFR-17 (pinned measured+≈7% on landing),
  agadoo shakeability, publint + arethetypeswrong (the new exports-map entry), the
  zero-runtime-dependency check (peer stays optional), typedoc warning-free,
  `pnpm check:api-floor` (any newly-touched DOM global inventoried in the same PR), and
  `python tools/consistency_lint.py`. The threat model is updated in the same PR as F66
  (untrusted records rendered at scale) and F80/F81 (sanitized content handed to a
  third-party renderer; one sanitizer — the caller's — never two half-trusted passes).
