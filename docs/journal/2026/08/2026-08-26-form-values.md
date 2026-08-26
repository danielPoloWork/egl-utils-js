# 2026-08-26 — A subject entry, and the primitive that stayed one (21.1)

## What got done

- **`egl-utils-js/forms`**, a twelfth entry, with `createForm` — spec 08 F112–F115: field
  discovery or declaration, `getValues`/`setValues`, `toJSON`/`toFormData`, and a baseline that
  is what was *loaded*.
- **`getValue` on `egl-utils-js/dom`**, beside the `setValue` it completes.
- **[ADR-0077](../../adr/0077-a-subject-entry-a-primitive-that-stayed-one-and-a-family-not-a-god-object.md)**
  settling the three things spec 08 deferred, plus the full wiring a new entry needs: exports
  map, tsup, typedoc, the global artifact and its gate, the api floor (`FormData`), both
  no-bundler fixtures, size budgets and the F87 transfer table.
- 30 example tests and 5 property suites; **3 114 tests at 100% lines**.

## The three deferred decisions, and how they went

**Where the engine lives.** Measured before writing anything: `/bootstrap` has 505 B under
ADR-0041's 25 kB clause, which was sized *for the finished catalogue*. `/dom` is 7 882 B of
small primitives, kept small on purpose — spec 07 put the a11y primitives there so nobody
imports a component catalogue to announce a message, and binding + validation + submission +
dirty tracking is a subsystem, not a primitive. `/ui` has the right *role* and the wrong
*charter*: its test is whether a symbol would still make sense with a different component
library underneath, and a form engine needs **none**.

So a twelfth entry — and the useful part of the decision is what *kind*. `/forms` is a
**subject** entry, not a layer entry, and the house already has that shape: `/table` holds pure
query primitives, a pipeline, a remote pipeline, URL state and CSV, because the reason a
consumer reaches for it is the subject.

**Whether the read half stays a primitive.** Yes, and this is ADR-0070's lesson applied a
second time. The focus trap sat inside the F50 overlay for two waves — correct and unreachable
— and the fix was extraction. A read that knows what an empty `type="number"` means is exactly
as reusable as the write that knows how to select an option. Measured cost of the split:
**280 B** for a page that wants one control, against **1 840 B** for the entry that would
otherwise have been the only way to get it.

The insight that made it a clean call: **reading needs a policy where writing does not.** Is an
empty number `''`, `0`, `NaN` or `null`? So the policy is `getValue`'s documented contract
rather than an option — one policy, in one place, shared by the engine.

**One instance or a family.** The family, composed by injection. `createForm` owns values only;
21.2/21.4/21.5 will *take* a form instance, the way `bindTableControls` takes a pipeline and
`createResource` takes a client (ADR-0025). A filter form imports `createForm` and ships
1 840 B without linking a validation engine it never calls — which is NFR-02 as a number rather
than an intention.

## What the code had to decide that the spec did not

- **A field is not a control**, and HTML already says what its shape is: one checkbox is a
  `boolean`, several sharing a name are a `string[]`, a radio group of *any* size answers which
  value is chosen. A group of one is still a group — reading it as a boolean would change the
  field's shape the moment a second radio appeared in the markup. The known consequence (a
  checkbox group dropping to one member changes its value type) is written down rather than left
  to be discovered; the alternative, a per-field `kind` option, is a configuration layer for a
  question the markup answers.
- **Two serializations, and the difference stated rather than papered over.** `getValues`/
  `toJSON` carry what the values *mean* — an empty number is `null`. `toFormData` carries what
  the controls *hold*, in the shape the browser would have submitted: that field is `''` there,
  because *present and empty* is a state a server can distinguish from *absent*. My own test
  caught this: the first `toFormData` was built from `getValues()` and dropped the field
  entirely, which contradicted the comment I had already written above it.
- **`__proto__` as a field name.** Building the value object with `obj[name] =` would have set
  the prototype instead of a property — the trap BUG-0004 was, one wave earlier, in the table's
  filter map. Everything routes through a `Map` and `Object.fromEntries`, and there is a test.
- **A dead guard deleted rather than mock-covered.** `element.files ?? []` inside a branch that
  has already established `type === 'file'` cannot fire: every engine defines `files` there. The
  M2.4 precedent says delete it, so it is deleted, and coverage went to 100% honestly.

## What a twelfth entry cost, visibly

F87's accounting is where this stays measurable rather than folkloric. The chunk re-split gave
the deep-ESM routes for `/dom` and `/bootstrap` **two more requests each** and `/ui` one, for a
wave that added nothing to those entries — while `/bootstrap` simultaneously *gained* 32 B on
its bundled size-limit row, leaving 505 B under its clause. **One change, two consumers,
opposite directions.** That is the clearest argument on record for keeping both instruments.

NFR-22's artifact ceiling was re-derived rather than raised: the sum-of-measured-entry-figures
method now has a twelfth input and reads **63 862 B**, so the clause is 64 kB and the gate row
moves to 46.4 kB (measured 45 514 B + 2.0%).

## Where the project stands

v1.3.0 tagged and its Release drafted (publishing is the owner's). **M21: 21.1 done**,
21.2–21.5 open. One changeset queued. Specs 01–08; ADRs through 0077, next free 0078.

## How the next session resumes

1. Wait for this PR to merge (one item per PR).
2. **21.2**, the validation engine (spec 08 F116–F119). It attaches by *taking* the form
   instance — that shape is now fixed — and the hard part is not the rules: it is F118's
   latest-wins on async, which is the F88 discipline, and F119's `ValidityState` seam, where
   `setCustomValidity` is what keeps the native bubble and the engine from ever disagreeing.
3. `/forms` gets its first per-function size row when 21.2 puts a second export on the entry;
   today one would measure the same file as the entry row and gate nothing.
