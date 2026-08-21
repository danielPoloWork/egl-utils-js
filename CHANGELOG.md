# Changelog

## 1.1.0

### Minor Changes

- 630ebf4: The package declares its **CDN default**: the `unpkg` and `jsdelivr` fields point at the
  global artifact, so the bare package URL serves something a classic `<script src>` can run
  (ROADMAP 18.3, spec 05 F84, ADR-0060).

  ```html
  <script src="https://cdn.jsdelivr.net/npm/egl-utils-js@1.1.0"></script>
  <script src="https://unpkg.com/egl-utils-js@1.1.0"></script>
  ```

  Both resolve to `dist/global/egl-utils.global.js`. Pin the version: entries share
  content-hashed chunks, so mixing versions on one page double-loads shared code.

  The deep `dist/esm/<entry>.js` paths remain the module-consumer route and are unchanged. So
  is everything else a bundler sees: the `exports` map is byte-for-byte identical, and no
  `main`, `module` or `browser` field was added — a packaging gate now asserts their absence,
  because `browser` in particular would silently redirect bundler consumers onto the
  single-file artifact.

  That same gate reads the **packed tarball's own file list** and asserts every advertised
  path is in it — both CDN fields, all 41 exports-map targets, and the artifact's sourcemap.
  `files` and the fields that name files are set independently, and nothing else in the
  toolchain compares them.

- 4d8090e: The package ships a **global single-file artifact**: `dist/global/egl-utils.global.js`, a
  minified IIFE with a sourcemap, loadable by a classic `<script src>` — no modules, no
  bundler, no npm (ROADMAP 18.2, spec 05 F83, ADR-0059).

  It reads as the single global `egl`: the root entry's exports at the top level, and each
  subpath as a sub-namespace named after its exports path.

  ```html
  <script src="https://unpkg.com/egl-utils-js@1.0.0/dist/global/egl-utils.global.js"></script>
  <script>
    const rows = egl.table.paginate(data, { page: 1, pageSize: 20 });
    document.body.append(egl.bootstrap.bsBadge(`${rows.total} results`));
  </script>
  ```

  The whole public surface is there and nothing is renamed — asserted against the built file
  by a new packaging gate rather than promised, along with `egl.VERSION` matching
  `package.json`, no second global being defined, and no optional peer being bundled. Peers
  stay external and are resolved at use exactly as on the ESM path, so a page that already
  loads Bootstrap or DOMPurify keeps the copy it has.

  Nothing changes for a bundler consumer: the `exports` map, `sideEffects: false` and the zero
  runtime dependencies are untouched, and re-bundling produces the same graph as before.

  The artifact measures **31 444 B** (min+brotli, the metric every size row in this project
  uses), gated at 33.6 kB — 25% under the sum of the ten individual entries, which is the
  deduplication a single file buys.

All notable changes to `egl-utils-js` are documented here, following
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning 2.0.0](https://semver.org/).

Every PR that introduces a user-visible change adds a line to `[Unreleased]` in the same
PR. A release PR moves the `[Unreleased]` entries into a new per-version file under
`docs/changelog/v<MAJOR>/v<X.Y.Z>.md` and adds an index row below.

## [Unreleased]

### Added

- **Measured route costs** in that README section: what each no-bundler route actually
  transfers, per entry and for the artifact, gated in CI so the figures cannot drift
  (`pnpm check:transfer`). Notably `/bootstrap` costs 31.28 kB over 7 requests where the
  whole single-file artifact costs 31.61 kB over 1 — so a page needing `/bootstrap` should
  prefer the artifact (spec 05 F87, ROADMAP 18.5,
  [ADR-0061](docs/adr/0061-served-bytes-are-their-own-accounting.md)).

- **README section "Use from a browser, without npm"** documents both no-bundler routes with
  copy-pasteable, version-pinned URLs: the deep-ESM route per entry (and why no import map
  is needed — every entry's internal imports are relative, never a bare specifier), the
  global artifact route, how each optional peer (`bootstrap`, `dompurify`) is supplied on
  either route, and the cross-version rule — pin one `egl-utils-js` version for every URL on
  a page, since entries share content-hashed chunks _within_ a version, not across one (spec
  05 F85, ROADMAP 18.4).

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
