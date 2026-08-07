# Changelog

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

---

## Released versions

| Version | Date       | Changelog                                                  |
| ------- | ---------- | ---------------------------------------------------------- |
| v0.4.0  | 2026-08-06 | [docs/changelog/v0/v0.4.0.md](docs/changelog/v0/v0.4.0.md) |
| v0.3.0  | 2026-08-06 | [docs/changelog/v0/v0.3.0.md](docs/changelog/v0/v0.3.0.md) |
| v0.2.0  | 2026-08-06 | [docs/changelog/v0/v0.2.0.md](docs/changelog/v0/v0.2.0.md) |
| v0.1.0  | 2026-08-03 | [docs/changelog/v0/v0.1.0.md](docs/changelog/v0/v0.1.0.md) |
