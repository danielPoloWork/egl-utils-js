# Changelog

All notable changes to `egl-utils-js` are documented here, following
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning 2.0.0](https://semver.org/).

Every PR that introduces a user-visible change adds a line to `[Unreleased]` in the same
PR. A release PR moves the `[Unreleased]` entries into a new per-version file under
`docs/changelog/v<MAJOR>/v<X.Y.Z>.md` and adds an index row below.

## [Unreleased]

### Added

- **`delegate`, `setEnabled`, `setVisible` and `setValue`** on `egl-utils-js/dom`
  (ROADMAP 11.2, spec 03 F44–F45,
  [ADR-0029](docs/adr/0029-delegation-teardown-and-setter-symmetry.md)). `delegate` attaches
  **one** listener that serves every current and future descendant matching a selector, so a
  re-render needs no rebinding and there is no teardown pass to forget; the handler receives
  the **matched** element rather than `event.target` (which is the deeper node actually
  clicked), and matching is bounded by `root` so `closest` cannot reach an ancestor outside
  the delegated subtree. Teardown is an internal `AbortController`: unsubscribe is one
  `abort()` — idempotent by construction, with no retained handler reference — and a caller
  `signal` is bridged so it cleans up in both directions. The setters are **no-ops on
  nullish** (an absent optional element is a normal state, and requiring `if (el)` at every
  call site is how those guards get forgotten) and throw `TypeError` on a wrong type.
  `setVisible` drives the `hidden` attribute, or a given class **instead** — never both, so
  hide and show always undo each other. `setValue` covers text, textarea, checkbox, radio and
  single/multiple selects, clears on nullish, leaves no phantom selection when no option
  matches, and deliberately **dispatches no event**, matching the assignment it replaces.

- **`egl-utils-js/dom`** — a new browser-leaning entry, opened with `bindElements`,
  `isElement` and `requireDocument` (ROADMAP 11.1, spec 03 F43,
  [ADR-0028](docs/adr/0028-dom-entry-fails-fast-and-the-floor-gate-sees-the-dom.md)).
  `bindElements({name: selector})` resolves a whole markup contract in one pass and returns
  `{elements, missing}`, so a selector typo is one report at startup instead of a `null`
  that travels and resurfaces as *"cannot read properties of null"* somewhere else
  entirely; `{strict: true}` turns it into a `DomContractError` carrying `missing`. The
  entry **fails fast rather than degrading**: with no DOM present every export throws
  `DomContractError` (code `EGL_DOM_CONTRACT`) naming the API, the contract and the DOM-free
  alternative — unlike the storage wrappers' silent fallback, because a `setVisible` that
  quietly does nothing reports success while the page stays unchanged. Importing the entry
  is safe anywhere (the document is resolved per call), so a server render fails on use, not
  on import. `isElement` is structural, so a node from an iframe or a second realm passes
  where `instanceof Element` fails.
- **`DomContractError`** on `egl-utils-js/errors` (code `EGL_DOM_CONTRACT`), carrying
  `missing` for the strict-mode binding failure.

### Security

- The platform-API floor gate now **sees the DOM**
  ([ADR-0028](docs/adr/0028-dom-entry-fails-fast-and-the-floor-gate-sees-the-dom.md), spec 03
  NFR-16). ADR-0017 promised deny-by-default coverage, but the scanner policed no DOM types
  at all and matched only `Global.member` and `Global(` — so `x instanceof Element` and every
  `globalThis.document` read passed in silence. The policed list gains the DOM surface, two
  precise reference shapes are recognised, and a `GLOBALS` entry no longer blanket-authorizes
  the members reached off it. The extension immediately surfaced **eight real, undeclared
  dependencies** (`globalThis` reads of `crypto`, `document`, `fetch`, `localStorage`,
  `location`, `sessionStorage` across five modules — all long-standing, all properly guarded,
  none declared); the inventory grew from 21 entries to 27 with no new code. Verified
  non-vacuous by planting an un-inventoried DOM use and observing the failure.

### Changed

### Deprecated

### Removed

### Fixed

### Security

---

## Released versions

| Version | Date       | Changelog                                                  |
| ------- | ---------- | ---------------------------------------------------------- |
| v0.3.0  | 2026-08-06 | [docs/changelog/v0/v0.3.0.md](docs/changelog/v0/v0.3.0.md) |
| v0.2.0  | 2026-08-06 | [docs/changelog/v0/v0.2.0.md](docs/changelog/v0/v0.2.0.md) |
| v0.1.0  | 2026-08-03 | [docs/changelog/v0/v0.1.0.md](docs/changelog/v0/v0.1.0.md) |
