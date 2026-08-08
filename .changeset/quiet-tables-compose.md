---
'egl-utils-js': minor
---

`bsTable` joins `egl-utils-js/bootstrap` (ROADMAP 15.1, spec 04 F66, ADR-0039): a complete
Bootstrap 5 table over the F42 pipeline, which it keeps public as `.pipeline` — so filtering
and sorting compose, commands re-render, and an application that already holds a pipeline
(a server-derived first page, one shared with another view) passes it in and keeps it. Cells
escape by default with the markup decision made per column, row activation is one delegated
listener that also answers the keyboard, and a cell value the library would have to guess at
throws instead.
