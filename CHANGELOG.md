# Changelog

All notable changes to `egl-utils-js` are documented here, following
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning 2.0.0](https://semver.org/).

Every PR that introduces a user-visible change adds a line to `[Unreleased]` in the same
PR. A release PR moves the `[Unreleased]` entries into a new per-version file under
`docs/changelog/v<MAJOR>/v<X.Y.Z>.md` and adds an index row below.

## [Unreleased]

### Added

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
