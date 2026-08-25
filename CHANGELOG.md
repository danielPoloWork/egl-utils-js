# Changelog

All notable changes to `egl-utils-js` are documented here, following
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning 2.0.0](https://semver.org/).

Every PR that introduces a user-visible change adds a line to `[Unreleased]` in the same
PR. A release PR moves the `[Unreleased]` entries into a new per-version file under
`docs/changelog/v<MAJOR>/v<X.Y.Z>.md` and adds an index row below.

## [Unreleased]

### Added

- **A new `egl-utils-js/ui` entry, with promise-based dialogs** — `createDialogs` returns a
  manager whose `confirm`, `prompt` and `open` each hand back a promise, over the F70 modal
  wrapper rather than a reimplementation of it. **A dismissal is an answer, not an error**:
  Escape, the backdrop, the close control and the cancel button all *resolve* — `false` for a
  confirm, `null` for a prompt (distinguishable from the empty string a user may have typed),
  your own `dismissValue` for `open`. A rejection means the question could not be *asked*, and
  keeps the two existing codes: `EGL_DOM_CONTRACT` with no document, `EGL_PEER_MISSING` with no
  Bootstrap. Exactly one settlement survives any race, because the answer is recorded before
  anything starts closing. Focus is trapped while the dialog is open and **restored to whatever
  opened it**, through the F109 `/dom` primitives rather than a second implementation — and the
  dialog places focus itself, because on WebKit leaving that to Bootstrap let the first Tab
  press escape. A dialog is always named, from its title or from the question itself, so there
  is no accessible-name option to forget. `destroy()` **settles** every dialog still open
  rather than abandoning it. It is a **new entry** rather than more of `/bootstrap` because
  ADR-0041 sized that clause for the finished catalogue and 482 B of it were left (spec 07
  F101–F103 and NFR-32, ROADMAP 20.1,
  [ADR-0071](docs/adr/0071-a-manager-not-three-globals-and-a-dismissal-is-an-answer.md)).

- **`focusTrap`, `saveFocus` and `liveRegion` on `egl-utils-js/dom`** — the two things every
  dialog needs, which this library has had exactly once each, inside the F50 overlay where
  nothing could reach them. The trap keeps Tab inside a region and restores focus on release;
  it is **scoped to Tab deliberately**, correcting the edge the key would leave through and
  leaving everything in between to the browser's own tab order, with no document-level
  `focusin` guard to fight focus moved by assistive technology. A root with nothing focusable
  **holds focus itself** rather than losing it to `<body>` — the case that otherwise turns a
  trap into a lock — and what counts as tabbable is decided without reading layout, because a
  forced layout per Tab press is not a price a keyboard user should pay. `saveFocus` is the
  restore half alone, and `loadingOverlay` now calls it instead of keeping its own copy.
  `liveRegion` announces without moving focus, and announcing the same message twice really
  announces it twice — closing a gap ADR-0069 named, where a column moved by the keyboard was
  announced to nobody (spec 07 F109–F110, ROADMAP 20.5,
  [ADR-0070](docs/adr/0070-two-primitives-extracted-and-a-ceiling-recomputed.md)).

### Changed

- **NFR-22's artifact ceiling is re-derived to 57 kB** — the second recomputation, not a
  raise: the sum-of-measured-entry-figures method spec 05 defined now has an eleventh input and
  reads 57 278 B. The size-limit row stays the gate and is re-pinned to 42 kB (measured 41 119 B
  + 2.1%). Adding the eleventh entry also cost `/bootstrap` 9 B and `/dom` 2 B **without either
  entry changing a line** — esbuild re-split the shared chunks around a new consumer — and cost
  their no-bundler deep-ESM routes considerably more (`/bootstrap` +2 607 B and two extra
  requests, `/dom` +524 B and one), which is what spec 05 F87's served-byte accounting exists to
  keep visible rather than silent (ROADMAP 20.1, ADR-0071).

### Deprecated

### Removed

### Fixed

### Security

---

## Released versions

| Version | Date       | Changelog                                                  |
| ------- | ---------- | ---------------------------------------------------------- |
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
