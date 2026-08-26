# Changelog

All notable changes to `egl-utils-js` are documented here, following
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning 2.0.0](https://semver.org/).

Every PR that introduces a user-visible change adds a line to `[Unreleased]` in the same
PR. A release PR moves the `[Unreleased]` entries into a new per-version file under
`docs/changelog/v<MAJOR>/v<X.Y.Z>.md` and adds an index row below.

## [Unreleased]

### Added

- **Breakpoint observation on `egl-utils-js/ui`** — `createBreakpoints` over Bootstrap's own
  `$grid-breakpoints`, plus the map itself as frozen data (`BOOTSTRAP_BREAKPOINTS`) so a caller can
  read the same numbers rather than repeat them. **Ask once, be told when it changes**, instead of
  a resize listener per component reading layout on the hot path of a drag, or a hand-written
  `min-width` that has to agree with the CSS forever. The four predicates are Bootstrap's four SCSS
  mixins with the meanings **its source** gives them rather than the ones the names suggest:
  `up('md')` is md and wider and is always true for `xs` (which has no query), `down('md')` is
  **narrower than md** — the Bootstrap 5 change people trip over — `only('md')` is md and nothing
  wider, and `between('md','xl')` is half-open. Internally it opens **five** `min-width` queries
  rather than eleven, because BS5's `-down` is the complement of `-up` and `-only`/`-between` are
  intersections of two of them, which is also why the `0.02px` subtraction that a hand-rolled
  version mistypes appears nowhere in this library. `on()` reports a **crossing** rather than a
  media change, so a drag from 800 px to 900 px says nothing and a jump from 500 to 1500 says it
  once. Two questions **throw** instead of returning a plausible boolean: `down('xs')`, since
  nothing is narrower than the base, and a reversed `between`, since it can never match. Absent
  `matchMedia` (Node, an exotic host) degrades to the smallest breakpoint; a seam that cannot be
  subscribed to throws (spec 07 F108, ROADMAP 20.4,
  [ADR-0074](docs/adr/0074-bootstraps-own-mixins-five-queries-and-a-seam-written-once.md)).

- **Theme management on `egl-utils-js/ui`** — `createTheme` over Bootstrap 5.3's own
  `data-bs-theme` and nothing beside it: no class of ours to keep in step, and the attribute name
  deliberately not an option, because a configurable one is how a second theming mechanism
  starts. **`'auto'` is the absence of a stored choice rather than a third state**, so "no choice
  yet" and "follow the system" are one condition that cannot drift apart — and the half usually
  forgotten is the other one: an expressed choice **stops** the system tracking until it is
  withdrawn with `set('auto')`, which is why a site that remembered your preference at 6 pm still
  has it at 7. `get()` answers the preference and `resolved()` what is on the attribute, because
  a settings UI and a component ask different questions. **`themeSnippet()`** is a pure 421 B
  function returning the synchronous `<head>` script that applies a persisted theme **before
  first paint** — emitted rather than documented, because a README snippet shares the storage key
  and the attribute with the manager only by coincidence, and the suite asserts these two agree
  by running the string. **`theme.control()`** builds a toggle whose accessible name is the state
  it will move to, relabelling itself on every change including a system one it did not cause;
  icons are the caller's nodes, with no icon font bundled or assumed. Persistence goes through
  the F21 storage wrapper, so private mode degrades instead of throwing — and `set` applies the
  theme **before** persisting it, so a quota failure arrives with the page already correct
  without being swallowed (spec 07 F106–F107, ROADMAP 20.3,
  [ADR-0073](docs/adr/0073-bootstraps-own-attribute-and-a-snippet-that-cannot-drift.md)).

- **A toast manager on `egl-utils-js/ui`** — `createToasts` adds to `bsToast` the thing it has
  no opinion about: a **policy**. A cap with a queue promoted in arrival order, so a loop of
  forty notifications shows three at a time instead of burying the page it is reporting on; and
  two admission rules with the vagueness taken out of them. Adding again with an **id** the
  manager still holds updates that toast rather than joining it with a second, whether it is
  visible or still queued. An **identical** message is dropped rather than shown twice — where
  identical means the same `variant`, `title` and `message`, and **only when the message and
  title are both strings**, because node content can only be compared by reference and a rule
  that silently never fires is worse than an honest exemption. A dropped duplicate restarts the
  lifetime of the toast already up, so a repeated event still reads as recent, and an explicit
  `id` leaves the dedupe system entirely in both directions, since an id is an assertion of
  distinct identity. **`promise()` tells one story with one toast**: the pending message with no
  auto-hide, replaced in place on settlement, with `success` and `error` allowed to be functions
  of the value and the reason — and it returns **your own promise**, so the settlement passes
  through untouched and an unhandled rejection stays yours to handle. Without a `container` it
  builds and owns a positioned one (seven placements, all Bootstrap's own utilities) and removes
  it on `destroy`. Every node is still built, timed, escaped, announced and disposed by
  `bsToast` (spec 07 F104–F105, ROADMAP 20.2,
  [ADR-0072](docs/adr/0072-a-queue-a-rule-nobody-has-to-guess-and-one-toast-per-story.md)).

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

- **The `matchMedia` seam is shared rather than copied.** The F106 theme manager's resolver moved
  into an internal module the F108 observer uses too, and the manager was rewritten onto it — no
  behaviour change, and one answer instead of two for the question that would otherwise have
  drifted: whether an absent `matchMedia` throws or degrades, and whether a caller's fake is
  validated at all. F111's reduced-motion helper inherits it (ROADMAP 20.4, ADR-0074).
- **NFR-22's artifact ceiling is re-derived to 61 kB** — the fifth recomputation, reading
  61 685 B, all of the movement being `/ui` growing 771 B. The size-limit row stays the gate and is
  re-pinned to 45.1 kB (measured 44 210 B + 2.0%) (ROADMAP 20.4, ADR-0074).
- **The platform api-floor gate now knows about `matchMedia`** — added to the scanner's policed
  globals, so a bare use anywhere in the library is checked rather than invisible, with three
  inventory entries declared: `matchMedia` (Safari 5.1), `MediaQueryList.matches` (5.1) and
  `MediaQueryList.change` (**Safari 14**, the one worth confirming rather than assuming, and what
  makes the deprecated `addListener` unnecessary at a 16.4 floor). This is the NFR-34 amendment
  spec 07 attributed to F108/F111; F106 needed it first, because "follow the system" is a media
  query (ROADMAP 20.3, ADR-0073).
- **NFR-22's artifact ceiling is re-derived to 60 kB** — the fourth recomputation, reading
  60 914 B. `/ui` grew 1 464 B for the theme manager, and `/storage` grew **3 B without changing
  a line**: the manager persists through the F21 wrapper, so the two entries now share a chunk
  and esbuild re-split it. The size-limit row stays the gate and is re-pinned to 44.4 kB
  (measured 43 460 B + 2.1%) (ROADMAP 20.3, ADR-0073).
- **NFR-22's artifact ceiling is re-derived to 59 kB** — the third recomputation, and the first
  with no new entry in it: the same sum-of-measured-entry-figures method reads 59 447 B, all of
  the movement being `/ui` growing 2 169 B for the toast manager. The rule this establishes is
  the point — **the derivation is redone whenever any input moves**, not only when an entry is
  added, because a clause nobody recomputes is a number rather than a bound. The size-limit row
  stays the gate and is re-pinned to 43.3 kB (measured 42 398 B + 2.1%) (ROADMAP 20.2,
  ADR-0072).
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
