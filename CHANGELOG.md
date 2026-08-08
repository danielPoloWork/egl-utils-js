# Changelog

## 0.8.0

### Minor Changes

- 4966d1e: `bsTable` grows its controls (ROADMAP 15.2, spec 04 F67, ADR-0040): a per-column filter
  row, a search box, a page-size select and an F65 pagination bar, all driving the table's
  pipeline through its public commands via F51 `bindTableControls` — debounced, `aria-sort`
  reflected, torn down in one pass, and exposed as `table.controls`. Every human-readable
  string is injectable, and the defaults render digits rather than a language.

  `tablePipeline` gains `operators`, the F33 custom-token vocabulary, applied to every
  filter string it compiles — a column filter and the global search alike. Until now only
  `locale` was forwarded to `compileFilter`, so a project's own operators were unreachable
  from any string filter, whether typed into a box or set from code.

- 41c9fbd: The first Bootstrap behaviour wrappers (ROADMAP 16.1, spec 04 F68–F71, ADR-0041):
  `bsToast`, `bsModal` and `bsLoadingOverlay` on `egl-utils-js/bootstrap`, plus
  `PeerMissingError` (`EGL_PEER_MISSING`) on `egl-utils-js/errors`.

  These are the first exports that need Bootstrap's own JavaScript, and the entry still
  never imports it: the namespace is looked up when a wrapper is first _used_ — the
  `{ bootstrap }` option ahead of a `window.bootstrap` — so the fourteen builders keep
  working with no peer installed, and a missing one is a typed failure at the call rather
  than a broken import for everybody.

- 702134d: `bsTable` joins `egl-utils-js/bootstrap` (ROADMAP 15.1, spec 04 F66, ADR-0039): a complete
  Bootstrap 5 table over the F42 pipeline, which it keeps public as `.pipeline` — so filtering
  and sorting compose, commands re-render, and an application that already holds a pipeline
  (a server-derived first page, one shared with another view) passes it in and keeps it. Cells
  escape by default with the markup decision made per column, row activation is one delegated
  listener that also answers the keyboard, and a cell value the library would have to guess at
  throws instead.

All notable changes to `egl-utils-js` are documented here, following
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning 2.0.0](https://semver.org/).

Every PR that introduces a user-visible change adds a line to `[Unreleased]` in the same
PR. A release PR moves the `[Unreleased]` entries into a new per-version file under
`docs/changelog/v<MAJOR>/v<X.Y.Z>.md` and adds an index row below.

## [Unreleased]

### Added

- `bsToast`, `bsModal` and `bsLoadingOverlay` on `egl-utils-js/bootstrap` (ROADMAP 16.1,
  spec 04 F68–F71, ADR-0041): the first wrappers over Bootstrap's own JavaScript, which is
  an **optional peer** this entry never imports. A wrapper resolves it when you first use
  one — the `{ bootstrap }` option first, then a `window.bootstrap` a CDN bundle defined —
  so constructing one costs nothing, a bundle that loads late still works, and importing
  the entry can never fail for someone who only wanted a badge. When it is genuinely
  missing you get a typed `PeerMissingError` (`EGL_PEER_MISSING`, with `.peer`) at the
  call, naming the package and both remedies, rather than a `ReferenceError` or a silent
  no-op. Each toast is a fresh node that disposes itself and leaves the DOM once hidden;
  the modal publishes its Bootstrap instance and disposes only after the dialog has
  actually closed; the overlay is the F50 gate — reference counting, anti-flicker floor,
  focus restore — with its presentation bridged to a static-backdrop modal.
- `PeerMissingError` on `egl-utils-js/errors` (code `EGL_PEER_MISSING`), carrying the npm
  package name in `.peer`.

- `bsTable` grows a `controls` option (ROADMAP 15.2, spec 04 F67, ADR-0040): a per-column
  filter row, a global search box, a page-size select and an F65 pagination bar, wired to
  the table's pipeline through F51 `bindTableControls` — public commands only, debounced
  inputs, `aria-sort` on sortable headers, and one structural teardown. Every
  human-readable string is injectable and none is rendered unasked: the status text is
  digits, page sizes are digits, and an unpaginated option appears only if you name it.
  The rendered nodes are exposed as `table.controls`.
- `tablePipeline` accepts `operators` (spec 03 F42, amended): the F33 custom-token
  vocabulary, now applied to every filter string the pipeline compiles — a column filter
  and the global search alike. Previously only `locale` was forwarded, so a project's own
  operators were unreachable from any string filter.

- `bsTable` on `egl-utils-js/bootstrap` (ROADMAP 15.1, spec 04 F66, ADR-0039): a complete
  Bootstrap 5 table rendered from column descriptors over an F42 `tablePipeline` that stays
  **public** as `.pipeline` — filter, sort and page compose, commands re-render, and an
  existing pipeline can be passed in and is borrowed rather than adopted. Cells obey the
  builder escape contract per column, row activation is one delegated listener and works
  from the keyboard, and a non-primitive cell value without a `format` throws instead of
  being stringified into the page.

### Changed

### Deprecated

### Removed

### Fixed

### Security

---

## Released versions

| Version | Date       | Changelog                                                  |
| ------- | ---------- | ---------------------------------------------------------- |
| v0.7.0  | 2026-08-08 | [docs/changelog/v0/v0.7.0.md](docs/changelog/v0/v0.7.0.md) |
| v0.6.0  | 2026-08-07 | [docs/changelog/v0/v0.6.0.md](docs/changelog/v0/v0.6.0.md) |
| v0.5.0  | 2026-08-07 | [docs/changelog/v0/v0.5.0.md](docs/changelog/v0/v0.5.0.md) |
| v0.4.0  | 2026-08-06 | [docs/changelog/v0/v0.4.0.md](docs/changelog/v0/v0.4.0.md) |
| v0.3.0  | 2026-08-06 | [docs/changelog/v0/v0.3.0.md](docs/changelog/v0/v0.3.0.md) |
| v0.2.0  | 2026-08-06 | [docs/changelog/v0/v0.2.0.md](docs/changelog/v0/v0.2.0.md) |
| v0.1.0  | 2026-08-03 | [docs/changelog/v0/v0.1.0.md](docs/changelog/v0/v0.1.0.md) |
