---
'egl-utils-js': patch
---

Fix listener-owning builders against a foreign document (ROADMAP 16.5, BUG-0003,
ADR-0045).

`addEventListener` brand-checks its `signal` option against its own realm, so a controller
built in this one was refused by a node from an iframe, a popup, or a `new JSDOM()`
document — the exact server-render path the `{document}` option exists for. The controller
now comes from the target's own view, behind one shared seam rather than seven copies.

The original report named three components; the code had seven.
