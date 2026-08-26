---
'egl-utils-js': minor
---

**Form value binding on a new `egl-utils-js/forms` entry** (ROADMAP 21.1, spec 08 F112–F115,
[ADR-0077](docs/adr/0077-a-subject-entry-a-primitive-that-stayed-one-and-a-family-not-a-god-object.md)).

Two new exports — `createForm` on the new entry, `getValue` on `egl-utils-js/dom` — and a
twelfth `exports`-map path.

```js
import { createForm } from 'egl-utils-js/forms';

const form = createForm(document.querySelector('#host-form'));
form.setValues(await api.get(`/hosts/${id}`)); // no change events: a write is not an edit
form.setBaseline(); // this is now "clean"

form.getValues();
// { name: 'db-01', quantity: 7, subscribed: true, tier: 'pro', tags: ['a', 'c'] }

await api.put(`/hosts/${id}`, form.toJSON());
form.reset(); // back to what was loaded, not to the markup's attributes
```

`setValue` has written a native control correctly since v0.4.0 and nothing read one, so every
application wrote the same loop over `form.elements` and got the same four things wrong.
**The coercions are now contract**: one checkbox is `boolean` (never `undefined`, never
`'on'`), several sharing a name are a `string[]` of the checked values, a radio group of any
size answers which value is chosen or `null`, an empty `type="number"` is `null` (never `NaN`,
never `''`), an unselected `select` is `null` — distinguishable from an option whose value *is*
the empty string — and a file field is `File[]` and read-only.

**`reset()` is not `HTMLFormElement.reset()`.** The platform's restores the markup's `value`
attributes, so a record fetched into a form and edited resets to an empty form. Here the
baseline is what was loaded; `setBaseline()` adopts a new one after a save.

**A key that names no field throws.** `setValues({ emial: 'x' })` is a `TypeError` naming
`emial` rather than a silent no-op — ADR-0047's rule, extended from options bags to a data map.

**Two serializations over one field set.** `toJSON()` carries what the values *mean* and omits
file fields, which JSON cannot hold; `toFormData()` carries what the controls *hold*, in the
shape the browser would have submitted — so an empty number is `''` there and `null` in JSON,
because "present and empty" is a state a server can act on.

The single-control read is a `/dom` primitive beside the `setValue` it completes, so a page
that wants one value pays **280 B** rather than the 1 840 B engine:

```js
import { getValue } from 'egl-utils-js/dom';
getValue(elements.quantity); // 7, or null when the box is empty
```

Why a new entry: `/bootstrap` has 505 B under ADR-0041's 25 kB clause, `/dom` is a bag of small
primitives kept small on purpose, and `/ui`'s charter is orchestrating *components* — which a
form engine needs none of. `/forms` is a **subject** entry, the shape `/table` and `/net`
already are. Validation, submission and dirty tracking will be factories that *take* a form
instance rather than more methods on it, so a filter form that needs values links none of them.

**Additive only.** No existing export, option, error code or `exports` path changed: the
surface goes from 133 exports across eleven entries to 135 across twelve. NFR-22's artifact
ceiling is re-derived to 64 kB by the same sum-of-entry-figures method (63 862 B), not raised.
