# Releases

Per-version release notes for `egl-utils-js`. The release process
([`../workflow/release.md`](../workflow/release.md)) drafts `v<MAJOR>.<MINOR>.<PATCH>.md` here
for each release; the maintainer publishes the matching GitHub Release. The consistency lint's
`version-lockstep` check keeps the latest file here in step with the version constant and the
README badge.

## Index

| Version | Date | Highlights | Notes |
|---------|------|------------|-------|
| v1.1.0 | 2026-08-21 | The plain HTML page becomes a first-class consumer — a global single-file artifact read as `egl`, a CDN default the bare package URL resolves to, both no-bundler routes documented with version-pinned URLs, and what each one transfers measured and gated | [v1.1.0.md](v1.1.0.md) |
| v1.0.0 | 2026-08-13 | **The first release whose version means what SemVer says it means** — no new capability, seven breaking changes taken *before* the freeze rather than after it: the Node 22 / Safari 16.4 floor, unknown-key strictness on options and descriptors, one word one meaning, commands-throw-queries-answer, and a sanitizer peer that is looked up rather than imported. Carries the compatibility statement and the stability promise | [v1.0.0.md](v1.0.0.md) |
| v0.9.0 | 2026-08-09 | The Bootstrap 5 catalogue complete at 24/24 components — the behaviour wrappers over an optional peer this entry imports nowhere, resolved at first use and failing typed when absent; navigation managers that mint their own ARIA ids; one sanitizer, the caller's, for content handed to Bootstrap to render | [v0.9.0.md](v0.9.0.md) |
| v0.8.0 | 2026-08-09 | `bsTable` — a complete Bootstrap 5 table over the `tablePipeline` it keeps **public**, so the facade is a shortcut you can step out of; with an optional controls band whose defaults render digits rather than a language | [v0.8.0.md](v0.8.0.md) |
| v0.7.0 | 2026-08-08 | The opt-in `egl-utils-js/bootstrap` entry — thirteen Bootstrap 5 builders that return real DOM nodes rather than HTML strings, so caller data cannot become markup; `bsAlert` and `bsPagination` compose the v0.5.0/v0.6.0 engines rather than reimplementing them | [v0.7.0.md](v0.7.0.md) |
| v0.6.0 | 2026-08-07 | A composable table pipeline on `egl-utils-js/table` where filtering and sorting compose instead of discarding each other, and `bindTableControls` on `egl-utils-js/dom` to drive it from real controls with structural teardown | [v0.6.0.md](v0.6.0.md) |
| v0.5.0 | 2026-08-07 | UI components on `egl-utils-js/dom` — `inlineAlert`, whose instances cannot steal each other's timer or container, and `loadingOverlay`, a reference-counted gate whose anti-flicker floor starts when the presentation actually appears | [v0.5.0.md](v0.5.0.md) |
| v0.4.0 | 2026-08-06 | `egl-utils-js/dom` — element binding with a missing-element report, event delegation with signal teardown, native setters, fragment injection with a required sanitizer, auto-grow, URL parameters | [v0.4.0.md](v0.4.0.md) |
| v0.3.0 | 2026-08-06 | `egl-utils-js/logging` — a level-thresholded logger with an injected sink, formatter, clock and correlation id; spec 02 complete (F26–F41) | [v0.3.0.md](v0.3.0.md) |
| v0.2.0 | 2026-08-06 | The `/text`, `/net` and `/table` entries, plus `formatDuration`, `normalizeError`, `createResource` and `pageSessionId` | [v0.2.0.md](v0.2.0.md) |
| v0.1.0 | 2026-08-03 | First public release — the 25-function surface of spec 01 across the root, `/storage`, `/sanitize` and `/errors` entries | [v0.1.0.md](v0.1.0.md) |
