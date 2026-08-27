---
'egl-utils-js': minor
---

**A validation engine on `egl-utils-js/forms`** (ROADMAP 21.2, spec 08 F116–F119,
[ADR-0078](docs/adr/0078-latest-wins-per-rule-a-level-that-is-not-a-block-and-an-order-that-is-the-contract.md)).

One new export, `createValidator`, and no new `exports`-map path. It **takes** a form rather
than being one, so a caller who needs values and no validation links none of it.

```js
import { createForm, createValidator } from 'egl-utils-js/forms';

const form = createForm(root);
const validator = createValidator(form, {
  validateOn: ['blur'],
  rules: {
    name: (value) => (String(value).trim() === '' ? 'A name is required' : undefined),
    // Async, abortable, latest-wins: typing produces overlapping asks.
    handle: async (value, view, signal) => {
      const { free } = await api.get(`/handles/${value}`, { signal });
      return free ? undefined : 'That handle is taken';
    },
    // Cross-field: re-run when `start` is validated too.
    end: {
      dependsOn: ['start'],
      validate: (value, view) => (value < view.values.start ? 'End precedes start' : undefined),
    },
    // A level, not a block.
    password: (value) =>
      String(value).length < 12 ? { message: 'Consider a longer one', severity: 'warning' } : null,
  },
});

const { valid, fields, form: formFindings, validated } = await validator.validate();
```

**Only `error` blocks.** `warning` and `info` are reported and never gate a submit. And
because `valid` is `true` before anything has run, the result also carries `validated` — the
fields that actually ran — so "passed" and "not asked yet" stay distinguishable.

**Latest-wins is keyed per rule, not per run.** A `dependsOn` rule means validating one field
writes *another* field's findings, so two runs could otherwise collide on the same field. Each
rule owns at most one in-flight execution, the loser is aborted, and staleness is checked by
identity — because an `AbortSignal` stops a `fetch` but cannot un-resolve a promise that
already settled. The published result is *derived* from per-rule slots, so a half-finished run
can never publish a half-written field.

**A rule that throws fails closed** with the original error as `cause`: "could not decide" is
not "fine", and treating a network blip as a pass lets the value through. **A rule that
returns nonsense throws** instead — that is a programming error, and the two live on opposite
sides of the same `try`.

**The platform is read, not re-declared.** `required` and `type="email"` stay in the markup,
where a no-JavaScript submit still honours them, and their failures arrive as findings in the
same shape as everything else — carrying the `ValidityState` flag that failed, so you can
substitute your own wording without parsing a message (or pass `nativeMessage`). A field's own
error is pushed back through `setCustomValidity`, so a real `checkValidity()` and a real submit
agree with the engine. A native failure short-circuits that field's own rules: asking a server
about a value the browser calls empty is noise the user waits for.

Triggers are opt-in — `validateOn: ['change', 'blur']`, with an optional `debounceMs`. `blur`
is observed as `focusout`, the bubbling half of the same moment.

**Additive only.** No existing export, option, error code or `exports` path changed: the
surface goes from 135 exports to 136 across the same twelve entries. `/forms` grows to 3 747 B
and gains the per-function row that proves the family split — `createForm` alone is 1 840 B,
49% of the entry.
