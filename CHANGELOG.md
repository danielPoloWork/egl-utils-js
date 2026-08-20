# Changelog

All notable changes to `egl-utils-js` are documented here, following
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning 2.0.0](https://semver.org/).

Every PR that introduces a user-visible change adds a line to `[Unreleased]` in the same
PR. A release PR moves the `[Unreleased]` entries into a new per-version file under
`docs/changelog/v<MAJOR>/v<X.Y.Z>.md` and adds an index row below.

## [Unreleased]

### Added

- **CDN default** — the `unpkg` and `jsdelivr` fields name the global artifact, so the bare
  package URL (`https://cdn.jsdelivr.net/npm/egl-utils-js`) serves a file a classic
  `<script src>` can run. The `exports` map is byte-for-byte unchanged and no `main`,
  `module` or `browser` field was added; a packaging gate asserts every advertised path is
  present in the packed tarball (spec 05 F84, ROADMAP 18.3,
  [ADR-0060](docs/adr/0060-the-cdn-default-and-what-the-tarball-proves.md)).

- **Global single-file artifact** `dist/global/egl-utils.global.js` — a minified IIFE with
  a sourcemap, loadable by a classic `<script src>` and read as the single global `egl`: the
  root entry's exports at the top level, each subpath as a sub-namespace. Peers stay
  external and are resolved at use, and a packaging gate asserts the surface, the version
  lockstep and the absence of a second global against the built file (spec 05 F83,
  ROADMAP 18.2, [ADR-0059](docs/adr/0059-one-file-one-global-and-a-budget-repinned.md)).

### Changed

### Deprecated

### Removed

### Fixed

### Security

---

## Released versions

| Version | Date       | Changelog                                                  |
| ------- | ---------- | ---------------------------------------------------------- |
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
