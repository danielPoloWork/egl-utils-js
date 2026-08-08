# Changelog

All notable changes to `egl-utils-js` are documented here, following
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning 2.0.0](https://semver.org/).

Every PR that introduces a user-visible change adds a line to `[Unreleased]` in the same
PR. A release PR moves the `[Unreleased]` entries into a new per-version file under
`docs/changelog/v<MAJOR>/v<X.Y.Z>.md` and adds an index row below.

## [Unreleased]

### Added

- New opt-in `egl-utils-js/bootstrap` entry: the Bootstrap 5 element builders `bsIcon`,
  `bsBadge`, `bsButton`, `bsButtonGroup`, `bsCloseButton`, `bsSpinner`, `bsProgress` and
  `bsPlaceholder`, plus the `bootstrapIconsSet` and `materialIconsSet` data presets
  (ROADMAP 14.1, spec 04 F52–F60, ADR-0037). Builders return real DOM nodes and escape
  caller data by construction; markup needs the explicit `{ html: true, sanitize }` pair.
  Bootstrap's CSS and any icon font stay the application's to supply, and the entry has no
  contact with the optional `bootstrap` peer — the builders work with none installed.
- `bootstrap` is now declared as an **optional** peer dependency (`^5`), alongside
  `dompurify`. Nothing in this release requires it.

### Changed

### Deprecated

### Removed

### Fixed

### Security

---

## Released versions

| Version | Date       | Changelog                                                  |
| ------- | ---------- | ---------------------------------------------------------- |
| v0.6.0  | 2026-08-07 | [docs/changelog/v0/v0.6.0.md](docs/changelog/v0/v0.6.0.md) |
| v0.5.0  | 2026-08-07 | [docs/changelog/v0/v0.5.0.md](docs/changelog/v0/v0.5.0.md) |
| v0.4.0  | 2026-08-06 | [docs/changelog/v0/v0.4.0.md](docs/changelog/v0/v0.4.0.md) |
| v0.3.0  | 2026-08-06 | [docs/changelog/v0/v0.3.0.md](docs/changelog/v0/v0.3.0.md) |
| v0.2.0  | 2026-08-06 | [docs/changelog/v0/v0.2.0.md](docs/changelog/v0/v0.2.0.md) |
| v0.1.0  | 2026-08-03 | [docs/changelog/v0/v0.1.0.md](docs/changelog/v0/v0.1.0.md) |
