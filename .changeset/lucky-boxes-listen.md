---
'egl-utils-js': minor
---

`bsTable` grows its controls (ROADMAP 15.2, spec 04 F67, ADR-0040): a per-column filter
row, a search box, a page-size select and an F65 pagination bar, all driving the table's
pipeline through its public commands via F51 `bindTableControls` — debounced, `aria-sort`
reflected, torn down in one pass, and exposed as `table.controls`. Every human-readable
string is injectable, and the defaults render digits rather than a language.

`tablePipeline` gains `operators`, the F33 custom-token vocabulary, applied to every
filter string it compiles — a column filter and the global search alike. Until now only
`locale` was forwarded to `compileFilter`, so a project's own operators were unreachable
from any string filter, whether typed into a box or set from code.
