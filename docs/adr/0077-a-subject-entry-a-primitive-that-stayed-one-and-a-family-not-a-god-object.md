# ADR-0077: A subject entry, a primitive that stayed one, and a family rather than a god object

- **Status:** Accepted
- **Date:** 2026-08-26
- **Deciders:** Daniel Polo
- **Related:** [spec 08](../specs/08_spec_form_engine.md) §2 F112-F115, §3 NFR-37/NFR-39/NFR-41/NFR-43,
  §4 and §5 (which deferred the entry name and the composition shape to this ADR),
  ROADMAP 21.1, [ADR-0025](0025-resource-repository-over-an-injected-client.md) (injection
  over import — the composition rule this reuses),
  [ADR-0041](0041-a-peer-looked-up-not-imported.md) (the 25 kB `/bootstrap` clause that
  constrains where anything Bootstrap-flavoured can land),
  [ADR-0047](0047-an-unknown-option-key-is-a-typeerror.md) (the unknown-key rule, extended
  here to a data map), [ADR-0048](0048-one-word-one-meaning.md) and
  [ADR-0049](0049-commands-throw-queries-answer.md) (the naming and lifecycle contracts a new
  surface inherits), [ADR-0070](0070-two-primitives-extracted-and-a-ceiling-recomputed.md)
  (the F109 precedent for extracting a primitive rather than burying it),
  [ADR-0071](0071-a-manager-not-three-globals-and-a-dismissal-is-an-answer.md) (the `/ui`
  entry decision this one is measured against)

## Context

Spec 08 fixed the observable contract for the form engine and deliberately left three
things to the implementing item, because each interacts with the others and none is derivable
from the requirement text: **where the engine lives**, **whether F113's read half is a `/dom`
primitive**, and **whether the wave is one instance or a family**.

The measured constraints, taken from the build at v1.3.0 before a line was written:

| Candidate home | Measured | Why it is or is not the answer |
|---|---:|---|
| `/bootstrap` | 24 495 B against ADR-0041's **25 kB** clause | 505 B free, and the clause was sized *for the finished catalogue*. Nothing of this wave fits. |
| `/dom` | 7 882 B | A bag of small primitives, kept small on purpose (spec 07 §4 put the a11y primitives here so nobody would import a component catalogue to announce a message). Binding, validation, submission and dirty tracking is a subsystem, not a primitive. |
| `/ui` | 9 537 B | The right *role* — orchestration — and the wrong *charter*: `/ui` exists for symbols that "would still make sense with a different component library underneath", and a form engine needs no component library at all. |

A fourth force is the shape of the wave itself. F112-F125 span four capabilities that a real
application uses together and that a real application also uses **separately**: a filter form
needs values and neither validation nor submission. NFR-02's shakeability claim is a gate in
this repository, not an aspiration, so "how the pieces compose" is a size question as much as
a design one.

## Decision

**1. A twelfth entry, `egl-utils-js/forms`, and it is a *subject* entry.** Not a layer entry.
The house already has both shapes and the subject shape is the older one: `/table` holds pure
query primitives, a pipeline, a remote pipeline, URL state and CSV — everything about one
subject at every level, behind one import — and `/net` and `/text` are the same idea smaller.
`/forms` is that: everything about forms, and the reason a consumer reaches for it is the
subject rather than the layer. The name is now frozen, an `exports`-map path being
MAJOR-protected from the moment it ships.

**2. `getValue` is a `/dom` primitive, beside the `setValue` it completes.** Not a private
helper inside the engine. This is ADR-0070's lesson applied a second time: the focus trap sat
inside the F50 overlay for two waves, correct and unreachable, and the fix was to extract it.
A read that knows what an empty `type="number"` means is exactly as reusable as the write
that knows how to select an option, and burying it would have guaranteed the next person
wrote a fourth copy of the same four bugs. Measured cost of the split: **280 B** for a page
that wants to read one control, against **1 840 B** for the entry that would otherwise have
been the only way to get it.

Reading needs a *policy* in a way writing does not — is an empty number `''`, `0`, `NaN` or
`null`? — so the policy is the function's documented contract rather than an option: boolean
for checkbox and radio, `null` for an unselected `select` and for an empty number, `string[]`
for `select[multiple]`, `File[]` for a file input, the `value` string otherwise. **One
policy, in one place, shared by the engine**, which is the whole reason this is not two
implementations.

**3. A family composed by injection, not one instance that does everything.** `createForm`
owns **values only** — read, write, serialize, baseline, reset. Validation (21.2), submission
(21.4) and dirty tracking (21.5) will be separate factories that **take a form instance**, the
way `bindTableControls` takes a pipeline, `bindTableHistory` takes a pipeline and
`createResource` takes a client (ADR-0025). A filter form imports `createForm` and ships
1 840 B; it never links a validation engine it does not call.

**4. A field is not a control, and HTML already says what its shape is.** One checkbox is a
`boolean`; several sharing a name are a `string[]` of the checked values; a radio group of any
size — including one — answers *which* value is chosen or `null`. A repeated name on anything
else is an array, one entry per control. No per-field configuration decides this, because the
markup already has.

**5. Two serializations, and the difference between them is stated rather than papered over.**
`getValues()` and `toJSON()` carry what the values **mean** — an empty number is `null`.
`toFormData()` carries what the controls **hold**, in the shape the browser would have
submitted: that same field is the empty string, because *present and empty* is a state a
server can distinguish from *absent* and `FormData` is the serialization that can say it.
`toJSON()` omits file fields entirely: a `File` has no JSON representation, and emitting its
name would describe content the body cannot carry.

**6. The 1.0 contracts are honoured explicitly, not by inheritance.** `setValues` rejects a
key naming no field with a `TypeError` naming it — ADR-0047 extended from options bags to a
data map, on the same argument: `setValues({ emial })` silently doing nothing is the defect
that ADR removed. Commands (`setValues`, `setBaseline`, `reset`) throw after `destroy()` with
ADR-0049's standard sentence; queries (`getValues`, `toJSON`, `toFormData`, `baseline`)
answer; `element` and `fields` stay readable; `destroy()` is idempotent.

**7. `reset()` is the baseline, and the baseline is what was loaded.** Not
`HTMLFormElement.reset()`, which restores the markup's `value` attributes — a record fetched
into a form and edited resets, natively, to an empty form. `baseline()` reads the snapshot,
`setBaseline()` adopts a new one after a successful save, `reset()` restores it: the
query/command pair named the way `getValues`/`setValues` are (ADR-0048). A file field is
skipped by `reset()` rather than throwing, because throwing would make `reset()` unusable on
any form with an upload in it.

**8. NFR-22's artifact ceiling is re-derived, not raised.** The twelfth entry gives the
sum-of-measured-entry-figures method a twelfth input: **63 862 B**, so the clause becomes
64 kB and the size-limit row moves to 46.4 kB (measured 45 514 B + 2.0%). Spec 08 NFR-43
required the recomputation rather than a bigger number, and the derivation is redone whenever
any input moves.

## Alternatives Considered

- **`new FormData(form)` and be done.** The obvious answer, and it fails four ways at once: it
  needs a real `<form>`, every value is a string (so "unchecked" is *absent* rather than
  `false`, and a number is text), it cannot write, and it cannot express a baseline. It is a
  serializer, not a binder — which is why `toFormData()` matches its output rather than
  replacing it.
- **The engine on `/dom`.** Tempting: `getValue`/`setValue` live there and the engine needs no
  component library. Rejected on what the wave becomes, not on what 21.1 is — validation,
  submission and dirty tracking would take that entry from 7 882 B to something several times
  larger, and spec 07 §4 kept it small deliberately so a page announcing a message pays for a
  live region rather than a subsystem.
- **The engine on `/ui`.** Rejected by `/ui`'s own charter: the test for that entry is whether
  a symbol would still make sense with a different component library underneath, and a form
  engine makes sense with *none*. Putting it there would have made the charter decorative
  after exactly one wave.
- **One instance that binds, validates and submits.** What an application wants, and what
  makes a filter form pay for a validation engine it never calls. Rejected on NFR-02, and the
  injection alternative is not a compromise — it is the pattern this repository already uses
  for the same problem in `/table`.
- **A per-field `kind` option** (`{ tags: 'set', flag: 'boolean' }`) to disambiguate the
  one-checkbox case. Rejected: it is a configuration layer for a question the markup answers,
  and every caller would have to restate what the DOM already knows. The known consequence is
  accepted instead and written down — a checkbox group that grows from one member to two
  changes the shape of its value, which is true of `new FormData(form)` as well.
- **`toJSON()` emitting a file's name.** Rejected as a lie that reads as data: the body cannot
  carry the file, and a filename in a JSON payload invites a server to believe it received
  one.
- **Synthesising `change` on `setValues`.** Rejected for F45's own reason, restated in the
  form context: a programmatic write is not a user edit, and dispatching would re-enter the
  handler that asked for the write. Validation after a `setValues` is an explicit call, which
  is what F118's incremental validation wants anyway.
- **A strict length match for a repeated name.** Rejected in favour of totality: a shorter
  array clears the controls it does not reach, so the field ends up describing the value it
  was given rather than a mixture of that and whatever was there before. A non-array for a
  multi-control field is still a `TypeError`.

## Consequences

- **The surface goes from 133 to 135 exports across twelve entries** — `createForm` on the new
  entry and `getValue` on `/dom`. Purely additive (NFR-37): nothing existing changed name,
  signature, code or path.
- **A twelfth entry costs the deep-ESM routes real requests**, and F87's accounting is where
  that stays visible rather than silent: `/dom` and `/bootstrap` each gained **two** files and
  `/ui` one, from a chunk re-split neither of those entries caused. `/bootstrap` simultaneously
  *gained* 32 B of headroom on its bundled row. One change, two consumers, opposite directions
  — which is the clearest argument on record for keeping both instruments.
- **21.2 through 21.5 have a fixed attachment point**, and the shape of their factories is
  settled before they are written: each takes the form instance.
- The `getValue` policy is now public API. Changing what an empty number reads as would be a
  **major**, which is the correct price for a rule this many callers will depend on.
- **Known limitation:** the one-checkbox rule is shape-per-markup, so a group's value type
  changes if the markup drops to a single member. It is stated in the module documentation and
  in `createForm`'s own JSDoc rather than left to be discovered.
- A file field cannot be written, so `setValues` on one throws and `reset()` skips it. Both are
  the platform's constraint surfaced rather than this library's choice, and both are tested.

## References

- Spec 08 §2 F112-F115 (the contract), §4 (the deferral this ADR answers), §6 (the property
  test that proves the round trip).
- `src/main/javascript/it/d4np/utils/forms-values.js`, `forms.js`, and `getValue` in
  `dom-events.js`.
- ADR-0070 — the F109 extraction this reuses as an argument.
- `.size-limit.json` and `tools/transfer-budgets.js` — the measured figures quoted above.
