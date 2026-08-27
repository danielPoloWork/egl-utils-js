# ADR-0078: Latest-wins per rule, a level that is not a block, and an order that is the contract

- **Status:** Accepted
- **Date:** 2026-08-26
- **Deciders:** Daniel Polo
- **Related:** [spec 08](../specs/08_spec_form_engine.md) §2 F116-F119, §3 NFR-39/NFR-40/NFR-41,
  §6; ROADMAP 21.2, [ADR-0077](0077-a-subject-entry-a-primitive-that-stayed-one-and-a-family-not-a-god-object.md)
  (the family shape this is the second member of),
  [ADR-0062](0062-a-sibling-not-a-wrapper.md) and the F88/F89 remote pipeline (the
  latest-request-wins discipline this borrows and sharpens),
  [ADR-0047](0047-an-unknown-option-key-is-a-typeerror.md) (the boundary between a programming
  error and an operational one), [ADR-0049](0049-commands-throw-queries-answer.md) (the
  lifecycle this instance obeys), [ADR-0017](0017-platform-api-floor-gate.md) (the inventory
  the constraint API joins)

## Context

F116-F119 describe a validation engine in four sentences, and every one of them hides a
decision that is only visible once code exists.

**A cross-field rule breaks the obvious concurrency model.** F118 says validating one field
re-runs "that field's rules and the cross-field rules that declared it". But a rule declared
on field `end` with `dependsOn: ['start']` produces a finding that belongs to **`end`** — so
validating `start` writes `end`'s findings. Key the in-flight work by *the field being
validated*, as the remote pipeline keys it by *the query*, and two concurrent runs (`start`
and `end`) can both write `end`. The natural unit is not the run.

**"Async, abortable, latest-wins" is three separate mechanisms.** `AbortSignal` stops a
`fetch`; it does not un-resolve a promise that already settled in a microtask. F89 learned
this for remote table data and the answer was an identity check at settle time. This wave
needs the same answer at a finer grain.

**The platform is already a validator, and it can be made to disagree with itself.**
`setCustomValidity(msg)` sets `validity.customError`, which makes `validity.valid` false. So
an engine that reads `validity` *after* having pushed its own message reads its own output
back as a native failure — a feedback loop that reports the same problem twice and never
clears. The order of two calls is therefore a load-bearing contract, not an implementation
detail.

**A rule can fail in two entirely different ways.** It can *throw* — the network is down, the
server 500'd — and it can *return nonsense*, a `{severity: 'fatal'}` its author invented.
ADR-0047 already drew the line those fall on either side of, and spec 08 §5 explicitly left
"whether an async rule that throws is a finding or a failure" to this ADR.

## Decision

**1. Latest-wins is keyed per rule, and findings are stored per rule.** Each normalised rule
carries an opaque identity; the engine holds one finding slot and at most one in-flight
execution per rule. A newer execution of a rule aborts the older, and the older cannot land
because the settle path compares identity — not `signal.aborted`, which a promise that already
resolved does not respect. **The published result is *derived* from the slots**, never mutated
in place, so a partially-completed run cannot publish a half-written field and two concurrent
runs cannot collide even when they touch the same field. Race-freedom is structural rather
than careful.

**2. A rule that throws fails closed; a rule that returns nonsense throws.** A thrown error
becomes an `error` finding carrying the original as `cause`: "could not decide" is not "fine",
and treating a network blip as a pass lets the value through. A malformed *return* is a
`TypeError` naming the rule, because that is a programming error and ADR-0047 wrote the
boundary down — `EGL_*` codes for what happens at runtime, platform errors for what the author
got wrong. The two paths are deliberately on opposite sides of the same `try`. A caller who
wants a transient failure ignored catches it inside their own rule, which is the honest escape
hatch.

**3. Only `error` blocks, and `valid` alone is not enough.** `warning` and `info` are reported
and never gate anything (F117). Because `valid` is `true` before any rule has run, the result
also carries **`validated`** — the field names that actually ran — so "passed" and "not asked
yet" stay distinguishable. Without it every consumer would reinvent the same flag.

**4. A native failure short-circuits that field's own rules.** If the browser already says the
value is unusable — empty, malformed, out of range — asking a server whether the handle is
free is noise, and on a slow connection it is noise the user waits for. Rules owned by *other*
fields that merely depend on this one still run: their subject is a different value.

**5. The `setCustomValidity` order is the contract.** Per field, per run: clear the custom
message on every control, **then** read `validity`, **then** push the field's first blocking
`rule` finding back. Only a rule's finding is pushed — pushing a native message back would set
`customError` for a constraint the platform already reported, so the engine would agree with
itself in a second slot. `clear()` clears the push-back too, or a form reset would leave a
control refusing `checkValidity()` for a finding nobody can see.

**6. A form-level rule with no `dependsOn` runs only on `validate()`.** F116's own argument,
applied to itself: a rule that has not said when to re-run is not guessed at. The alternative
— re-running every form rule on every keystroke — is the cost `dependsOn` exists to avoid.

**7. `blur` is observed as `focusout`.** The two fire at the same moment and only one bubbles,
so `focusout` is the version a single listener on the form root can actually hear. The option
is still spelled `blur`, because that is the moment a caller means.

**8. `nativeMessage` is the injected-wording seam (NFR-21).** `validationMessage` is the
platform's own prose — localized, which is a real benefit, and generic, which is a real limit
(jsdom returns the same sentence for every constraint). The finding therefore also carries
`constraint`, the `ValidityState` flag that failed, so a caller can substitute wording without
parsing a message.

**9. An invalid state whose flag we do not recognise produces no finding.** Nine flags are
probed by name from a frozen list. A tenth — a future spec revision, an exotic host — yields
nothing rather than a finding with `constraint: undefined`. This is a **deliberately
unexercised** branch, and it is not the dead code the M2.4 rule tells us to delete: that rule
is for guards that provably cannot fire, and this one exists precisely for the case we cannot
enumerate.

**10. Four constraint-validation members join the api-floor inventory** (`validity`,
`validationMessage`, `setCustomValidity`, `ValidityState`), each Safari 5 and none present in
Node — guarded by the same contract the whole entry rests on: it takes an `Element`, so a host
with no DOM never reaches the code. NFR-22's ceiling is re-derived again — 65 768 B → 66 kB —
**with no new entry in it**, which is the case the "whenever any input moves" rule exists for.

## Alternatives Considered

- **Per-run tokens, as the remote pipeline uses.** The obvious port, and wrong here for a
  reason the table does not have: one run can write several fields, so the unit of "latest"
  has to be the thing that produces a finding, not the thing that asked for it. Rejected on
  the concrete collision in §Context.
- **`signal.aborted` as the staleness check.** Simpler to read, and silently wrong: an abort
  cannot un-resolve a promise that already settled. This is F89's lesson and it is repeated
  here because the shape invites the mistake every time.
- **A rule that throws is treated as a pass.** Friendlier, and it lets bad data through on a
  network blip — the failure mode being that the thing you could not check is exactly the
  thing you were worried about. Rejected as failing open.
- **A rule that throws rejects `validate()`.** Honest for an explicit call and unusable for an
  automatic one: an on-change trigger has no caller to reject to, so every transient failure
  would become an unhandled rejection.
- **A boolean result and DOM side effects.** What most form libraries do. Rejected: 21.3 owns
  the DOM, and a caller may want findings for a summary, a log or a server round-trip. The
  result is a value; nothing here touches a class name.
- **Re-declaring `required` and `type="email"` as JavaScript rules.** Tempting, because then
  there is one mechanism. Rejected: the markup version keeps working with JavaScript off, and
  duplicating it is how the two layers come to disagree — which F119 exists to prevent.
- **Calling `reportValidity()` for the caller.** Rejected: it shows the browser's bubble, which
  is a presentation decision, and 21.3 is where presentation is decided. The engine makes the
  bubble *correct*; whether it is shown is not its business.
- **Listening for the `invalid` event instead of reading `validity`.** Rejected: `checkValidity()`
  fires it, so reading through the event means causing side effects to take a measurement, and
  a caller's own `invalid` handler would see events this engine manufactured.
- **A non-zero default `debounceMs`.** Rejected: a default quiet period is invisible latency
  the caller did not ask for. It defaults to 0 and the documentation says plainly that a
  `change` trigger with async rules probably wants one.

## Consequences

- **The surface goes from 135 to 136 exports** across the same twelve entries — `createValidator`
  alone. Purely additive (NFR-37).
- `/forms` grows from 1 840 B to **3 747 B**, and it now has a per-function row worth having:
  `createForm` alone measures **1 840 B — 49% of the entry**. That number is the ADR-0077
  family split proved rather than asserted: a filter form links the binder and not the engine.
- The deep-ESM route for `/forms` grows 2 372 B on **the same six requests** — the rules, the
  races and the constraint seam all landed inside files that route already downloaded whole.
  The one direction the F87 table ever moves cheaply.
- **Every rule is abortable, including on teardown.** `destroy()` and `clear()` both abort
  in-flight executions, so a validator torn down mid-request stops asking.
- Findings are frozen data with a stable shape (`message`, `severity`, `source`, optional
  `constraint` and `cause`), which is what 21.3 renders and 21.4 merges server errors into.
  Adding a field to it later is a minor; changing `severity`'s meaning would be a major.
- **Known limitation:** the engine reads values through `form.getValues()`, so a rule sees the
  coercions ADR-0077 fixed — an empty number is `null`, not `''`. That is the intended
  consistency and it will surprise anyone expecting raw strings; it is stated in the rule
  signature's documentation.
- Branch coverage on the new module is 98.91% rather than 100%, and the two uncovered branches
  are §Decision 9's deliberate forward-compatibility guards. Recorded here so the next person
  does not "fix" it by mock-covering them.

## References

- Spec 08 §2 F116-F119, §6 (the counting and race tests this ADR's decisions are asserted by).
- `src/main/javascript/it/d4np/utils/forms-validate.js`.
- `src/test/browser/forms-validate.spec.js` — F119 on real engines, where
  `validationMessage` is prose rather than jsdom's single placeholder sentence.
- ADR-0047 (the programming-error boundary), ADR-0049 (the lifecycle), ADR-0077 (the family).
