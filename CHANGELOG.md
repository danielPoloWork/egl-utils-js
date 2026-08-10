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

- **BREAKING — an unknown option key is now a `TypeError`.** Every function that takes an
  options bag rejects a key it does not know, naming it
  (`bsBadge: unknown option 'varient'`), instead of ignoring it in silence. Applies to all
  52 option bags across every entry, including the nested ones (`bsToast.show`,
  `inlineAlert.show`, `loadingOverlay.focus`) and `cookieHelper`'s attribute bags, which say
  *attribute* rather than *option*. Unmodelled vendor options keep their typed channel —
  `bootstrap` on the behaviour wrappers, `operators` on `compileFilter`, `classes` on the
  alert engine ([ADR-0047](docs/adr/0047-an-unknown-option-key-is-a-typeerror.md), roadmap
  17.7).
- Seventeen size-limit rows re-baselined on measurement for the shared per-entry cost of
  that check; four documented budget exceptions grew (`httpClient` 1.35 → 1.4 kB,
  `comparator` 1.05 → 1.1 kB, `logger` 1.45 → 1.5 kB, `/storage` 2.1 → 2.15 kB) and
  `compileFilter` takes a new named one at 1.03 kB. No component or builder clause moved,
  and the root entry stays inside its 6 kB ceiling at 5914 B.

### Deprecated

### Removed

### Fixed

### Security

---

## Released versions

| Version | Date       | Changelog                                                  |
| ------- | ---------- | ---------------------------------------------------------- |
| v0.9.0  | 2026-08-09 | [docs/changelog/v0/v0.9.0.md](docs/changelog/v0/v0.9.0.md) |
| v0.8.0  | 2026-08-09 | [docs/changelog/v0/v0.8.0.md](docs/changelog/v0/v0.8.0.md) |
| v0.7.0  | 2026-08-08 | [docs/changelog/v0/v0.7.0.md](docs/changelog/v0/v0.7.0.md) |
| v0.6.0  | 2026-08-07 | [docs/changelog/v0/v0.6.0.md](docs/changelog/v0/v0.6.0.md) |
| v0.5.0  | 2026-08-07 | [docs/changelog/v0/v0.5.0.md](docs/changelog/v0/v0.5.0.md) |
| v0.4.0  | 2026-08-06 | [docs/changelog/v0/v0.4.0.md](docs/changelog/v0/v0.4.0.md) |
| v0.3.0  | 2026-08-06 | [docs/changelog/v0/v0.3.0.md](docs/changelog/v0/v0.3.0.md) |
| v0.2.0  | 2026-08-06 | [docs/changelog/v0/v0.2.0.md](docs/changelog/v0/v0.2.0.md) |
| v0.1.0  | 2026-08-03 | [docs/changelog/v0/v0.1.0.md](docs/changelog/v0/v0.1.0.md) |
