---
'egl-utils-js': minor
---

**Accessibility primitives on `egl-utils-js/dom`** (ROADMAP 20.5, spec 07 F109–F110,
[ADR-0070](docs/adr/0070-two-primitives-extracted-and-a-ceiling-recomputed.md)).

Three exports: **`focusTrap`**, **`saveFocus`** and **`liveRegion`**.

```js
import { focusTrap, liveRegion } from 'egl-utils-js/dom';

const release = focusTrap(dialog); // Tab stays inside; focus goes back on release
release();

const announcer = liveRegion();
announcer.announce(`Column moved to position ${index + 1} of ${total}`);
```

**The trap is scoped to Tab, deliberately.** It corrects the two cases the platform gets wrong
— the edge the key is about to leave through, and focus sitting outside the region — and leaves
everything in between to the browser's own tab order. There is no document-level `focusin`
guard: fighting focus moved by a screen reader's virtual cursor is how a trap becomes something
a user cannot escape.

A root with **nothing focusable holds focus itself** under a temporary `tabindex="-1"`, removed
on release — the case that otherwise turns a trap into a lock. What counts as tabbable is
decided **without reading layout**, because a forced layout per Tab press is not a price a
keyboard user should pay.

`saveFocus()` is the restore half on its own, for a component that moves focus without trapping
it — and `loadingOverlay` now calls it instead of keeping its own copy, so there is one
implementation of "put focus back where it was" in the library.

`liveRegion` **never moves focus**, which is what lets a keyboard handler say what it did.
Announcing the same message twice really announces it twice. It closes a gap ADR-0069 named: a
column moved by the keyboard was announced to nobody.
