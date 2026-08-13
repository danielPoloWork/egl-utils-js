---
'egl-utils-js': minor
---

**Breaking:** descriptor shapes reject a key they do not know (ROADMAP 17.13, ADR-0056).

ADR-0047 made an unknown key in an *options bag* a `TypeError` and left caller-supplied
**descriptor** shapes for this item. Fourteen now follow the same rule, with a message naming
where the key sat — `bsTable: unknown options.columns[0] property 'sortible'`:

- `bsTable` columns and the `controls` sub-configs (`filterRow`, `search`, `pageSize`)
- `bsListGroup` items and their nested `badge`; `bsBreadcrumb` items
- `bsAccordion`, `bsTabs`, `bsCarousel` items; `bsNavbar` items **and submenu children**
- `bsCard`'s `image`; `bsPagination`/`bsCarousel` `labels`; a custom `bsIcon` `set`
- `tablePipeline` columns (`/table`) and `bindTableControls` bindings, including its nested
  `sortHeaders` and `pagination` (`/dom`)

**Rows are never checked, and neither are maps keyed by your own names.** Descriptors are
configuration you wrote; rows are records that arrive from elsewhere and legitimately carry
keys this library does not model. `bindings.filters`, `classes`, `icons`, `operators` and
`bootstrap` are untouched.

The per-item cost was measured before adopting, because "cheap × N" is an argument rather than
a conclusion: **0.18 µs per descriptor** — ~13× the cost of *reading* one, and **0.34%** of a
500-item `bsListGroup` build. Rendering dominates by three orders of magnitude.

One related fix: `bsTable` now hands `tablePipeline` only the F42 fields (`type`, `compare`,
`getValue`, `searchable`, `filterable`) rather than spreading the whole column, which is what
its own documentation always claimed.
