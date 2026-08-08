# Changelog

All notable changes to `egl-utils-js` are documented here, following
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning 2.0.0](https://semver.org/).

Every PR that introduces a user-visible change adds a line to `[Unreleased]` in the same
PR. A release PR moves the `[Unreleased]` entries into a new per-version file under
`docs/changelog/v<MAJOR>/v<X.Y.Z>.md` and adds an index row below.

## [Unreleased]

### Added

- The Bootstrap navigation set on `egl-utils-js/bootstrap` (ROADMAP 16.2, spec 04 F72–F76,
  ADR-0042): `bsCollapse`, `bsAccordion`, `bsDropdown`, `bsTabs` and `bsNavbar`. Two wrap
  markup you already have; three **build** it when given items — because a navigation
  component's accessibility lives in the ids joining its parts, and those are what
  hand-written templates get wrong. Every id is minted against the live document (and
  against the ids already handed out in the same build), so it can collide neither with
  the page nor with itself. `bsCollapse` keeps a toggler's `aria-expanded` truthful and,
  unlike the data-API, can be torn down; `bsAccordion` composes one collapse per item and
  leaves exclusivity to Bootstrap's own parent scoping; `bsTabs` writes the
  tablist/tab/tabpanel triple both ways and leaves arrow-key roving to Bootstrap;
  `bsNavbar` composes the other two and hands both back. Given no items, each manager
  adopts existing markup instead, and `destroy()` removes only what it built.

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

- `bsToast` now builds in the **container's own document** rather than the ambient one,
  matching every other container-taking manager (`bsTable`, `bsPagination`). For a
  container inside an iframe the old behaviour built nodes in the top document. Corrected
  before the release that would have shipped it (ROADMAP 16.2, ADR-0042).

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
