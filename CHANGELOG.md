# Changelog

## 0.6.0

### Minor Changes

- 579da67: `bindTableControls` on the `egl-utils-js/dom` entry (ROADMAP 13.2, spec 03 F51, ADR-0035):
  the bridge between a `tablePipeline` and its DOM controls, and the last item of the tabular
  wave. Filter and search inputs are debounced into public commands, sort headers share one
  delegated listener and receive `aria-sort`, pagination controls are enabled from the derived
  view, and the status text comes from an injectable `formatStatus` whose default assumes no
  language. Teardown is structural — the returned unbind function, or an aborted signal,
  detaches every listener, cancels every pending debounce and unsubscribes from the pipeline.
  Row rendering stays the caller's.
- 6c2faf1: `tablePipeline` on the `egl-utils-js/table` entry (ROADMAP 13.1, spec 03 F42, ADR-0034):
  one owner of the row set derives one memoized view through a fixed
  `filters → search → sort → paginate` order, so filtering and sorting compose rather than
  discarding each other. Commands are transactions emitting exactly one `'change'` carrying
  that view, `batch()` makes several commands one, and the observer surface delegates to an
  internal `EventEmitter` with `emit` kept private. The pipeline is pure and DOM-free, so it
  derives unchanged on a server; the query primitives stay individually importable at their
  unchanged 1714 B.

All notable changes to `egl-utils-js` are documented here, following
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning 2.0.0](https://semver.org/).

Every PR that introduces a user-visible change adds a line to `[Unreleased]` in the same
PR. A release PR moves the `[Unreleased]` entries into a new per-version file under
`docs/changelog/v<MAJOR>/v<X.Y.Z>.md` and adds an index row below.

## [Unreleased]

### Added

- `bindTableControls` on `egl-utils-js/dom` (roadmap 13.2, spec 03 F51, ADR-0035): wires
  filter, search, sort-header, pagination and page-size controls to a `tablePipeline`
  through its public commands only, and reflects the derived view back — `aria-sort` on
  every header, pagination enabled from the view, and an injectable `formatStatus` whose
  default assumes no language. Filter inputs are deliberately one-way, sort headers use one
  delegated listener that survives re-renders, and teardown is structural: the returned
  unbind (or an aborted signal) detaches every listener, cancels every pending debounce and
  unsubscribes from the pipeline. Row rendering stays the caller's.

- `tablePipeline` on `egl-utils-js/table` (roadmap 13.1, spec 03 F42, ADR-0034): one owner
  of a row set deriving one memoized view through a fixed
  `filters → search → sort → paginate` order, so filtering and sorting compose instead of
  discarding each other. Commands are transactions that emit exactly one `'change'`
  (`batch()` coalesces several), and `on`/`once`/`off` delegate to an internal
  `EventEmitter` whose `emit` stays private. Pure and DOM-free: it derives unchanged on a
  server.

### Changed

- Benchmark gate: every benchmark is now collected (roadmap 13.3, ADR-0036). The report
  classifier silently discarded any group it could not pair with a baseline library, so all
  ten absolute benchmarks — `validateEmail`, `parseDuration`, `urlSearchParams`, `uuid`, the
  type guards and the four pipeline cases — ran on every CI benchmark job and were thrown
  away; the recorded baseline held 13 entries instead of 23. Classification is now a total,
  unit-tested pure function, a benchmark it cannot classify **fails** the run instead of
  dropping out of it, and absolute figures are held to an environment-tagged collapse floor
  (4x slower than recorded fails) with their millisecond figures printed on every run. The
  baseline is recorded on the CI runner, so NFR-13's budget now has the measurement its
  clause always asked for: **10.24 ms mean, 11.96 ms p99 against 50 ms**. No library code
  changed.

### Deprecated

### Removed

### Fixed

- Browser smoke: the table-delegation case now clicks a cell rather than the row
  ([BUG-0001](docs/bugs/2026/08/BUG-0001-webkit-row-click-intercepted.md)). Aiming at the
  `<tr>` made the test depend on a hit-test the standard does not pin down — the CI WebKit
  build resolved the row's centre to the ancestor `<table>`, which Playwright refuses to click
  through — leaving the `browser` gate red since roadmap 13.2. No library behaviour was
  affected; delegation worked in every engine throughout.

### Security

---

## Released versions

| Version | Date       | Changelog                                                  |
| ------- | ---------- | ---------------------------------------------------------- |
| v0.5.0  | 2026-08-07 | [docs/changelog/v0/v0.5.0.md](docs/changelog/v0/v0.5.0.md) |
| v0.4.0  | 2026-08-06 | [docs/changelog/v0/v0.4.0.md](docs/changelog/v0/v0.4.0.md) |
| v0.3.0  | 2026-08-06 | [docs/changelog/v0/v0.3.0.md](docs/changelog/v0/v0.3.0.md) |
| v0.2.0  | 2026-08-06 | [docs/changelog/v0/v0.2.0.md](docs/changelog/v0/v0.2.0.md) |
| v0.1.0  | 2026-08-03 | [docs/changelog/v0/v0.1.0.md](docs/changelog/v0/v0.1.0.md) |
