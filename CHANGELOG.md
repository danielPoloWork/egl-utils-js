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
- `egl-utils-js/bootstrap` gains the composite builders `bsCard`, `bsListGroup`,
  `bsBreadcrumb`, `bsAlert` and `bsPagination` (ROADMAP 14.2, spec 04 F61–F65, ADR-0038).
  `bsAlert` **is** the `inlineAlert` engine with Bootstrap's class map, and
  `bsPagination.update()` accepts the shape `tablePipeline.view()` already returns, so
  wiring a pager to a table needs no adapter.
- Builder content slots now accept an **array** of strings and nodes, rendered in order
  through one `DocumentFragment` (F52, extended in 14.2).

### Changed

### Deprecated

### Removed

### Fixed

- **Build:** `pnpm-lock.yaml` is back in step with `package.json`, which had declared the
  optional `bootstrap` peer without it. Every CI job failed at
  `pnpm install --frozen-lockfile` from the 14.1 merge until this fix (BUG-0002). No
  shipped code was affected; `bootstrap` is now a devDependency, as `dompurify` already
  was, so the package still declares zero runtime dependencies.
- `inlineAlert` (`egl-utils-js/dom`): an empty close icon no longer hides the close
  control. A design system that draws its close glyph in CSS — Bootstrap's `.btn-close`,
  for one — supplies an empty icon, which previously left a dismissible alert nobody could
  dismiss. `dismissible: false` remains the way to ask for no close button (ADR-0038).
- Frozen constant maps on `egl-utils-js/bootstrap` are annotated `/* @__PURE__ */`, so a
  bundler can drop the ones an importer does not use. Importing a single icon preset fell
  from 358 B to 43 B, and every element builder is smaller than in the previous release.

### Security

- Supply chain: `nanoid` reached through `tsup > postcss` is lifted to `~3.3.17`,
  clearing the `high` advisory GHSA-2v37-7h3g-55p8. Range-scoped and pinned to the
  patch line per [ADR-0033](docs/adr/0033-js-yaml-overrides-stay-inside-their-major-line.md),
  so the unrelated `nanoid@5` instance in the tree is untouched. Build tooling only —
  no shipped code depends on it.

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
