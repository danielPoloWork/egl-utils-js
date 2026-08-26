# Changelog

All notable changes to `egl-utils-js` are documented here, following
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning 2.0.0](https://semver.org/).

Every PR that introduces a user-visible change adds a line to `[Unreleased]` in the same
PR. A release PR moves the `[Unreleased]` entries into a new per-version file under
`docs/changelog/v<MAJOR>/v<X.Y.Z>.md` and adds an index row below.

## [Unreleased]

### Added

- **Form value binding on a new `egl-utils-js/forms` entry** — `createForm` reads, writes,
  serializes and resets a form's fields, and `getValue` on `egl-utils-js/dom` is the
  single-control read half `setValue` never had. **The coercions are contract**: one checkbox is
  `boolean`, several sharing a name are a `string[]` of the checked values, a radio group of any
  size answers which value is chosen or `null`, an empty `type="number"` is `null` (never `NaN`,
  never `''`), an unselected `select` is `null`, and a file field is `File[]` and read-only.
  **`reset()` is not `HTMLFormElement.reset()`** — the baseline is what was *loaded*, not what
  the markup shipped, and `setBaseline()` adopts a new one after a save. A key naming no field
  is a `TypeError`, not a silent no-op (ADR-0047 extended from options bags to a data map).
  `toJSON()` carries what the values mean and omits file fields; `toFormData()` carries what the
  controls hold, in the shape the browser would have submitted. A **subject** entry rather than
  more of `/dom` or `/ui`, and validation/submission/dirty tracking will be factories that
  *take* a form instance rather than methods on it (spec 08 F112–F115, ROADMAP 21.1,
  [ADR-0077](docs/adr/0077-a-subject-entry-a-primitive-that-stayed-one-and-a-family-not-a-god-object.md)).

### Changed

- **NFR-22's artifact ceiling is re-derived to 64 kB** — the same sum-of-measured-entry-figures
  method now has a twelfth input and reads 63 862 B. The size-limit row stays the gate and is
  re-pinned to 46.4 kB (measured 45 514 B + 2.0%) (ROADMAP 21.1, ADR-0077).
- **`FormData` joins the platform api-floor inventory** — declared explicitly against the
  Safari 16.4 / Node 22 matrix rather than reached and noticed later, bringing the inventory to
  53 entries (spec 08 NFR-40, ROADMAP 21.1).
- **A twelfth entry re-split the shared chunks, and F87's accounting says what it cost** — the
  deep-ESM routes for `/dom` and `/bootstrap` each gained **two** requests and `/ui` one, for a
  wave that added nothing to those entries; `/bootstrap` simultaneously *gained* 32 B on its
  bundled size-limit row, leaving 505 B under ADR-0041's clause. One change, two consumers,
  opposite directions (ROADMAP 21.1, ADR-0077).

### Deprecated

### Removed

### Fixed

### Security

---

## Released versions

| Version | Date       | Changelog                                                  |
| ------- | ---------- | ---------------------------------------------------------- |
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
