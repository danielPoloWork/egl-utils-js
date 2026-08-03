# Changelog

All notable changes to `egl-utils-js` are documented here, following
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning 2.0.0](https://semver.org/).

Every PR that introduces a user-visible change adds a line to `[Unreleased]` in the same
PR. A release PR moves the `[Unreleased]` entries into a new per-version file under
`docs/changelog/v<MAJOR>/v<X.Y.Z>.md` and adds an index row below.

## [Unreleased]

### Added

### Changed

### Deprecated

### Removed

### Fixed

- `release.yml` never read `docs/releases/v<X.Y.Z>.md`, so the hand-written release notes that
  step 3 of the release process mandates were produced and then ignored — the v0.1.0 draft came
  out as a bare 61-entry auto-generated PR list. The workflow now passes the file as the release
  body (the generated list is appended below it) and **fails if it is absent**, so the prose
  cannot be skipped silently.

### Security

---

## Released versions

| Version | Date | Changelog |
|---------|------|-----------|
| v0.1.0 | 2026-08-03 | [docs/changelog/v0/v0.1.0.md](docs/changelog/v0/v0.1.0.md) |
