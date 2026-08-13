---
'egl-utils-js': minor
---

**Breaking:** `/sanitize` looks DOMPurify up instead of importing it (ROADMAP 17.6, ADR-0055).

`sanitizeHtml` resolves the peer as `options.dompurify`, then `globalThis.DOMPurify`, and
throws `PeerMissingError` (`EGL_PEER_MISSING`, `.peer === 'dompurify'`) when neither is
reachable. The entry therefore carries **no bare specifier** and loads on a plain HTML page
with no bundler and no import map — where the previous `import createDOMPurify from 'dompurify'`
died at module load, before any typed error of ours could speak (spec 05 F82).

Bundler consumers must now supply the module. One option per call, or one binding:

```js
import DOMPurify from 'dompurify';
const clean = (html) => sanitizeHtml(html, { dompurify: DOMPurify });
```

This is ADR-0041's contract verbatim, so the library has **one** peer mechanism rather than
two. ADR-0041 had argued the opposite for this entry, and its reasoning was sound — a static
import is right for an entry that exists only to use its peer — but the premise was an npm
consumer with a bundler, and ADR-0046 made the bundler-free page a first-class consumer. No
`exports` condition can hand a static import to one and a lookup to the other, so the choice
was exclusive and had to be made before 1.0 froze it.

The cost, stated rather than buried: a missing peer used to fail the **build** and now fails at
the first sanitize call. What does not change is that the failure is loud and typed — absence
never degrades to a pass-through of unsanitized HTML, and a mis-wired module (neither factory
nor bound sanitizer) is a `TypeError` naming the shape rather than a silent no-op sanitizer.
