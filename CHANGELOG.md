# Changelog

## 0.7.0

### Minor Changes

- 85e4050: Composite builders on `egl-utils-js/bootstrap` (ROADMAP 14.2, spec 04 F61–F65, ADR-0038):
  `bsCard`, `bsListGroup`, `bsBreadcrumb`, `bsAlert` and `bsPagination`.

  Two of them compose rather than reimplement. `bsAlert` **is** the `inlineAlert` engine
  (F49) wearing Bootstrap's class map — same instance API, same per-instance timers, same
  escaping rule — and `bsPagination.update()` accepts the shape `tablePipeline.view()`
  already returns, so wiring a pager to a table is one subscription and no adapter. A fix to
  either engine therefore reaches both entries at once.

  Content slots now also accept an array of strings and nodes, rendered in order through one
  `DocumentFragment`, which is what lets a card slot hold text and a badge together.

  Two fixes ride along. `inlineAlert` no longer hides its close control when the icon is
  empty: a design system that draws the glyph in CSS (`.btn-close`) supplies an empty icon,
  and hiding the button for that left a dismissible alert nobody could dismiss. And the
  entry's frozen constant maps are annotated `/* @__PURE__ */`, so unused ones are dropped by
  the bundler — importing a single icon preset fell from 358 B to 43 B, and every element
  builder from the previous release is now smaller.

- 6a41d84: New opt-in `egl-utils-js/bootstrap` entry with the Bootstrap 5 element builders (ROADMAP
  14.1, spec 04 F52–F60, ADR-0037): `bsIcon` with two injectable icon-set presets, `bsBadge`,
  `bsButton`, `bsButtonGroup`, `bsCloseButton`, `bsSpinner`, `bsProgress` and `bsPlaceholder`.

  The entry composes the framework-agnostic core and is never imported by it, so a project on
  a different design system pays nothing for it. Builders return real DOM nodes rather than
  HTML strings, so caller data reaches the page as data — markup requires the explicit
  `{ html: true, sanitize }` pair, the same contract `injectFragment` and `inlineAlert` use.
  Bootstrap's CSS and any icon font remain the application's to supply, and `bootstrap` is
  declared only as an optional peer: no builder in this release touches it.

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
