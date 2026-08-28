---
'egl-utils-js': minor
---

**A table can hide a column, and say so** (ROADMAP 23.2, spec 09 F128–F129,
[ADR-0085](docs/adr/0085-visibility-is-rendering-and-the-clause-moved-again.md)). No new export:
two column properties, five instance members, one `controls` key and one `bindTableHistory` option.

```js
const table = bsTable(host, {
  columns: [
    { key: 'host', label: 'Host', hideable: false }, // the user cannot lose this one
    { key: 'ip', label: 'Address' },
    { key: 'notes', label: 'Notes', visible: false }, // available, not shown
  ],
  data: rows,
  controls: { columns: true }, // a checkbox per column, in the header band
});

table.hideColumn('ip');
table.getHiddenColumns(); // → ['ip', 'notes']
```

**Hiding a column keeps everything else.** Sort, filter, search, the F99 width and the F100
position all survive being hidden and come back intact — because the F42 derivation is **never told
which columns a viewer can see**. That is also why hiding the column a table is sorted by does not
clear the sort: there is no code path that could have.

**The cell is removed, not styled away.** `display: none` would leave a hidden column in the
accessibility tree's column count and in every `querySelectorAll` you write. The `<th>`, the `<col>`
and the filter cell are detached and kept, so showing the column re-inserts the very nodes carrying
its resize grip and its move handle.

**The chooser refuses an empty table rather than letting you reach one.** `hideColumn` throws for
the last visible column, and the chooser `disabled`s that checkbox so a user never meets the
refusal. `hideable: false` withholds the control from your user and not from you — exactly as
`movable: false` still takes a position from `setColumnOrder`.

**Visibility travels in the URL**, so a shared link shows the columns its sender was looking at:

```js
bindTableHistory(table.pipeline, { visibility: table });
// ?hidden=ip&hidden=notes
```

The **hidden** set is what is serialized, not the visible one, so a table showing everything still
has a clean URL — and adding a column to your code never silently hides it for someone holding an
old link. `tableStateFromParams` now returns one extra field, `hidden`, which is the only
before/after difference in the whole public surface.

**Budgets.** `/bootstrap` reaches 26 120 B (+1 218 B) under an **amended 26.75 kB clause** — the
second amendment in two items, both for capabilities on components that already exist — and
`bsTable` 14 775 B, of which 285 B is the F110 live region it composes rather than re-implements.
`/table` +68 B, `/dom` +200 B; no new chunk and no new request on any documented no-bundler route.
141 exports across twelve entries, unchanged.
