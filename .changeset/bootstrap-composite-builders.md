---
'egl-utils-js': minor
---

Composite builders on `egl-utils-js/bootstrap` (ROADMAP 14.2, spec 04 F61–F65, ADR-0038):
`bsCard`, `bsListGroup`, `bsBreadcrumb`, `bsAlert` and `bsPagination`.

Two of them compose rather than reimplement. `bsAlert` **is** the `inlineAlert` engine
(F49) wearing Bootstrap's class map — same instance API, same per-instance timers, same
escaping rule — and `bsPagination.update()` accepts the shape `tablePipeline.view()`
already returns, so wiring a pager to a table is one subscription and no adapter. A fix to
either engine therefore reaches both entries at once.

Content slots now also accept an array of strings and nodes, rendered in order through one
`DocumentFragment`, which is what lets a card slot hold text and a badge together.

Two fixes ride along. `inlineAlert` no longer hides its close control when the icon is
empty: a design system that draws the glyph in CSS (`.btn-close`) supplies an empty icon,
and hiding the button for that left a dismissible alert nobody could dismiss. And the
entry's frozen constant maps are annotated `/* @__PURE__ */`, so unused ones are dropped by
the bundler — importing a single icon preset fell from 358 B to 43 B, and every element
builder from the previous release is now smaller.
