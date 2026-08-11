# ADR-0049: Commands throw, queries answer — the instance contract

- **Status:** Accepted
- **Date:** 2026-08-10
- **Deciders:** Daniel Polo
- **Related:** ROADMAP 17.9, filed by the
  [v1.0.0 readiness review](../releases/v1.0.0-readiness-review.md) §2.5, §2.6 and §3.1;
  [ADR-0048](0048-one-word-one-meaning.md) (the vocabulary this completes — `show()` is a
  visibility verb, so it returns nothing),
  [ADR-0047](0047-an-unknown-option-key-is-a-typeerror.md) (why the renames fail loudly, and
  the `EGL_*`-versus-`TypeError` boundary reused here),
  [ADR-0003](0003-error-taxonomy-stable-codes.md) (the code registry this deliberately does
  not grow), [ADR-0031](0031-component-instances-and-the-alert-budget.md) (components are
  instances that own their state — the shape this generalises),
  [ADR-0032](0032-overlay-gate-refcount-floor-and-focus.md) (the F50 gate's
  presentation/timing split, and why it is the one instance with no `element`),
  [ADR-0038](0038-composites-compose-and-what-a-frozen-constant-costs.md) (`bsAlert` as the
  F49 engine in a costume — the composition whose diagnostics leaked),
  [ADR-0042](0042-ids-are-the-accessibility-and-a-ceiling-derived-not-guessed.md) (the shared
  lifecycle helper the guard now runs through); spec 03 F49/F50 and spec 04
  F69/F70/F71/F80/F81 amended here

## Context

Fifteen distinct instance shapes back 110 exports, written one milestone at a time. The 17.1
review read them side by side and found three things a 1.0 would freeze.

**`show()` returned three different types.** `void` from the behaviour wrappers, the modal,
the popper overlays and the alerts; an `Element` from `bsToast` (each call builds a fresh
node); a **release closure** from `loadingOverlay` (a reference-counted gate). Each is right
locally, and `const x = thing.show()` is the same expression in all three.

**Use-after-`destroy()` was convention, not contract.** Probed across every shape: four
instances threw and named the method, `bsProgress.setValue()` silently wrote to a detached
node, `bsToast.hide()` and `inlineAlert.hide()` silently did nothing, and
`loadingOverlay.wrap()` proceeded. Worse, the throwing ones threw **three different
sentences** — `this wrapper has been destroyed`, `this manager has been destroyed`, and the
method-naming form — and the shared lifecycle helper named its own internal chokepoint
(`instance()`) rather than the `show()` the caller had actually invoked.

**The member matrix was patchy.** `destroy()` on 15/15 — the contract that mattered was
uniform — but `element` on 12/15, `on()` on 7/15, `instance()` on 5/15, and `isShown()` on
2/15, **absent from `bsModal`**, the component a caller is most likely to ask.

And one wrinkle the review called small and 17.8 handed on: `bsAlert(...)` reported failures
under the name `inlineAlert`, a function the caller never invoked.

## Decision

### 1. Command–query separation, stated as the lifecycle rule

- **A command throws after `destroy()`**, with one sentence:
  `TypeError: <api>: <method>() was called after destroy()`. One shared helper
  (`assertAlive`) replaces three message shapes and twenty hand-written throws, and the
  chokepoints (`behaviourWrapper.instance`, `bsAccordion.at`, `bsCarousel.instance`) now take
  the *caller's* method name so the message names the call that was too late.
- **A query answers.** `isShown()` on a destroyed instance is `false`. That is true, not
  merely convenient: throwing would make a caller guard a question that has an answer.
- **`destroy()` is idempotent.** It is the one method cleanup code calls without knowing the
  state.
- **A data property is not a command.** `element`, `items`, `triggers`, `pipeline`, `table`
  stay readable after teardown; a detached node is exactly what someone inspecting a
  torn-down component wants.

Fixed accordingly: `bsProgress.setValue`, `bsToast.hide`, `inlineAlert.hide` (and so
`bsAlert.hide`), and `loadingOverlay.wrap` now refuse a destroyed instance.

### 2. `show()` returns nothing — the other two are renamed for what they do

| Was | Is | Because |
|---|---|---|
| `loadingOverlay(...).show(): () => void` | **`acquire()`** | it takes a reference and hands back a lease; `hide()` does not even exist on the gate |
| `bsToast(...).show(msg, opts): Element` | **`add(msg, opts)`** | it *creates* a toast in a stack and returns the node |

Everything named `show`/`hide`/`toggle` now returns `void`, everywhere, permanently. This is
ADR-0048's rule applied to return types: a name means one thing.

### 3. The member matrix, as rules rather than as an inventory

- **`element` on every instance that owns or is bound to a node** — added to `bsToast` (its
  container), `inlineAlert`/`bsAlert` (their container; the alert's own nodes are built lazily
  on first `show`), and `bsLoadingOverlay` (the modal it builds or is given).
  **`loadingOverlay` is exempt and stays exempt**: the gate owns *when* an overlay is visible
  and nothing about *what* is (ADR-0032). There is no node to hand back, and inventing one
  would be a lie. The exemption is asserted in the suite so it reads as a decision.
- **Anything with `show()`/`hide()` owes `isShown()`** — added to `bsModal`,
  `bsTooltip`/`bsPopover`, `inlineAlert`/`bsAlert` and `bsToast` (is any toast up?).
- **A wrapper over exactly one Bootstrap component exposes `instance()`; a manager or
  composite exposes its parts instead.** No change: `bsAccordion` has `items`, `bsTabs` has
  `triggers`, `bsNavbar` has `collapse`/`dropdowns`, and `bsToast` has the node `add()`
  returns. This rule is why the 5/15 was never the defect the count suggested.
- **Anything that emits or forwards events owes `on()`** — added to `bsToast`, subscribed on
  the container, since Bootstrap's toast events bubble and one listener therefore sees every
  toast the manager will ever build. That closes the review's §3.1 gap: previously the only
  way to observe a toast was to capture each returned node.

### 4. A state violation stays a `TypeError`

No new `EGL_*` code. ADR-0047 wrote the boundary — codes for what can happen at runtime,
platform errors for what the programmer got wrong — and using a destroyed component is the
latter, like the ~280 other argument violations in this library. ADR-0003's registry
therefore freezes at ten codes.

The counter-argument is real and recorded: a late callback can reach a component the caller
destroyed through an aborted `signal`, and a code would let that be caught and ignored
without string-matching. Two reasons it does not win here. The idiomatic guard already exists
— the same `signal` that destroyed the component cancels the work that would call it — and
**adding a code later is a MINOR**, so the door stays open if a real case appears. Freezing
one now, for a scenario nobody has hit, would be the harder decision to reverse.

### 5. A composing entry owns the name in its diagnostics

`inlineAlert` and `loadingOverlay` take the reported API name as a **third, internal
parameter**, so `bsAlert` and `bsLoadingOverlay` name themselves. Every message in both
engines routes through it — not just the lifecycle ones, since
`bsAlert(host, { autoHideMs: -1 })` was equally capable of blaming `inlineAlert`.

The cost is honest and stated: a positional parameter on a public function, documented as
internal rather than hidden. The alternative — an option key — would have made it *public*
API under ADR-0047's strict-key rule, which is worse.

### 6. The 17.8 loose end: one document rule for container-taking managers

`bsToast` accepted a `document` override; `bsPagination` and `bsTable` rejected it as an
unknown key. Since ADR-0047 that asymmetry is a live papercut rather than a curiosity — the
same option works on one manager and throws on its sibling. **`document` added to both**,
resolved through the existing `documentOf` helper: the container's own document by default,
the override when named. `bsToast`'s code comment claiming it "matches every other
container-taking manager" is now true.

## Alternatives Considered

- **Keep three `show()` return types and document them.** Rejected: that is the state the
  review flagged, and each is individually documented already.
- **Make `bsToast.show()` and `loadingOverlay.show()` return `void`** instead of renaming
  them. Rejected: it deletes capability. The toast node is the only handle to one toast, and
  the gate's release closure *is* its refcount contract — without it, callers would need a
  `hide()` that can be called more times than `show()` was, which is precisely how refcounts
  drift.
- **`isShown()` throws too, for one uniform "everything refuses" rule.** Rejected: simpler to
  state, worse to use, and untrue — a destroyed component is genuinely not shown.
- **An `EGL_COMPONENT_DESTROYED` code.** See §4: rejected now, additive later.
- **Give `loadingOverlay` an `element` for uniformity's sake**, e.g. the focus root. Rejected:
  the gate has no presentation by design, and a property that returns something adjacent is
  worse than one that is absent for a stated reason.
- **An options key for the reported API name** instead of a positional parameter. Rejected:
  ADR-0047 makes every accepted key public surface, so an internal detail would have been
  frozen as API.

## Consequences

- **Breaking:** two method renames (`loadingOverlay.show`→`acquire`, `bsToast.show`→`add`) and
  four commands that used to be silent after `destroy()` now throw. Both renames fail loudly
  (`overlay.show is not a function`), and the four throws replace silence, so nothing degrades
  quietly in either direction.
- **Additive:** `element` on four more shapes, `isShown()` on five, `on()` on `bsToast`,
  `document` on `bsPagination` and `bsTable`.
- One sentence for one condition across all fifteen shapes, and a shared guard means the
  sixteenth inherits it.
- `instance-contract.test.js` sweeps every shape for all three rules plus the `element`
  promise and its one documented exemption, so a future component that forgets the guard fails
  the build instead of shipping the hole.
- Spec 03 F49/F50 and spec 04 F69/F70/F71/F80/F81 are amended in this PR.
- What this does **not** settle: whether `bsToast` should also expose per-toast instances
  rather than raw nodes. It is additive, nobody has asked, and 1.x can answer it.

## References

- [v1.0.0 readiness review](../releases/v1.0.0-readiness-review.md) §2.5, §2.6, §3.1.
- `src/main/javascript/it/d4np/utils/lifecycle.js` — the rule, and the guard.
- `src/test/javascript/it/d4np/utils/instance-contract.test.js` — the sweep.
