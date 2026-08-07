---
'egl-utils-js': minor
---

New opt-in `egl-utils-js/bootstrap` entry with the Bootstrap 5 element builders (ROADMAP
14.1, spec 04 F52–F60, ADR-0037): `bsIcon` with two injectable icon-set presets, `bsBadge`,
`bsButton`, `bsButtonGroup`, `bsCloseButton`, `bsSpinner`, `bsProgress` and `bsPlaceholder`.

The entry composes the framework-agnostic core and is never imported by it, so a project on
a different design system pays nothing for it. Builders return real DOM nodes rather than
HTML strings, so caller data reaches the page as data — markup requires the explicit
`{ html: true, sanitize }` pair, the same contract `injectFragment` and `inlineAlert` use.
Bootstrap's CSS and any icon font remain the application's to supply, and `bootstrap` is
declared only as an optional peer: no builder in this release touches it.
