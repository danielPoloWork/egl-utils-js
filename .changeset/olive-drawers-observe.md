---
'egl-utils-js': minor
---

The Bootstrap overlay and observation set (ROADMAP 16.3, spec 04 F77–F79, ADR-0043):
`bsOffcanvas`, `bsCarousel` and `bsScrollspy` on `egl-utils-js/bootstrap`.

They share a milestone and not a shape, which is the point: the offcanvas is a
configuration of the shared lifecycle, the carousel builds and labels its own slides and
indicators, and the scrollspy has no open state — so it is written plainly rather than
inheriting three methods that would throw and two events that would never fire.

`bsScrollspy` also gains a `nav` option naming the links it marks; the frozen clause had
no way to say it, and without one the component had no observable output.
