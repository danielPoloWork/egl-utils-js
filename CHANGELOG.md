# Changelog

All notable changes to `egl-utils-js` are documented here, following
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning 2.0.0](https://semver.org/).

Every PR that introduces a user-visible change adds a line to `[Unreleased]` in the same
PR. A release PR moves the `[Unreleased]` entries into a new per-version file under
`docs/changelog/v<MAJOR>/v<X.Y.Z>.md` and adds an index row below.

## [Unreleased]

### Added

- **`egl-utils-js/logging`** — a new entry with `logger`, `formatLogLine`,
  `formatTimestamp`, and `LOG_LEVELS` (ROADMAP 10.1, spec 02 F40–F41,
  [ADR-0027](docs/adr/0027-logging-formatter-sink-split.md)). One ordered **level
  threshold** replaces the usual flag-per-severity bag, and every seam is injected:
  `sink` chooses the destination, `format` the line shape, `now` the clock, `id` the
  correlation id. A sink receives the record **and** the formatter, so a structured
  transport ignores it and pays nothing while a text sink calls it — nothing is formatted
  that nobody reads. `child('db')` names contexts with an explicit string, so log lines
  survive minification (reflection over `fn.name` does not). **Logging never throws into
  application code**: a dead sink, a throwing clock or id function, a hostile `toString`
  — each costs that one record and is reported once through `console.error`. CR/LF are
  collapsed in the message *and* in the name and id columns, so one record is always
  exactly one line and a newline arriving through an injected id cannot forge a log entry.
  The entry measures 1390 B; `formatLogLine` alone is 876 B and `LOG_LEVELS` alone 60 B,
  while `logger` composes the subsystem and takes a documented 1.45 kB NFR-08 exception.

### Changed

### Deprecated

### Removed

### Fixed

### Security

---

## Released versions

| Version | Date       | Changelog                                                  |
| ------- | ---------- | ---------------------------------------------------------- |
| v0.2.0  | 2026-08-06 | [docs/changelog/v0/v0.2.0.md](docs/changelog/v0/v0.2.0.md) |
| v0.1.0  | 2026-08-03 | [docs/changelog/v0/v0.1.0.md](docs/changelog/v0/v0.1.0.md) |
