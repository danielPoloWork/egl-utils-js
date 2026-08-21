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
