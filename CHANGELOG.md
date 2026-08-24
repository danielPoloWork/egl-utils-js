# Changelog

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
  relearn. A superseded load is aborted *and* its result discarded even if it arrives first,
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
  nobody has touched. New on the instance: `getColumnWidths()` — the width the table *enforces*,
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
