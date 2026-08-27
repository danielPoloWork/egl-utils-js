# ADR-0079: A costume that is only a constant, and a node where the CSS can see it

- **Status:** Accepted
- **Date:** 2026-08-27
- **Deciders:** Daniel Polo
- **Related:** [spec 08](../specs/08_spec_form_engine.md) §2 F120-F121, §3 NFR-38/NFR-42/NFR-44,
  ROADMAP 21.3; [ADR-0031](0031-component-instances-and-the-alert-budget.md) (the injected
  class map this reuses), [ADR-0038](0038-composites-compose-and-what-a-frozen-constant-costs.md)
  (the "frozen constant plus a thin call" costume shape, half of which is measured away here),
  [ADR-0041](0041-a-peer-looked-up-not-imported.md) (the 25 kB `/bootstrap` clause that decided
  it), [ADR-0070](0070-two-primitives-extracted-and-a-ceiling-recomputed.md) (the F110 live
  region this composes), [ADR-0077](0077-a-subject-entry-a-primitive-that-stayed-one-and-a-family-not-a-god-object.md)
  and [ADR-0078](0078-latest-wins-per-rule-a-level-that-is-not-a-block-and-an-order-that-is-the-contract.md)
  (the family and the findings this renders)

## Context

F120 says the engine emits findings and a class map renders them, "the `bsAlert` shape
(ADR-0038), not a second implementation". ADR-0038's shape has two halves — **a frozen
constant** carrying the design system's names, and **a thin call** that applies it — and spec
08 NFR-38 attached a condition to the second half rather than assuming it: *measure before
choosing where the costume lands*, because `/bootstrap` had 505 B under ADR-0041's 25 kB
clause and the clause was sized for the finished catalogue.

Two further questions only appear once the renderer exists.

**Where does a feedback node go?** The obvious answers — append to the form, or put it wherever
the caller's markup has room — are both wrong for a reason that is invisible until a real
stylesheet is loaded: Bootstrap shows `.invalid-feedback` through a **sibling combinator**
(`.form-control:invalid ~ .invalid-feedback`). A node in the wrong place is styled correctly
and displayed never.

**What does a warning look like in a design system that has no word for one?** Bootstrap's
validation vocabulary is binary. `.invalid-feedback` is hidden unless a sibling is `:invalid`,
so a non-blocking finding rendered there is a message the user cannot see — the exact failure
F117 introduced severities to avoid.

## Decision

**1. The costume is the frozen constant, and only that.** `BOOTSTRAP_FEEDBACK_CLASSES` on
`/bootstrap`; composition happens at the call site, one spread wide:

```js
bindFormFeedback(validator, { classes: BOOTSTRAP_FEEDBACK_CLASSES });
```

This is NFR-38's measurement, taken rather than predicted:

| Shape | `/bootstrap` measures | Against the 25 kB clause |
|---|---:|---|
| a `bsFormFeedback` wrapper function | **25 987 B** | **987 B over** |
| the frozen constant alone | **24 632 B** | 368 B under |

A wrapper on that entry drags the whole renderer in behind it, because the import is what the
bundler follows. So ADR-0038's second half is dropped here, and the precedent it falls back to
is the older one on the same entry: `bootstrapIconsSet` is frozen data composed into `bsIcon`
through an option, and nobody has missed a `bsIconWithBootstrapSet`.

**2. The feedback node goes immediately after the field's last control.** Not appended, not
configurable-by-default — that is the position Bootstrap's sibling combinator requires, and it
is also where a screen reader following DOM order expects the explanation. A caller with their
own node passes it and this creates nothing. The browser suite asserts `display: block` with
the real stylesheet loaded, so the claim is about the rendered page rather than about the class
attribute.

**3. `controlValid` is deliberately empty in the Bootstrap map.** `was-validated` already
styles `:valid` controls, and — because F119 pushes every rule error back through
`setCustomValidity` — `:valid` already tracks this library's engine. Adding `is-valid` would
paint the same state twice and would paint it on controls the engine never looked at.

**4. A non-blocking finding is rendered as `form-text`.** Bootstrap's own class for
always-visible helper text under a control, which is exactly what a warning is. The
alternative was inventing a class this library does not ship the CSS for.

**5. A node is created only when there is something to put in it.** A field that passed and
never had a finding gets nothing; a field that *had* one keeps its node and is repainted, which
is how the `valid` slot reaches the field that was wrong a moment ago. An empty feedback element
under every clean control is markup nobody asked for.

**6. Text, and no `{html, sanitize}` opt-in at all.** Every other content-taking API in this
library offers the pair. This one does not, on purpose: 21.4 routes a **server's** error body
into these same findings (F123, NFR-42), so this is the path an untrusted string travels, and
the safest opt-in is the one that does not exist. A caller who needs rich content owns the node
and renders into it themselves.

**7. `report()` is the F121 verb, and it announces a count.** Focus moves to the first control
with an `error`, skipping disabled ones; the summary goes through the F110 live region, created
**lazily** so a form that is never reported on adds no node to the document. The default
announcement counts rather than recites: a screen-reader user who has just been moved to the
first broken field wants to know how much is wrong, and will hear each field's own message on
arrival. The wording is injectable (`summary`), as NFR-21 requires of every string this library
would otherwise choose.

**8. Teardown restores the markup.** Classes removed, ARIA removed, created nodes deleted,
caller-supplied nodes emptied but kept (ADR-0029's structural teardown). `classList.toggle` is
called only when it changes something, because toggling a class *off* on an element that never
had one still creates `class=""` — which is the difference between a test asserting
`innerHTML` round-trips and one that nearly does.

## Alternatives Considered

- **A `bsFormFeedback` wrapper on `/bootstrap`.** ADR-0038's shape, taken literally. Rejected
  by measurement: 987 B over the clause. Recorded as a table above rather than as a claim.
- **The wrapper on `/ui` instead**, which NFR-38 named as the fallback. Rejected because once
  the constant alone fits on `/bootstrap`, the wrapper buys the caller one spread and costs a
  cross-entry import and a second symbol to keep in step. The fallback existed for the case
  where the *constant* did not fit; it did.
- **The class map on `/forms`.** One import for the caller, and a Bootstrap vocabulary on the
  design-system-neutral entry — the layering `/forms` exists to keep. Rejected on the same
  grounds ADR-0077 used to put the engine there in the first place.
- **Rendering findings into one node with newline-separated text.** Simpler. Rejected: a
  newline in `textContent` renders as a space, so two messages run together, and there is
  nothing to hang a per-severity class on.
- **Reciting every message in the live-region announcement.** The obvious reading of "a summary
  is announced". Rejected: it duplicates what the user is about to hear field by field, and it
  is unbounded — a ten-error form becomes a paragraph read over the user moving through it.
- **Creating a feedback node for every field up front.** Would make rendering a pure attribute
  update. Rejected: it puts an empty element under every control of every form, including forms
  that never fail.
- **An `{html, sanitize}` pair, as everywhere else.** Rejected for F123's sake — see Decision 6.
  This is the one place in the library where the *absence* of the opt-in is the security
  property.

## Consequences

- **The surface goes from 136 to 138 exports** across the same twelve entries:
  `bindFormFeedback` on `/forms`, `BOOTSTRAP_FEEDBACK_CLASSES` on `/bootstrap`. Additive
  (NFR-37).
- `/bootstrap` is at **24 632 B — 368 B under ADR-0041's clause**, down from 505 B. The clause
  is now genuinely tight, and 21.4/21.5 add nothing to that entry, but the next wave that wants
  to should read this ADR's table first.
- **A one-byte gate failure, and it was right.** Adding one frozen constant moved the shared
  chunk split enough to push `single: bsTooltip` from 2100 B to 2101 B against a 2100 B row. A
  tight row is supposed to notice; the row is re-pinned with the cause recorded rather than
  quietly widened.
- `/forms` reaches **5 488 B**, and the per-function rows now tell the family story properly:
  `createForm` alone is 1 893 B (34% of the entry, down from 49% at 21.2) and
  `bindFormFeedback` alone is 2 464 B. The split gets more valuable with every sibling.
- NFR-22 is re-derived a third consecutive time with no new entry — 67 624 B → 68 kB.
- **Known limitation:** `report()` focuses the first control of the first field with an error,
  in field order. A form whose visual order differs from its DOM order will send focus somewhere
  the user does not expect. Field order is the only order this library can see, and a caller who
  needs another can read the result and focus for themselves.

## References

- Spec 08 §2 F120-F121, §3 NFR-38 (the measurement condition this ADR discharges), §6.
- `src/main/javascript/it/d4np/utils/forms-feedback.js`, `bootstrap-forms.js`.
- `src/test/browser/forms-feedback.spec.js` — where `display: block` with Bootstrap's real
  stylesheet proves Decision 2, and jsdom could not have.
