---
'egl-utils-js': minor
---

New `egl-utils-js/table` entry (ROADMAP 9.3, spec 02 F33-F35, ADR-0021/ADR-0022):
`compileFilter`, `comparator`, and `paginate` — the query primitives behind a data table,
pure and Node-safe so they run server-side too.

`compileFilter` interprets a small grammar — substring, `=x`, `!=x`, `^prefix`, `suffix$`,
`>n` `>=n` `<n` `<=n`, and the nesting `=null`/`=empty`/`=blank` sentinels with their
negations — and is **total**: every string compiles, including a half-typed one, so a
filter box can compile on every keystroke without a `try`/`catch`. **No `RegExp` is ever
constructed from user input**; evaluation is linear with no backtracking, and expressions
past 1024 characters match literally. Applications extend the grammar through
`options.operators` rather than forking it.

`comparator` returns a genuine total order in every mode: missing values are pinned to one
end *regardless of direction*, mixed types order by type before value (so sorting stays
transitive on real-world columns), text collates through `Intl.Collator` with
`numeric: true`, and locale is opt-in for numeric reading so results never depend on the
machine's regional settings. `paginate` clamps an out-of-range page instead of failing.

The root entry is untouched.
