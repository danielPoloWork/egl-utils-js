---
'egl-utils-js': minor
---

The package declares its **CDN default**: the `unpkg` and `jsdelivr` fields point at the
global artifact, so the bare package URL serves something a classic `<script src>` can run
(ROADMAP 18.3, spec 05 F84, ADR-0060).

```html
<script src="https://cdn.jsdelivr.net/npm/egl-utils-js@1.1.0"></script>
<script src="https://unpkg.com/egl-utils-js@1.1.0"></script>
```

Both resolve to `dist/global/egl-utils.global.js`. Pin the version: entries share
content-hashed chunks, so mixing versions on one page double-loads shared code.

The deep `dist/esm/<entry>.js` paths remain the module-consumer route and are unchanged. So
is everything else a bundler sees: the `exports` map is byte-for-byte identical, and no
`main`, `module` or `browser` field was added — a packaging gate now asserts their absence,
because `browser` in particular would silently redirect bundler consumers onto the
single-file artifact.

That same gate reads the **packed tarball's own file list** and asserts every advertised
path is in it — both CDN fields, all 41 exports-map targets, and the artifact's sourcemap.
`files` and the fields that name files are set independently, and nothing else in the
toolchain compares them.
