---
'egl-utils-js': minor
---

The first Bootstrap behaviour wrappers (ROADMAP 16.1, spec 04 F68–F71, ADR-0041):
`bsToast`, `bsModal` and `bsLoadingOverlay` on `egl-utils-js/bootstrap`, plus
`PeerMissingError` (`EGL_PEER_MISSING`) on `egl-utils-js/errors`.

These are the first exports that need Bootstrap's own JavaScript, and the entry still
never imports it: the namespace is looked up when a wrapper is first *used* — the
`{ bootstrap }` option ahead of a `window.bootstrap` — so the fourteen builders keep
working with no peer installed, and a missing one is a typed failure at the call rather
than a broken import for everybody.
