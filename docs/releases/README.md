# Releases

Per-version release notes for `egl-utils-js`. The release process
([`../workflow/release.md`](../workflow/release.md)) drafts `v<MAJOR>.<MINOR>.<PATCH>.md` here
for each release; the maintainer publishes the matching GitHub Release. The consistency lint's
`version-lockstep` check keeps the latest file here in step with the version constant and the
README badge.

## Index

| Version | Date | Highlights | Notes |
|---------|------|------------|-------|
| v0.6.0 | 2026-08-07 | A composable table pipeline on `egl-utils-js/table` where filtering and sorting compose instead of discarding each other, and `bindTableControls` on `egl-utils-js/dom` to drive it from real controls with structural teardown | [v0.6.0.md](v0.6.0.md) |
| v0.5.0 | 2026-08-07 | UI components on `egl-utils-js/dom` — `inlineAlert`, whose instances cannot steal each other's timer or container, and `loadingOverlay`, a reference-counted gate whose anti-flicker floor starts when the presentation actually appears | [v0.5.0.md](v0.5.0.md) |
| v0.4.0 | 2026-08-06 | `egl-utils-js/dom` — element binding with a missing-element report, event delegation with signal teardown, native setters, fragment injection with a required sanitizer, auto-grow, URL parameters | [v0.4.0.md](v0.4.0.md) |
| v0.3.0 | 2026-08-06 | `egl-utils-js/logging` — a level-thresholded logger with an injected sink, formatter, clock and correlation id; spec 02 complete (F26–F41) | [v0.3.0.md](v0.3.0.md) |
| v0.2.0 | 2026-08-06 | The `/text`, `/net` and `/table` entries, plus `formatDuration`, `normalizeError`, `createResource` and `pageSessionId` | [v0.2.0.md](v0.2.0.md) |
| v0.1.0 | 2026-08-03 | First public release — the 25-function surface of spec 01 across the root, `/storage`, `/sanitize` and `/errors` entries | [v0.1.0.md](v0.1.0.md) |
