---
'egl-utils-js': minor
---

`tablePipeline` on the `egl-utils-js/table` entry (ROADMAP 13.1, spec 03 F42, ADR-0034):
one owner of the row set derives one memoized view through a fixed
`filters → search → sort → paginate` order, so filtering and sorting compose rather than
discarding each other. Commands are transactions emitting exactly one `'change'` carrying
that view, `batch()` makes several commands one, and the observer surface delegates to an
internal `EventEmitter` with `emit` kept private. The pipeline is pure and DOM-free, so it
derives unchanged on a server; the query primitives stay individually importable at their
unchanged 1714 B.
