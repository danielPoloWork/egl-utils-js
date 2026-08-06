---
'egl-utils-js': minor
---

`inlineAlert` joins the `egl-utils-js/dom` entry (ROADMAP 12.1, spec 03 F49, ADR-0031): an
instance-based alert component that owns its nodes, its auto-hide timer and its close
binding, so two alerts on one page cannot cancel each other's timer or steal each other's
container. Class names and icons are injected maps over neutral, framework-free defaults;
messages render through `textContent` unless the caller passes the explicit
`{ html: true, sanitize }` pair; `destroy()` and an aborted `signal` each leave zero
listeners, timers, and nodes behind.
