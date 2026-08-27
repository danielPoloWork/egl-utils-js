---
'egl-utils-js': minor
---

**Dirty, touched, and an unsaved-changes guard** (ROADMAP 21.5, spec 08 F124–F125,
[ADR-0081](docs/adr/0081-two-questions-rather-than-one-boolean-and-a-guard-that-comes-and-goes.md)).
One new export — `trackChanges` on `egl-utils-js/forms`. No new `exports`-map path. **This closes
spec 08.**

```js
import { createForm, trackChanges } from 'egl-utils-js/forms';

const form = createForm(root);
const changes = trackChanges(form, { guard: true });

changes.on('change', ({ dirty }) => (saveButton.disabled = !dirty));
```

**Two questions, not one boolean.** *Dirty* is "differs from the baseline you loaded"; *touched* is
"the user has been in here" — per field and for the form. A field edited and then edited back is
**touched and clean**, and that is exactly why they are separate: an unsaved-changes guard wants
the first, and "do not show me an error for a field I have not filled in yet" wants the second.

**Dirty is derived on every read, never stored.** The baseline moves under this instance —
`setBaseline()` after a save, `reset()` back to it — so a cached flag would be one save away from
telling a user they have unsaved changes. A field the baseline does not mention is never dirty,
mirroring exactly what `reset()` does with it: nothing.

**`touch()` and `untouch()`** take one field or all of them — `touch()` on a blocked submit so
every error is allowed to show at once, `untouch()` after a save.

**The guard is opt-in and attached only while the form is dirty.** `beforeunload` is a
*window*-level registration and a live one costs the page its back/forward-cache eligibility in
every current engine, so it goes on when the form becomes dirty, comes off when it stops, and is
gone after `destroy()` — asserted as a leak test on an injected window, not inferred.

**The browser's dialog is not ours to word**, and several engines skip it entirely without prior
user interaction. So `confirmLeave()` covers the in-app route change `beforeunload` cannot see:

```js
const changes = trackChanges(form, {
  guard: true,
  confirm: ({ dirtyFields }) => dialogs.confirm(`Discard ${dirtyFields.length} change(s)?`),
});

router.beforeEach(async () => await changes.confirmLeave());
```

A clean form answers `true` and asks nothing. A dirty form with no `confirm` injected answers
`false` — nobody was asked, and that is not consent.

**One seam, and it is F115's.** `setValues` fires no events on purpose, so a programmatic write is
inaudible: the queries recompute and are never stale, while the `'change'` event and the guard
need `refresh()`. Synthesising an `input` event was the alternative, and F45 refused it for
reasons that have not changed.

**Additive only.** 139 exports become 140 across the same twelve entries. `/forms` reaches 7 844 B
and `trackChanges` alone measures 1 608 B — the smallest of the five siblings, and the only one
that reaches a window.
