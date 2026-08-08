---
'egl-utils-js': minor
---

`bsTooltip` and `bsPopover` (ROADMAP 16.4, spec 04 F80–F81, ADR-0044) — **completing the
Bootstrap 5 catalogue at 24 of 24 components**, 29 tree-shakeable exports on one opt-in
entry.

The last two are the only pair that hands content to Bootstrap to render, so the escape
contract gains one rule: exactly one sanitizer runs, and it is the caller's — Bootstrap's
own is switched off for content we have already sanitized, because two passes mean neither
is the boundary and the profile you chose gets quietly narrowed by one you did not. They
also need Popper, and its absence is reported as `@popperjs/core` rather than as
`bootstrap`, so nobody re-checks the install that was already fine.
