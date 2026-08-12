# Changelog

All notable changes to `egl-utils-js` are documented here, following
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning 2.0.0](https://semver.org/).

Every PR that introduces a user-visible change adds a line to `[Unreleased]` in the same
PR. A release PR moves the `[Unreleased]` entries into a new per-version file under
`docs/changelog/v<MAJOR>/v<X.Y.Z>.md` and adds an index row below.

## [Unreleased]

### Security

- **BREAKING — the `dompurify` peer range is now `^3.4.13`**, raised from `^3`
  ([ADR-0051](docs/adr/0051-the-sanitizer-s-peer-range.md), roadmap 17.11). 3.4.13 is the first
  release without [GHSA-55q2-fjhq-7xh7](https://github.com/advisories/GHSA-55q2-fjhq-7xh7), so
  the range no longer admits a version known vulnerable when 1.0 freezes it. `sanitizeHtml` was
  never exposed by that advisory — it pins `IN_PLACE: false` — but the range is what the package
  *claims*. A consumer pinned below 3.4.13 now gets a peer-range warning, pointing at the patch
  release that fixes a real advisory.
  - The range is a **compatibility** statement, not a security mechanism: raising a peer floor
    is breaking, so advisories published after 1.0 are yours to patch — and you can, because
    you own the dependency. `SECURITY.md` now says so where a consumer reads it.
- The CI audit gate moves from `--audit-level high` to **`moderate`**, because a DOMPurify
  advisory is the one finding in this tree that can require a change to `sanitizeHtml`'s own
  configuration. The two dev-only advisories that threshold surfaces are **fixed** with pnpm
  overrides rather than excepted (postcss → 8.5.26, esbuild → 0.28.1), so
  `pnpm.auditConfig.ignoreGhsas` stays empty.

### Removed

- **The exports map's `node` condition and the `dist/node` build pair are gone**
  ([ADR-0054](docs/adr/0054-one-web-crypto-surface-without-the-conditions.md), roadmap 17.14,
  superseding [ADR-0008](docs/adr/0008-one-webcrypto-surface-conditional-exports.md)). They
  existed to keep a `node:crypto` import — needed only because Node 18 lacked
  `globalThis.crypto` — out of browser bundles. The 1.x floor is Node >= 22, so the two
  `#webcrypto` shims had reduced to the same line and the condition chose between identical
  files. Now one plain module reads `globalThis.crypto`, the `imports` field is gone, and the
  published tarball drops two of the root entry's four builds plus two source files from
  `files`. **Public API and behaviour are unchanged** — a Node consumer resolves
  `dist/esm/index.js` instead of `dist/node/esm/index.js`, and the two were already
  behaviourally identical. One Web Crypto surface and never `Math.random` (F18) are
  unchanged; only the wiring below them moved.
  - Verification payoff: agadoo and the size budgets already gate the neutral artifact, so
    **what CI measures is now what every consumer gets**. The node pair was exempt from the
    shakeability gate by design.
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
- `withUrlParams` is now also exported from the root entry
  ([ADR-0052](docs/adr/0052-withurlparams-moves-to-the-root.md), roadmap 17.10). It shipped
  on `egl-utils-js/dom`, which is kept for compatibility, but it is pure and SSR-safe and
  belongs beside its sibling `urlSearchParams`. The root full-import budget (NFR-01) is
  amended from 6 kB to **6.05 kB** to fit it — the aggregate's first-ever increase.
- `DomContractError` and `PeerMissingError` are now also exported from the root entry
  ([ADR-0053](docs/adr/0053-the-full-taxonomy-reaches-the-root.md), roadmap 17.12),
  completing the taxonomy re-export ADR-0003 already promised. The root full-import budget
  (NFR-01) is amended a second time this milestone, from 6.05 kB to **6.1 kB**.

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
