---
'egl-utils-js': minor
---

The package ships a **global single-file artifact**: `dist/global/egl-utils.global.js`, a
minified IIFE with a sourcemap, loadable by a classic `<script src>` — no modules, no
bundler, no npm (ROADMAP 18.2, spec 05 F83, ADR-0059).

It reads as the single global `egl`: the root entry's exports at the top level, and each
subpath as a sub-namespace named after its exports path.

```html
<script src="https://unpkg.com/egl-utils-js@1.0.0/dist/global/egl-utils.global.js"></script>
<script>
  const rows = egl.table.paginate(data, { page: 1, pageSize: 20 });
  document.body.append(egl.bootstrap.bsBadge(`${rows.total} results`));
</script>
```

The whole public surface is there and nothing is renamed — asserted against the built file
by a new packaging gate rather than promised, along with `egl.VERSION` matching
`package.json`, no second global being defined, and no optional peer being bundled. Peers
stay external and are resolved at use exactly as on the ESM path, so a page that already
loads Bootstrap or DOMPurify keeps the copy it has.

Nothing changes for a bundler consumer: the `exports` map, `sideEffects: false` and the zero
runtime dependencies are untouched, and re-bundling produces the same graph as before.

The artifact measures **31 444 B** (min+brotli, the metric every size row in this project
uses), gated at 33.6 kB — 25% under the sum of the ten individual entries, which is the
deduplication a single file buys.
