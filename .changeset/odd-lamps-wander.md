---
'egl-utils-js': minor
---

`injectFragment`, `autoGrow` and `withUrlParams` on `egl-utils-js/dom`, completing
Milestone 11 (ROADMAP 11.3, spec 03 F46–F48, ADR-0030).

`injectFragment`'s **`sanitize` option is required and has no default** — pass a sanitizer
(typically `sanitizeHtml`) or the literal `false` to declare the source trusted. Both
candidate defaults were wrong: sanitizing by default would drag the DOMPurify optional peer
into every `/dom` import, and not sanitizing by default would make the dangerous choice the
quiet one. Now the decision is explicit at the call site, and `sanitize: false` is a greppable
claim rather than an absence. Errors propagate — a non-2xx rejects with `HttpError` carrying
status and body — so a shell assembled from several fragments can be told apart from a partial
one, and `'beforeend'`/`'afterbegin'` use `insertAdjacentHTML` so existing nodes and their
listeners survive.

`autoGrow` releases the inline height before measuring, which is what lets a textarea shrink
as well as grow, reads layout through an injectable `measure` seam, and restores the original
inline styles on detach. `withUrlParams` builds through `URLSearchParams` over a hand-split
URL, so a second `?` is impossible and relative URLs work — including during a server render.
