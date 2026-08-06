---
'egl-utils-js': minor
---

New `egl-utils-js/text` entry (ROADMAP 9.1, spec 02 F26-F38, ADR-0019): `truncate`,
`wrapText`, and `fixedWidth`. Pure string shaping measured in UTF-16 code units, with a
guarantee no helper ever emits a lone surrogate — `fixedWidth` returns exactly the
requested width for any input, `truncate` counts its marker inside the budget and is
idempotent, and `wrapText` collapses whitespace runs while preserving paragraph breaks.
The root entry is untouched, so consumers who never import `/text` pay nothing.
