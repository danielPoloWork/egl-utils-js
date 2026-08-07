---
'egl-utils-js': minor
---

`loadingOverlay` joins `egl-utils-js/dom` and completes M12 (ROADMAP 12.2, spec 03 F50,
ADR-0032): a reference-counted visibility gate over an injected `onShow`/`onHide` pair.
`show()` returns an idempotent release and the overlay hides only when the last holder
releases, so overlapping operations cannot tear it down early; the minimum-visible floor is
measured from when `onShow` settles rather than when `show()` is called, so an animated
presentation is not counted against its own anti-flicker time and a hide requested
mid-appearance is honoured once the overlay is actually up. `wrap()` releases on success,
rejection, and synchronous throw alike, `focus.save` restores the pre-overlay focus, and a
failing presentation hook is contained rather than thrown into the calling code.
