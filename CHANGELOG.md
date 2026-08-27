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

- **Every size-budget row now declares the figure it actually measures, and a gate keeps it that
  way** — 45 of the 66 rows in `.size-limit.json` that quote a `measured N B` were wrong, a dozen
  by 5–8%, because a row is re-pinned only when its **limit** fails: ADR-0056's descriptor checks
  added a shared cost to every Bootstrap builder and wrapper, and #115's esbuild 0.28 security
  override moved the same family again. `single: bsDropdown` had reached **1 B** of headroom while
  its text claimed 79 B. Each row is re-pinned at its own original margin rather than a blanket
  +7%, and three documented clauses are amended once with the cause — the NFR-17 behaviour-wrapper
  row 1.25 → 1.35 kB, the composite row 1.5 → 1.65 kB, and `bsBreadcrumb`'s 1.3 → 1.4 kB — rather
  than being silently exceeded, which `single: bsCard` already was. `pnpm check:size-figures` now
  fails a row that drifts beyond a band derived from the audit's own data (2% or 8 B)
  (ROADMAP 22.1, [ADR-0082](docs/adr/0082-a-figure-nobody-checks-is-prose.md)).
- **Three existing gates now run on every pull request** — `check:global` (F83's artifact
  surface), `check:packed` (F84's packaged file list) and `check:transfer` (F87's served-byte
  budgets) lived only inside `check:package`, which **only the publish workflow invokes**; no
  publish has ever run, so none of the three had ever been enforced on a PR. All three, plus the
  new figure check, are now steps in the CI packaging job
  (ROADMAP 22.1, [ADR-0082](docs/adr/0082-a-figure-nobody-checks-is-prose.md)).

### Deprecated

### Removed

### Fixed

### Security

---

## Released versions

| Version | Date       | Changelog                                                  |
| ------- | ---------- | ---------------------------------------------------------- |
| v1.4.0  | 2026-08-27 | [docs/changelog/v1/v1.4.0.md](docs/changelog/v1/v1.4.0.md) |
| v1.3.0  | 2026-08-26 | [docs/changelog/v1/v1.3.0.md](docs/changelog/v1/v1.3.0.md) |
| v1.2.0  | 2026-08-24 | [docs/changelog/v1/v1.2.0.md](docs/changelog/v1/v1.2.0.md) |
| v1.1.0  | 2026-08-21 | [docs/changelog/v1/v1.1.0.md](docs/changelog/v1/v1.1.0.md) |
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
