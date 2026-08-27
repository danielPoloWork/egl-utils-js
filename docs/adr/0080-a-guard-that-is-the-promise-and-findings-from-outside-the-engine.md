# ADR-0080: A guard that is the promise, a rejection that keeps its name, and findings from outside the engine

- **Status:** Accepted
- **Date:** 2026-08-27
- **Deciders:** Daniel Polo
- **Related:** [spec 08](../specs/08_spec_form_engine.md) §2 F122-F123, §3 NFR-39/NFR-41/NFR-42,
  §5, ROADMAP 21.4; [ADR-0025](0025-resource-repository-over-an-injected-client.md) (the injected
  transport this keeps injected), [ADR-0047](0047-an-unknown-option-key-is-a-typeerror.md) (the
  unknown-key contract, applied here to a *mapper's output* as well as to an options bag),
  [ADR-0049](0049-commands-throw-queries-answer.md) (command/query after `destroy()`),
  [ADR-0071](0071-a-manager-not-three-globals-and-a-dismissal-is-an-answer.md) (a dismissal is
  an answer — the precedent that decides what resolves and what rejects),
  [ADR-0077](0077-a-subject-entry-a-primitive-that-stayed-one-and-a-family-not-a-god-object.md)
  (the family this is the fourth member of),
  [ADR-0078](0078-latest-wins-per-rule-a-level-that-is-not-a-block-and-an-order-that-is-the-contract.md)
  (the findings it writes into, and the "a rule that returns nonsense throws" boundary it
  reuses), [ADR-0079](0079-a-costume-that-is-only-a-constant-and-a-node-where-the-css-can-see-it.md)
  (the renderer it reports through, and the reason that renderer has no `{html, sanitize}` pair)

## Context

F122 asks for one call that validates, refuses on `error`, marks the form busy, disables what
the caller nominated and restores exactly that, awaits the caller's handler, and reports the
outcome — with the double-submit guard **structural**. F123 then adds the part that makes this
item a security item: an injected mapper turns a server's rejection into field findings, which
is the **first untrusted-payload path onto the DOM** in this library (NFR-42). Until now every
string a component rendered came from the caller.

Four questions have to be answered before any of that can be written, and none of them is
answered by the requirement text.

**What resolves and what rejects?** Spec 08 §5 fixes half of it — "a form that fails validation
is not an error" — and points at F102's precedent for the other half. Left unresolved, the two
natural implementations differ in exactly the way that matters: one where every failure is a
value the caller inspects, and one where a failed submission behaves like every other failed
promise in the library.

**Where do findings that the engine did not compute live?** The validator owns findings, derives
its result from per-rule slots, and publishes to whatever is subscribed — the renderer included
(ADR-0078/0079). A server's complaint about `email` has to end up under the `email` control, and
there are two places it could be stored: in the submitter, which would then need its own
renderer, or in the validator, which would need a way in that 21.2 never gave it.

**What happens to a field name the server sent that this form does not have?** Dropping it is
how a user gets told "something went wrong" with no idea what. Using it to find a node is how a
server-controlled string reaches `querySelector`.

**Who hears about a failure when nobody called `submit()`?** The natural integration for a
`<form>` is to intercept its own `submit` event, and an intercepted call has no caller to reject
to.

## Decision

**1. A blocked submit resolves; a failed one rejects with the original error.** `submit()`
resolves with a frozen `{status, validation, handlerResult?}` for `'blocked'` and `'succeeded'`,
and **rejects with whatever the handler rejected with** — unwrapped, so an `HttpError` arrives
with its `status` and `body` intact. This is ADR-0071's rule applied one subsystem over: a
dismissal is an answer, and a validation that said no is an answer too; a rejection means the
submission was attempted and *failed*, which is a different fact and stays distinguishable
without a `try/catch` around the ordinary case.

**2. The guard is the promise, not a flag.** A second `submit()` while one is in flight returns
**the same promise object**. `submit()` is therefore deliberately not an `async` method — an
`async` wrapper would hand each caller a different promise around one submission, and the
guarantee callers can actually build on is identity. A boolean `busy` checked at the top of an
`async` function is the same bug with more code, because the check and the set are separated by
an `await`.

**3. Findings from outside the engine go into the engine.** `createValidator` gains
`applyFindings({fields, form})` — additive, and general on purpose: a server, a websocket, a
cross-form check. They live in their own slots beside the rule slots, so a run never overwrites
an answer it did not compute (ADR-0078's structure, reused rather than re-argued), and they are
**cleared when the field they belong to is validated again**, because a complaint about a value
stops being true the moment the value changes. Form-level ones clear on a full `validate()` and
not on a `validateField`.

Their `source` is **`'external'`, not `'server'`**. The path F123 exists for is a server, but the
method is not server-specific, and ADR-0048's rule is one word one meaning: naming the slot after
its commonest occupant would make a cross-tab finding claim to have come from an HTTP response.

They are also pushed through `setCustomValidity` — `pushCustomValidity` now takes any
non-`native` blocking finding. A field the server rejected is a field this engine calls invalid,
so `checkValidity()` must agree (F119), and without the push a control would be `.is-invalid`
and `:valid` at the same time, styled red and green by two rules of the same stylesheet. The
browser suite asserts the `:invalid` half on real engines, because jsdom's constraint validation
is a simulation.

**4. A server field name is matched, never resolved — and never dropped.** The mapper's field
names are tested with `Object.hasOwn` against the field set `createForm` already resolved. A
name that matches nothing becomes a **form-level finding carrying `field`**: the name travels as
data, so nothing is lost and nothing is spliced into the message, because rewriting a server's
wording is not this library's call (NFR-21). The default mapper builds its field map through
`Object.fromEntries` rather than `map[name] = …`, so `{errors: {__proto__: …}}` reaches a data
property instead of `Object.prototype` — BUG-0004's lesson, and this time the input is untrusted
rather than a caller's own column key.

**5. `intercept` follows the markup, and `requestSubmit` is not called.** It defaults to `true`
for a `<form>` root and `false` for any other container, because a `<div>` has no submit event
to intercept; asking for `true` on one is a `TypeError` that says so. NFR-40 anticipated
`HTMLFormElement.requestSubmit` for this wave, and it turns out not to be needed: intercepting
`submit` *is* the integration, and a caller who wants a button outside the form to trigger it
calls `requestSubmit()` themselves, in their own code and against their own floor. The inventory
therefore gains no entry — recorded here so the absence is a decision rather than an oversight.

**6. An intercepted failure is published, not thrown into the console.** The listener consumes
the rejection of the call it made, and every outcome — `blocked`, `succeeded`, `failed` — is
published to `on('settle')`. That is the channel for the half no field can show: a 500 with no
body maps to no findings, and the application still has to be able to say something.

## Alternatives Considered

| Option | Why not |
|---|---|
| **`submit()` always resolves with `{status: 'failed', failure}`** | Safer against an unhandled rejection, and wrong about what happened: a caller who ignores the outcome silently swallows a server failure, which is the defect ADR-0028 removed everywhere else in this library. It also makes `error` a property name next to a `severity: 'error'` findings vocabulary — ADR-0048's exact prohibition. |
| **`submit()` rejects on a blocked validation too** | Symmetrical and unusable: the commonest path through a form is "the user has not filled it in yet", and a library that throws on it turns every submit into a `try/catch` whose `catch` block cannot tell a network failure from an empty field. |
| **The submitter keeps its own findings and renders them** | A second store and a second renderer for one concept, drifting from the first the moment either is fixed — and the F121 renderer, already subscribed to the validator, would show a form with no server errors on it. |
| **`applyFindings` moves an unmatched name to form level itself** | Puts F123's policy inside 21.2, where a *caller's* typo in a field name would then be silently relocated instead of refused. The validator is loud about a name it does not have (ADR-0047); deciding what to do with an untrusted one is the submitter's job. |
| **A `busy` boolean flag plus a public `pending` setter** | The guard the engine exists to own, handed back to the caller. |
| **`mapError: false` to opt out of mapping** | A second type for one option. The default maps only the shapes it recognises, so an unrecognised body already maps to nothing; a caller who wants none passes `() => ({})`. |
| **Disabling the submit button by default** | Guessing which control is the caller's, and disabling something the page may be managing itself. `disable` is nominated, resolved per submission, and restored to exactly what it was — including a control the page had already disabled. |

## Consequences

- **`/forms` reaches 6 959 B** (+1 471 B), and `bindSubmit` alone measures **1 911 B** — 27% of
  the entry, composing neither the validator it gates on nor the renderer it reports through,
  because both are injected. The NFR-22 derivation is recomputed a fourth consecutive time by
  spec 05's method: 69 095 B → **70 kB**, with the whole increase coming from this entry and no
  other entry moving by a byte.
- **The surface is additive**: 138 exports become 139 across the same twelve entries, plus one
  method on an existing instance. `Finding.source` gains `'external'` and `Finding` gains an
  optional `field` — a widened union in an output position, which is a minor addition under
  ADR-0003's classification, and the reason it is called out rather than assumed.
- **A mapper that returns nonsense throws**, and the `TypeError` replaces the rejection the
  caller would otherwise have seen. That is deliberate and it is ADR-0078's boundary: a mapper is
  the caller's own code, so a malformed finding is a programming error, not a message to show a
  user. The alternative — coercing it — would hide the bug behind text nobody can act on.
- **`destroy()` mid-flight aborts the handler's signal and restores the busy state
  immediately**, rather than waiting for a handler that may never settle. The restore is
  idempotent, so the `finally` that runs when it does settle changes nothing.
- **This is now the library's first untrusted-payload boundary**, and
  [`docs/security/threat-model.md`](../security/threat-model.md) carries its STRIDE pass in this
  same PR — the AGENTS.md §7 trigger, and NFR-42's explicit condition.

## References

- [spec 08](../specs/08_spec_form_engine.md) §2 F122-F123, §3 NFR-39/NFR-41/NFR-42, §5, §6
- [ADR-0071](0071-a-manager-not-three-globals-and-a-dismissal-is-an-answer.md) — the
  resolve/reject precedent
- [ADR-0077](0077-a-subject-entry-a-primitive-that-stayed-one-and-a-family-not-a-god-object.md),
  [ADR-0078](0078-latest-wins-per-rule-a-level-that-is-not-a-block-and-an-order-that-is-the-contract.md),
  [ADR-0079](0079-a-costume-that-is-only-a-constant-and-a-node-where-the-css-can-see-it.md) — the
  rest of the family
- [`docs/security/threat-model.md`](../security/threat-model.md) — the boundary and its STRIDE
  pass
- `src/main/javascript/it/d4np/utils/forms-submit.js`,
  `src/test/javascript/it/d4np/utils/forms-submit.test.js`,
  `src/test/browser/forms-submit.spec.js`
