---
'egl-utils-js': minor
---

**A toast manager on `egl-utils-js/ui`** (ROADMAP 20.2, spec 07 F104–F105,
[ADR-0072](docs/adr/0072-a-queue-a-rule-nobody-has-to-guess-and-one-toast-per-story.md)).

One new export, `createToasts`, and no new `exports`-map path.

```js
import { createToasts } from 'egl-utils-js/ui';

const toasts = createToasts({ placement: 'bottom-end', maxVisible: 3 });

toasts.add('Saved.');
for (const row of rows) toasts.add(`${row.name} imported`); // 40 arrivals, 3 on screen
```

`bsToast` gives a page toasts; this gives it a **policy**. A cap with a queue promoted in
arrival order, and two admission rules with the vagueness taken out of them: adding again with
an **id** the manager still holds updates that toast rather than joining it with a second, and
an **identical** message is dropped rather than shown twice — where identical means the same
`variant`, `title` and `message`, and only when the message and title are both strings. Node
content is exempt rather than compared by a rule that could never fire; a dropped duplicate
restarts the lifetime of the toast already up, so a repeated event still reads as recent; and an
explicit `id` leaves the dedupe system entirely, because an id is an assertion of distinct
identity.

**One operation, one toast.** `promise()` shows the pending message with no auto-hide — an
operation of unknown duration has no honest timer — and replaces it in place on settlement, with
`success` and `error` allowed to be functions of the value and the reason. It returns **your own
promise**, unchanged: the settlement passes through and an unhandled rejection stays yours to
handle rather than being absorbed by the observer.

Every node is still built, timed, escaped, announced, dismissed and disposed by `bsToast`. This
manager contributes the queue, the rules and the transition, and nothing that draws.

**Additive only.** No existing export, option, error code or `exports` path changed: the surface
goes from 127 exports to 128 across the same eleven entries.
