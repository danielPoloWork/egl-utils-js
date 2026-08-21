---
id: BUG-0004
title: A column keyed `__proto__` is filtered for real and reported by the view as no filter
status: fixed
severity: low
reporter: internal
discovered: 2026-08-21
affected-versions: v0.6.0
fixed-in: v1.2.0
---

# BUG-0004: A column keyed `__proto__` is filtered for real and reported by the view as no filter

## Summary

`tablePipeline` (spec 03 F42) accepts `setFilter('__proto__', 'a')` and applies it — the
filter is held in an internal `Map`, compiled, and used in the derivation, so the rows really
are filtered. But `view()` builds its `filters` read model by **assignment**:

```js
const activeFilters = {};
for (const [key, { filter }] of filters) activeFilters[key] = filter;
```

Assigning to `__proto__` on an ordinary object goes through the setter `Object.prototype`
defines for it, which either sets the prototype or (for a string value) does nothing at all.
Either way no own property is created, so the key never appears in `Object.keys(view().filters)`
and the read model reports **no filter on that column** while the rows are filtered.

## Impact

Small, and worth stating plainly: `__proto__` is an exotic column key, and no application is
likely to have one. What makes the record worth keeping is the shape of the failure rather
than its reach — **the read model disagreed with the derivation**, which is the one thing
F42's single-owner design exists to make impossible, and it disagreed silently.

The consequence became concrete with roadmap 19.2, whose `bindTableHistory` serializes
`view().filters` into the URL: a `__proto__` filter would have been applied to the table and
absent from the address bar, so the URL would have described a different table than the one on
screen, and restoring it would have shown different rows.

Every consumer of `view().filters` had the same exposure — `bindTableControls`'s reflection
and `bsTable`'s controls band among them.

## Reproduction

```js
import { tablePipeline } from 'egl-utils-js/table';

const table = tablePipeline({ source: [{ '__proto__x': 1 }] });
table.setFilter('__proto__', 'a');

Object.keys(table.view().filters);                       // []      — expected ['__proto__']
Object.hasOwn(table.view().filters, '__proto__');        // false   — expected true
Object.getPrototypeOf(table.view().filters);             // mutated by the assignment
```

Found by the F92 round-trip property suite added in roadmap 19.2
(`table-url.property.test.js`), whose filter-key generator produces delimiter-hostile and
otherwise awkward strings on purpose. `__proto__` was not a key anyone chose to test; it was a
key the generator reached. The suite failed on the *new* code first — the parser had the same
assignment — and the pipeline's own version of the defect was found while fixing it.

## Cause

`obj[key] = value` is a `Set`, which consults the prototype chain and finds
`Object.prototype`'s `__proto__` accessor. Object literals with computed keys,
`Object.defineProperty` and `Object.fromEntries` all use `DefineOwnProperty` instead and are
unaffected. The internal `Map` was never affected, which is exactly why the derivation stayed
correct while the read model did not.

## Resolution (roadmap 19.2, [ADR-0063](../../../adr/0063-the-url-is-the-state-and-the-page-goes-last.md))

Both halves fixed in the PR that found it:

- `table.js` builds the view's `filters` through `Object.fromEntries`, so every key the
  pipeline accepts is a key the view reports. Costs 8 B on the `{tablePipeline}` size row,
  which is re-pinned rather than squeezed (the row had 11 B of headroom).
- `table-url.js`'s `tableStateFromParams` collects filter pairs and defines them the same way,
  so `?filter.__proto__=x` becomes a filter rather than being silently dropped.

Regression tests live where each defect does: one in `table-pipeline.test.js` asserting the
key is reported *and* that the map's prototype is untouched, and the property suite that found
it, which now generates the key on every run.

**Not treated as a security issue, deliberately.** The assignment could set a prototype, which
is the shape of a prototype-pollution bug, but the only values reaching it are filter
expressions — strings and functions — and assigning a string to `__proto__` is a no-op. There
is no path here by which a caller reaches `Object.prototype`. The defect is a read model that
lied, and it is recorded as one.
