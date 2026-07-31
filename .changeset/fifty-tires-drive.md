---
'egl-utils-js': minor
---

First feature release: the full 25-function public surface across the root entry and the
`/storage`, `/sanitize`, and `/errors` subpaths — async combinators with AbortSignal-first
cancellation, pure data helpers, a typed event emitter with rate limiters, a fetch facade
with a no-token-storage auth contract, Web Crypto helpers, diagnostics, safe Web Storage
and cookie wrappers, and allowlist-based HTML sanitization delegating to DOMPurify.

Also fixes a portability defect found by the v0.1.0 readiness review: `timeout()` (and
`httpClient()`, which composes it) called `AbortSignal.timeout` unconditionally, which
first shipped in Safari 16.0 while NFR-07 declares Safari >= 15.4 supported. An internal
fallback now covers the whole supported matrix.
