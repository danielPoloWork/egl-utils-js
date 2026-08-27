---
'egl-utils-js': minor
---

**The submit lifecycle, and a server's errors on the fields** (ROADMAP 21.4, spec 08 F122–F123,
[ADR-0080](docs/adr/0080-a-guard-that-is-the-promise-and-findings-from-outside-the-engine.md)).

One new export — `bindSubmit` on `egl-utils-js/forms` — plus `applyFindings` on the validator
instance. No new `exports`-map path.

```js
import { createForm, createValidator, bindFormFeedback, bindSubmit } from 'egl-utils-js/forms';

const form = createForm(root);
const validator = createValidator(form, { rules });
const feedback = bindFormFeedback(validator, { classes: BOOTSTRAP_FEEDBACK_CLASSES });

bindSubmit(validator, {
  feedback,
  disable: ['[type=submit]'],
  handler: ({ form, signal }) => api.put(`/hosts/${id}`, form.toJSON(), { signal }),
});
// The form's own submit button now runs all of it.
```

**The double-submit guard is structural.** A second `submit()` while one is in flight returns
*the same promise* — not a refusal, not a second request. `submit()` is therefore deliberately not
an `async` method, and the test asserts promise identity rather than an invocation count: a
boolean `busy` flag checked at the top of an `async` function is the same bug with more code,
because the check and the set are separated by an `await`.

**A blocked submit is an answer; a failed one is a failure.** Validation finding an `error`
resolves with `{status: 'blocked'}`. The handler rejecting rejects `submit()` with **your own
error object**, `HttpError` `status` and `body` intact — ADR-0071's "a dismissal is an answer"
applied one subsystem over.

**Disable-and-restore gives back exactly what it took**, including a control the page had already
disabled itself, and `aria-busy` is restored to the value it had rather than removed.

**A server's errors land on the fields, and the payload is untrusted.** An injected `mapError`
turns a rejection into findings; the default understands `{errors: {field: message}}` (a string or
an array) plus a top-level `message`. This is the library's first untrusted-payload path onto the
DOM, so:

- a field name is **matched** against the fields your form resolved, never used as a selector — a
  name like `input[name=email]` selects nothing;
- a name that matches **no** control becomes a form-level finding carrying `field`, because
  silently discarding a server's complaint is how a user is told "something went wrong" with no
  idea what;
- every message reaches the DOM as **text**, through the F121 renderer that has no
  `{html, sanitize}` opt-in — which is why 21.3 left it out;
- the default mapper builds its field map through `Object.fromEntries`, so
  `{errors: {__proto__: …}}` cannot reach `Object.prototype`.

`docs/security/threat-model.md` carries the boundary and its STRIDE pass, in this same PR.

**A server error is pushed through `setCustomValidity` too**, so `checkValidity()` agrees with the
engine and a rejected field cannot be `.is-invalid` and `:valid` at the same time. Proved on real
engines, because jsdom's constraint validation is a simulation.

**`createValidator` gains `applyFindings({fields, form})`** for findings the engine did not
compute — a server, a websocket, a cross-form check. They sit in their own slots, mark their
fields validated, and are cleared when the field is validated again, because a complaint about a
value stops being true the moment the value changes. `Finding.source` gains `'external'`.

**`on('settle')` carries every outcome**, which is how the intercepted path hears about the
failure no field can show — a 500 with no body maps to no findings. `intercept` defaults to `true`
for a `<form>` root and `false` for any other container.

**Additive only.** 138 exports become 139 across the same twelve entries. `/forms` reaches
6 959 B and `bindSubmit` alone measures 1 911 B — 27% of the entry, composing neither the
validator it gates on nor the renderer it reports through, because both are injected.
