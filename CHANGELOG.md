# Changelog

All notable changes to `egl-utils-js` are documented here, following
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning 2.0.0](https://semver.org/).

Every PR that introduces a user-visible change adds a line to `[Unreleased]` in the same
PR. A release PR moves the `[Unreleased]` entries into a new per-version file under
`docs/changelog/v<MAJOR>/v<X.Y.Z>.md` and adds an index row below.

## [Unreleased]

### Added

- **Grid keyboard navigation on `bsTable`** — `keyboard: true` gives the table **one** position in
  the page's tab order and moves a cell focus inside it with the arrows, `Home`/`End`,
  `Ctrl+Home`/`Ctrl+End` and `PageUp`/`PageDown` (measured against the viewport, or a fixed
  `keyboard: { pageRows }`). `Enter` enters a cell's control and `Escape` returns, which is how the
  F95 checkbox, the F99 resize grip, the F100 reorder handle and your own row actions stay reachable
  — every control the table renders is demoted to `tabindex="-1"` and reached through its cell,
  **including the ones you put there**, because one row-action button left in the tab order breaks
  the single promise the option makes. A row with `onRowClick` stops being a tab stop too; `Enter`
  on a cell with no control of its own activates it. Movement clamps at every edge, so the
  navigation never turns the page. The moving focus is a roving `tabindex` rather than a painted
  highlight, so the browser scrolls the cell into view and the screen reader reads it — asserted on
  three engines. Opt-in: a table without `keyboard` is unchanged (spec 09 F130–F131, ROADMAP 23.3,
  [ADR-0086](docs/adr/0086-one-tab-stop-and-a-clause-that-stopped-working.md)).

- **Column visibility on `bsTable`, and a chooser the user drives** — `visible` and `hideable` join
  `resizable` and `movable` on the column descriptor; `hideColumn`, `showColumn`, `toggleColumn`,
  `getHiddenColumns()` and `onColumnVisibility()` join the instance; `controls: { columns: true }`
  renders a keyboard-operable group of checkboxes announced through an F110 live region. **Hiding a
  column keeps everything else** — sort, filter, search, F99 width, F100 position — because the F42
  derivation is never told which columns a viewer can see, which is also why hiding the column a
  table is sorted by does not clear the sort. The cell is **removed rather than styled away**, so a
  hidden column is absent from the accessibility tree and from `querySelectorAll` too. Hiding the
  last visible column is a `TypeError`, and the chooser disables that checkbox so a user never
  reaches it (spec 09 F128–F129, ROADMAP 23.2,
  [ADR-0085](docs/adr/0085-visibility-is-rendering-and-the-clause-moved-again.md)).
- **Visibility travels in the URL** — `tableStateToParams`/`tableStateFromParams` carry a `hidden`
  set (repeated `hidden=` parameters, sorted and de-duplicated), and `bindTableHistory` takes a
  `visibility` adapter that a `bsTable` instance already satisfies:
  `bindTableHistory(table.pipeline, { visibility: table })`. A shared link now shows the columns its
  sender was looking at. `tableStateFromParams` returns one more field, `hidden`, as a result (spec
  09 F129, ROADMAP 23.2).

- **`safeUrl` on `egl-utils-js/sanitize`, and every builder URL routed through it** — escaping
  protects a record's *content*; a record's **URL** is an instruction, and `javascript:…` in a data
  field was a live link with the page's authority. The guard **parses, then decides**: `new URL()`
  against a non-resolvable probe base, then a `Set` lookup on the protocol — so `JaVaScRiPt:`,
  `java	script:`, a leading control character and a percent-encoded colon each get one answer, the
  last of them correctly **allowed** because it is a path and the browser agrees. A refusal is
  `null`, never a throw, so one hostile field cannot discard the other forty-nine records; the
  default set is `http:`/`https:`/`mailto:`/`tel:` plus relative references, extended per call with
  `protocols`. A property test asserts totality: a string or `null` for any input, never an
  exception (spec 09 F126, ROADMAP 23.1,
  [ADR-0084](docs/adr/0084-a-url-is-not-text.md)).

### Changed

- **The Bootstrap builders no longer render a URL they have not checked** — seven call sites (card
  image, list-group item, breadcrumb link, navbar brand, nav item, nav child, carousel image) route
  their data-driven `href`/`src` through the guard. A refused URL leaves the attribute **unset**
  rather than empty (an `href=""` is a link to the current page), keeps the element with its label
  and `alt`, and carries `data-egl-refused-url` so the refusal is findable. The two image builders
  allow `data:`/`blob:` themselves — inert in an `<img>`, a script in an `href` — and any builder's
  set widens through the shared `protocols` option beside `{html, sanitize}`. **A behaviour change,
  deliberately**: a `javascript:` link that rendered before now renders inert
  (spec 09 F127, ROADMAP 23.1, [ADR-0084](docs/adr/0084-a-url-is-not-text.md)).
- **ADR-0041's 25 kB `/bootstrap` entry clause is amended to 25.5 kB** — the honest single-function
  routing measured 3 B *over* it, and the hot/cold split that saved 101 B on the entry (and ~150 B
  on each of five per-function rows) landed 98 B under, which is not a margin to ship on. The clause
  moves by the minimum that restores the 368 B the row had; what it was sized to prevent is the
  catalogue sprawling, and a security control on components that already exist is not sprawl
  (ROADMAP 23.1, [ADR-0084](docs/adr/0084-a-url-is-not-text.md)).
- **NFR-22's derived artifact clause re-derives to 71 kB** (70 546 B) — exactly as 21.5 predicted
  when it landed 20 B under 70 kB. F87's served-byte accounting priced the guard's new shared chunk
  at **+724 B and a fourth request** on `/sanitize`, **+1 051 B and a thirteenth** on `/bootstrap`,
  and **+913 B and an eleventh** on `/ui` — for a guard `/ui` never calls, because it composes
  `/bootstrap` internals. The same code is 247 B on a bundler consumer's row
  (ROADMAP 23.1, ADR-0061, [ADR-0084](docs/adr/0084-a-url-is-not-text.md)).

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
