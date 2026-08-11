# Changelog

All notable changes to `egl-utils-js` are documented here, following
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning 2.0.0](https://semver.org/).

Every PR that introduces a user-visible change adds a line to `[Unreleased]` in the same
PR. A release PR moves the `[Unreleased]` entries into a new per-version file under
`docs/changelog/v<MAJOR>/v<X.Y.Z>.md` and adds an index row below.

## [Unreleased]

### Removed

- **BREAKING — the supported-runtime floor for the 1.x line is now Node >= 22 and
  Safari >= 16.4** ([ADR-0050](docs/adr/0050-the-1x-runtime-floor.md), roadmap 17.2). Node 18
  left maintenance in April 2025 and Node 20 in April 2026, so the old `>= 18` floor promised
  two runtimes nobody patches. The CI matrix is now 22 / 24 / 26 — oldest maintained LTS,
  Active LTS, Current — and `engines` states the floor, so installs warn rather than failing
  mysteriously. The Safari figure moved for a different reason: at 15.4 the claim was
  four-and-a-half years wide and untestable, since Playwright ships one recent WebKit build.
- The internal `AbortSignal.timeout` fallback is **deleted**: the static is native across the
  new floor (Safari 16.0, Node 17.3), so `timeout` — and `retry`/`httpClient`, which compose
  it — call the platform directly. The root entry loses 50 B and `httpClient`'s documented
  budget exception returns to its original 1.35 kB. `AbortSignal.any` stays reimplemented:
  Safari added it only in 17.4.

### Added

- `element` on `bsToast`, `inlineAlert`/`bsAlert` and `bsLoadingOverlay`; `isShown()` on
  `bsModal`, `bsTooltip`/`bsPopover`, `inlineAlert`/`bsAlert` and `bsToast`; `on()` on
  `bsToast`, subscribed on the container so one listener sees every toast it builds; and a
  `document` override on `bsPagination` and `bsTable`, which `bsToast` already had
  ([ADR-0049](docs/adr/0049-commands-throw-queries-answer.md), roadmap 17.9).

### Changed

- **BREAKING — the instance lifecycle contract** ([ADR-0049](docs/adr/0049-commands-throw-queries-answer.md), roadmap 17.9). Commands throw, queries answer, `destroy()` is idempotent:
  - `loadingOverlay(...).show()` → **`acquire()`** and `bsToast(...).show()` → **`add()`**.
    Everything still called `show`/`hide`/`toggle` now returns `void`, everywhere: one hands
    back a lease, the other creates a toast and returns its node.
  - A command on a destroyed instance throws `TypeError: <api>: <method>() was called after
    destroy()` — **one sentence** replacing three, and naming the method the caller used
    rather than an internal chokepoint. Four commands that used to be silent now refuse:
    `bsProgress.setValue`, `bsToast.hide`, `inlineAlert.hide`/`bsAlert.hide`, and
    `loadingOverlay.wrap`.
  - `isShown()` after `destroy()` answers `false` instead of throwing, and data properties
    (`element`, `items`, `triggers`, `pipeline`) stay readable.
  - `bsAlert` and `bsLoadingOverlay` now report **their own** names in every diagnostic,
    instead of the engine's (`inlineAlert`, `loadingOverlay`) they compose.

- **BREAKING — the option and method vocabulary v1.0.0 freezes** ([ADR-0048](docs/adr/0048-one-word-one-meaning.md), roadmap 17.8). One word, one meaning:
  - `label` → **`ariaLabel`** on `bsIcon`, `bsButtonGroup`, `bsCloseButton`, `bsSpinner`,
    `bsProgress`, `bsBreadcrumb` (and inside an `icon` spec). `label` now always means text
    the user sees, which is why `bsButton.label` and a column's `label` are unchanged.
  - `bsToast`'s `{autohide, delay}` pair → one **`autoHideMs: number | false`**, at the
    manager and per `show()` — the same word `inlineAlert` and `bsAlert` already used.
    Bootstrap's pair survives only in the config handed to its constructor.
  - `bsListGroup(...).update(items)` → **`setData(items)`**;
    `bsProgress(...).update(value)` → **`setValue(value)`**;
    `bsPagination(...).update(view)` → **`setView(view)`**. A no-argument recompute keeps the
    vendor's own name, so `bsTooltip`/`bsPopover`/dropdown `.update()` and
    `bsScrollspy(...).refresh()` are unchanged.
  - `bsPagination`'s `onPage` → **`onPageChange`**: a callback is named for the event.
  - Every stale call fails loudly rather than silently, because unknown option keys became a
    `TypeError` in the previous change.

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
