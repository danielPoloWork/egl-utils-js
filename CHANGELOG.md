# Changelog

## 0.5.0

### Minor Changes

- 7489107: `inlineAlert` joins the `egl-utils-js/dom` entry (ROADMAP 12.1, spec 03 F49, ADR-0031): an
  instance-based alert component that owns its nodes, its auto-hide timer and its close
  binding, so two alerts on one page cannot cancel each other's timer or steal each other's
  container. Class names and icons are injected maps over neutral, framework-free defaults;
  messages render through `textContent` unless the caller passes the explicit
  `{ html: true, sanitize }` pair; `destroy()` and an aborted `signal` each leave zero
  listeners, timers, and nodes behind.
- e1546f1: `loadingOverlay` joins `egl-utils-js/dom` and completes M12 (ROADMAP 12.2, spec 03 F50,
  ADR-0032): a reference-counted visibility gate over an injected `onShow`/`onHide` pair.
  `show()` returns an idempotent release and the overlay hides only when the last holder
  releases, so overlapping operations cannot tear it down early; the minimum-visible floor is
  measured from when `onShow` settles rather than when `show()` is called, so an animated
  presentation is not counted against its own anti-flicker time and a hide requested
  mid-appearance is honoured once the overlay is actually up. `wrap()` releases on success,
  rejection, and synchronous throw alike, `focus.save` restores the pre-overlay focus, and a
  failing presentation hook is contained rather than thrown into the calling code.

All notable changes to `egl-utils-js` are documented here, following
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning 2.0.0](https://semver.org/).

Every PR that introduces a user-visible change adds a line to `[Unreleased]` in the same
PR. A release PR moves the `[Unreleased]` entries into a new per-version file under
`docs/changelog/v<MAJOR>/v<X.Y.Z>.md` and adds an index row below.

## [Unreleased]

### Added

- `loadingOverlay` on `egl-utils-js/dom` (spec 03 F50, ROADMAP 12.2): a reference-counted
  visibility gate over an injected `onShow`/`onHide` pair, so one gate drives a modal, a
  spinner, or a progress bar. `show()` returns an idempotent release and the overlay hides
  only when the last holder releases; the minimum-visible floor is measured from when
  `onShow` settles, so an animated presentation is not counted against its own anti-flicker
  time and a hide arriving mid-appearance is still honoured. `wrap()` releases on success,
  rejection, and synchronous throw; `focus.save` restores the pre-overlay focus and clears
  focus out of the overlay before hiding; presentation failures are contained (ADR-0032).

- `inlineAlert` on `egl-utils-js/dom` (spec 03 F49, ROADMAP 12.1): an instance-based,
  framework-agnostic alert component. Each instance owns its nodes, its auto-hide timer and
  its close binding, so two alerts on one page cannot interfere; class names and icons are
  injected over neutral defaults; messages render as text by default and require the
  explicit `{ html: true, sanitize }` pair for markup; `destroy()` or an aborted `signal`
  leaves no listener, timer, or node behind (ADR-0031).

### Changed

### Deprecated

### Removed

### Fixed

### Security

- Development dependencies only: js-yaml is lifted to `3.15.1` and `4.3.1` on their
  respective major lines, clearing the two high advisories
  ([GHSA-5p4m-2wfm-xmqj](https://github.com/advisories/GHSA-5p4m-2wfm-xmqj)) that reached the
  tree through `@changesets/cli`. The published package is unaffected — it has zero runtime
  dependencies (ADR-0033).

---

## Released versions

| Version | Date       | Changelog                                                  |
| ------- | ---------- | ---------------------------------------------------------- |
| v0.4.0  | 2026-08-06 | [docs/changelog/v0/v0.4.0.md](docs/changelog/v0/v0.4.0.md) |
| v0.3.0  | 2026-08-06 | [docs/changelog/v0/v0.3.0.md](docs/changelog/v0/v0.3.0.md) |
| v0.2.0  | 2026-08-06 | [docs/changelog/v0/v0.2.0.md](docs/changelog/v0/v0.2.0.md) |
| v0.1.0  | 2026-08-03 | [docs/changelog/v0/v0.1.0.md](docs/changelog/v0/v0.1.0.md) |
