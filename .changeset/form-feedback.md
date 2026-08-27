---
'egl-utils-js': minor
---

**Findings rendered into the form** (ROADMAP 21.3, spec 08 F120–F121,
[ADR-0079](docs/adr/0079-a-costume-that-is-only-a-constant-and-a-node-where-the-css-can-see-it.md)).

Two new exports: `bindFormFeedback` on `egl-utils-js/forms` and
`BOOTSTRAP_FEEDBACK_CLASSES` on `egl-utils-js/bootstrap`. No new `exports`-map path.

```js
import { createForm, createValidator, bindFormFeedback } from 'egl-utils-js/forms';
import { BOOTSTRAP_FEEDBACK_CLASSES } from 'egl-utils-js/bootstrap';

const validator = createValidator(createForm(root), { rules, validateOn: ['blur'] });
const feedback = bindFormFeedback(validator, { classes: BOOTSTRAP_FEEDBACK_CLASSES });

// On a blocked submit: take the user to the problem, and say how much is wrong.
if (!(await validator.validate()).valid) feedback.report();
```

**Design-system-neutral, exactly as `inlineAlert` is.** Every class name is injected. With no
map you still get correct structure, correct text and correct ARIA — `aria-invalid`, and an
`aria-describedby` that adds its id without disturbing the tokens you already had — and no
styling, which is the honest default for a library that ships no CSS.

**The Bootstrap costume is frozen data, not a wrapper, and that is a measurement.** A
`bsFormFeedback` function on `/bootstrap` drags the whole renderer in behind its import and
puts that entry at 25 987 B — **987 B over** ADR-0041's 25 kB clause. The constant alone costs
137 B. So composition happens at the call site, the way `bootstrapIconsSet` already composes
into `bsIcon`.

**The feedback node goes immediately after the field's last control**, because Bootstrap shows
`.invalid-feedback` through a *sibling* combinator — a node anywhere else is styled correctly
and displayed never. The browser suite asserts `display: block` with the real stylesheet
loaded, on three engines, rather than checking a class attribute. Bring your own node with
`feedback: { field: '#id' }` and nothing is created.

**A warning renders as `form-text`.** Bootstrap has no vocabulary for a non-blocking finding,
and `.invalid-feedback` is hidden unless a sibling is `:invalid` — so a warning put there is a
message the user never sees.

**`report()` moves focus to the first field with an `error`** (skipping disabled controls) and
announces a summary through the F110 live region, created lazily so a form that never fails
adds no node. The default counts rather than recites — a screen-reader user just moved to the
first broken field wants to know how much is wrong, not to hear it all twice — and the wording
is injectable.

**There is no `{html, sanitize}` opt-in here, on purpose.** 21.4 routes a server's error body
into these same findings, so this is the path an untrusted string travels: messages reach the
DOM through `textContent`, and the safest opt-in is the one that does not exist.

`destroy()` leaves the markup as it found it — classes removed, ARIA removed, created nodes
deleted, your own nodes emptied but kept.

**Additive only.** The surface goes from 136 exports to 138 across the same twelve entries.
`/forms` reaches 5 488 B, and its per-function rows now tell the family story: `createForm`
alone is 1 893 B (34% of the entry) and `bindFormFeedback` alone is 2 464 B.
