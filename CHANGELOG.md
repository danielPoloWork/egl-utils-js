# Changelog

## 0.2.0

### Minor Changes

- f7a2359: New `egl-utils-js/table` entry (ROADMAP 9.3, spec 02 F33-F35, ADR-0021/ADR-0022):
  `compileFilter`, `comparator`, and `paginate` — the query primitives behind a data table,
  pure and Node-safe so they run server-side too.

  `compileFilter` interprets a small grammar — substring, `=x`, `!=x`, `^prefix`, `suffix$`,
  `>n` `>=n` `<n` `<=n`, and the nesting `=null`/`=empty`/`=blank` sentinels with their
  negations — and is **total**: every string compiles, including a half-typed one, so a
  filter box can compile on every keystroke without a `try`/`catch`. **No `RegExp` is ever
  constructed from user input**; evaluation is linear with no backtracking, and expressions
  past 1024 characters match literally. Applications extend the grammar through
  `options.operators` rather than forking it.

  `comparator` returns a genuine total order in every mode: missing values are pinned to one
  end _regardless of direction_, mixed types order by type before value (so sorting stays
  transitive on real-world columns), text collates through `Intl.Collator` with
  `numeric: true`, and locale is opt-in for numeric reading so results never depend on the
  machine's regional settings. `paginate` clamps an out-of-range page instead of failing.

  The root entry is untouched.

- f6ddc3a: New `egl-utils-js/net` entry (ROADMAP 9.2, spec 02 F29-F32, ADR-0020): `isIpv4`,
  `parseIpv4`, `formatIpv4`, `ipv4ToKey`, `ipv4FromKey`, and `subnetMaskFromPrefix`. Strict
  IPv4 parsing — four decimal octets, no leading zeros, no `inet_aton` shorthand/octal/hex
  forms — so a validity check and the parse that follows it can never disagree, which is the
  divergence behind allowlist-bypass bugs. The fixed-width key codec (three zero-padded
  digits per octet) makes lexicographic order equal numeric address order and turns
  octet-aligned network containment into a `startsWith`. Invalid content returns `null`;
  only a wrong argument type throws. The root entry is untouched.
- 5598e8a: `pageSessionId` joins `egl-utils-js/storage` (ROADMAP 9.5, spec 02 F39, ADR-0024): a v4
  UUID minted once and held under `sessionStorage` semantics, so it survives reloads and
  in-tab navigation, dies with the tab, and differs between tabs — the scope needed to
  correlate log lines, telemetry, and requests within one browsing session.

  It is a **correlation id, not a credential**: unguessable because it comes from the
  platform CSPRNG, but unauthenticated and readable by any script on the page. Where storage
  is unavailable or blocked (Node, private browsing, a sandboxed iframe) the in-memory
  fallback takes over and the id is stable only for the life of the realm; a corrupt stored
  value or a refused write is absorbed rather than thrown, because a diagnostics helper must
  never be the reason a page breaks.

  Note for `/storage` consumers: the full-entry import grows from 1706 B to 2027 B, since
  `pageSessionId` reuses `uuid` rather than reimplementing entropy handling. Importing only
  the three original wrappers now costs 1698 B — slightly _less_ than before — so the cost
  falls only on consumers of the new function. The spec 01 NFR-01 `/storage` clause is
  amended from 2 kB to 2.1 kB accordingly, with both scenarios pinned as size-limit rows.

- c3044d2: `formatDuration` and `normalizeError` join the root entry (ROADMAP 9.4, spec 02 F36-F37,
  ADR-0023).

  `formatDuration` is the exact inverse of `parseDuration`: it emits the same ADR-0009
  grammar — descending `h`/`m`/`s`, zero segments omitted — so
  `parseDuration(formatDuration(ms)) === ms` holds for every whole second and is asserted as
  a property. Sub-second remainders truncate to a `'0s'` floor rather than rounding up time
  that never elapsed, and fractional input is accepted so `measure()`'s milliseconds can be
  formatted directly.

  `normalizeError` turns anything a `catch` block can receive into one uniform record:
  `{ name, message, stack?, code?, status?, detail?, cause }`, with the optional fields
  present only when the value carried them. It is total — an `Error`, a thrown string,
  `null`, a symbol, a circular object, or one whose `message` getter throws all produce a
  record rather than a second failure — and non-destructive, since `cause` holds the original
  value by identity, so the idiom is to log the record and rethrow the original.

- 7d1f038: `createResource` joins the root entry (ROADMAP 9.6, spec 02 F38, ADR-0025), completing
  milestone 9: a REST resource factory returning `{ list, get, create, update, patch, remove }`
  for one collection.

  The client is a **parameter, never an import**. Anything exposing
  `get`/`post`/`put`/`patch`/`delete` backs a resource — `httpClient`, a test double, or
  another library's client — which keeps the function at 505 B instead of inheriting the
  1304 B facade, works for callers on a different transport, and makes tests need neither a
  network nor a mocking framework. The five verbs are verified once, when the resource is
  built, so a mis-wired transport fails at startup rather than on the first request.

  Ids are treated as data: each is encoded as exactly one path segment, so an id containing
  `/` or `..` addresses a key with those characters rather than widening the path, and a
  `null`/`undefined` id throws instead of silently requesting `…/undefined`. The configured
  path keeps its own separators (`'admin/users'` nests) and a leading `/` is preserved.
  Bodies are sent as JSON; per-call `signal`, `timeout`, and `headers` pass straight through.

- a2f2a32: New `egl-utils-js/text` entry (ROADMAP 9.1, spec 02 F26-F38, ADR-0019): `truncate`,
  `wrapText`, and `fixedWidth`. Pure string shaping measured in UTF-16 code units, with a
  guarantee no helper ever emits a lone surrogate — `fixedWidth` returns exactly the
  requested width for any input, `truncate` counts its marker inside the budget and is
  idempotent, and `wrapText` collapses whitespace runs while preserving paragraph breaks.
  The root entry is untouched, so consumers who never import `/text` pay nothing.

All notable changes to `egl-utils-js` are documented here, following
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning 2.0.0](https://semver.org/).

Every PR that introduces a user-visible change adds a line to `[Unreleased]` in the same
PR. A release PR moves the `[Unreleased]` entries into a new per-version file under
`docs/changelog/v<MAJOR>/v<X.Y.Z>.md` and adds an index row below.

## [Unreleased]

### Added

- `createResource` on the root entry (ROADMAP 9.6, spec 02 F38,
  [ADR-0025](docs/adr/0025-resource-repository-over-an-injected-client.md)): a REST
  resource factory returning `{ list, get, create, update, patch, remove }` over a
  **client passed as a parameter, never imported** — anything exposing
  `get`/`post`/`put`/`patch`/`delete` works, so it costs 505 B rather than inheriting the
  1304 B `httpClient` facade, and a test needs no network and no mocking framework. Ids are
  encoded as exactly one path segment (an id containing `/` or `..` can never widen the
  path) and a `null`/`undefined` id throws rather than requesting `…/undefined`; per-call
  `signal`/`timeout`/`headers` pass straight through.
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

| Version | Date       | Changelog                                                  |
| ------- | ---------- | ---------------------------------------------------------- |
| v0.1.0  | 2026-08-03 | [docs/changelog/v0/v0.1.0.md](docs/changelog/v0/v0.1.0.md) |
