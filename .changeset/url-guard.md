---
'egl-utils-js': minor
---

**A URL is not text** (ROADMAP 23.1, spec 09 F126–F127,
[ADR-0084](docs/adr/0084-a-url-is-not-text.md)). One new export — `safeUrl` on
`egl-utils-js/sanitize` — and a **behaviour change in seven builder call sites**, which is the point
of the item rather than a side effect.

```js
import { safeUrl } from 'egl-utils-js/sanitize';

safeUrl(record.homepage) ?? '#'; // the string, or null — you choose the fallback
```

**Escaping protected the wrong half.** Since F52 a record's *content* cannot become markup. A
record's **URL** is an instruction, not text, and no escape in this library ever touched it:
`javascript:fetch('/api/keys')…` in a data field became a live link with your page's authority.

**Parse, then decide.** The value is resolved with `new URL()` and its *protocol* looked up in an
allow-list — never matched as a string, because the URL grammar removes tabs and newlines inside a
scheme, strips leading control characters, lower-cases the scheme, and treats a percent-encoded
colon as an ordinary path character:

| Input | `startsWith('javascript:')` | `safeUrl` |
|---|---|---|
| `JaVaScRiPt:alert(1)` | passes | **null** |
| `java\tscript:alert(1)` | passes | **null** |
| `%6a%61%76%61script:x` | refused | **allowed** — a *path*, and the browser agrees |

The last row is why a blocklist cannot do this job: over-refusing a legitimate path is a bug too.

**It answers rather than throwing.** A refusal is `null`, so one hostile field in fifty records
cannot discard the other forty-nine. The default set is `http:`, `https:`, `mailto:`, `tel:` and
relative references; widen it per call with `protocols: ['app:']`. A property test asserts totality:
any input at all returns a string or `null` and never throws.

**Your builders already use it.** The card image, list-group item, breadcrumb link, navbar brand,
nav item, nav child and carousel image now route their data-driven URLs through the guard:

```js
bsListGroup([{ content: 'Ada', href: 'javascript:alert(1)' }]);
// → the item renders with its label, WITHOUT an href, and carries data-egl-refused-url
```

A refused URL leaves the attribute **unset** rather than empty (an `href=""` is a link to the
current page), keeps the element and its label, and marks it so you can find it. The two image
builders allow `data:`/`blob:` themselves — inert in an `<img>`, a script in an `href` — and any
builder's set widens through the shared `protocols` option beside `{html, sanitize}`.

**If you render a URL scheme outside the default four** — an `app:` deep link, an `ms-excel:`
handler — pass `protocols` and it works as before. Everything else that stops rendering was a link
this library should never have written.

`docs/security/threat-model.md` carries the boundary and its STRIDE pass, in this same PR.

**Budgets.** `/sanitize` reaches 1 738 B (+247 B) and `safeUrl` alone 651 B; `/bootstrap` reaches
24 902 B under an **amended 25.5 kB clause** — the honest single-function routing measured 3 B over
the old one. F87 priced the guard's new shared chunk at one extra request on three deep-ESM routes.
141 exports across twelve entries.
