# Changelog

All notable changes to `egl-utils-js` are documented here, following
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning 2.0.0](https://semver.org/).

Every PR that introduces a user-visible change adds a line to `[Unreleased]` in the same
PR. A release PR moves the `[Unreleased]` entries into a new per-version file under
`docs/changelog/v<MAJOR>/v<X.Y.Z>.md` and adds an index row below.

## [Unreleased]

### Added

- `pageSessionId` on `egl-utils-js/storage` (ROADMAP 9.5, spec 02 F39,
  [ADR-0024](docs/adr/0024-page-session-id-scope-and-budget.md)): a v4 UUID held under
  `sessionStorage` semantics, so it survives reloads and in-tab navigation, dies with the
  tab, and differs between tabs — the scope needed to correlate logs and telemetry within
  one browsing session. It is a **correlation id, not a credential**: unauthenticated and
  readable by any script on the page. Where storage is unavailable or blocked it falls back
  to memory (stable for the realm) and never throws, because a diagnostics helper must not
  be what breaks a page.
- `formatDuration` and `normalizeError` on the root entry (ROADMAP 9.4, spec 02 F36-F37,
  [ADR-0023](docs/adr/0023-duration-round-trip-and-the-error-record.md)). `formatDuration` is
  the exact inverse of `parseDuration` — same ADR-0009 grammar, so
  `parseDuration(formatDuration(ms)) === ms` for every whole second, with sub-second
  remainders truncated to a `'0s'` floor and fractional input accepted so `measure()`'s
  output can be handed straight over. `normalizeError` turns anything a `catch` block can
  receive — an `Error`, a string, a response object, `null`, a symbol, a value whose getters
  throw — into one record `{ name, message, stack?, code?, status?, detail?, cause }`, never
  throwing, with `cause` holding the original by identity so the error can still be rethrown.
- New `egl-utils-js/table` entry (ROADMAP 9.3, spec 02 F33-F35): `compileFilter`,
  `comparator`, and `paginate` — the query primitives behind a data table, pure and
  Node-safe. `compileFilter` interprets a small filter grammar (substring, `=`, `!=`,
  `^prefix`, `suffix$`, `>` `>=` `<` `<=`, and the nesting `null`/`empty`/`blank`
  sentinels) that is **total**: every string compiles, so a filter box can compile on
  every keystroke, and **no `RegExp` is ever built from user input**
  ([ADR-0021](docs/adr/0021-filter-expression-grammar.md)). Custom operators plug in
  through `options.operators`. `comparator` returns a genuine total order — blanks pinned
  to one end regardless of direction, mixed types ordered by type then value,
  `Intl.Collator` for text, locale opt-in for numbers
  ([ADR-0022](docs/adr/0022-comparator-total-order-semantics.md)). `paginate` clamps an
  out-of-range page instead of failing.
- New `egl-utils-js/net` entry (ROADMAP 9.2, spec 02 F29-F32): `isIpv4`, `parseIpv4`,
  `formatIpv4`, `ipv4ToKey`, `ipv4FromKey`, and `subnetMaskFromPrefix`
  ([ADR-0020](docs/adr/0020-strict-ipv4-parsing-and-the-sortable-key-codec.md)). Parsing is
  strict — four decimal octets, no leading zeros, none of the legacy `inet_aton` shorthand,
  octal, hex, or bare-integer forms that different parsers resolve differently — so a
  validity check and the parse that follows it can never disagree. The key codec renders three
  zero-padded digits per octet, making lexicographic order match numeric address order and
  octet-aligned network containment a `startsWith`. Invalid content returns `null`; only a
  wrong argument type throws.
- New `egl-utils-js/text` entry (ROADMAP 9.1, spec 02 F26-F28): `truncate`, `wrapText`, and
  `fixedWidth` — pure string-shaping helpers that measure in UTF-16 code units and never emit a
  lone surrogate ([ADR-0019](docs/adr/0019-subpath-family-and-code-unit-text-semantics.md)).
  `fixedWidth` returns exactly the requested width for any input, `truncate` counts its marker
  inside the budget and is idempotent, and `wrapText` preserves paragraph breaks while
  collapsing whitespace runs. The root entry is unchanged — importing nothing from `/text`
  costs nothing.

### Changed

### Deprecated

### Removed

### Fixed

- `release.yml` never read `docs/releases/v<X.Y.Z>.md`, so the hand-written release notes that
  step 3 of the release process mandates were produced and then ignored — the v0.1.0 draft came
  out as a bare 61-entry auto-generated PR list. The workflow now passes the file as the release
  body (the generated list is appended below it) and **fails if it is absent**, so the prose
  cannot be skipped silently.

### Security

---

## Released versions

| Version | Date | Changelog |
|---------|------|-----------|
| v0.1.0 | 2026-08-03 | [docs/changelog/v0/v0.1.0.md](docs/changelog/v0/v0.1.0.md) |
