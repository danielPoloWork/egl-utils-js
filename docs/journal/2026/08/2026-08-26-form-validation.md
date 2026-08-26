# 2026-08-26 — Latest-wins per rule, and an order that is the contract (21.2)

## What got done

- **`createValidator`** on `egl-utils-js/forms` — spec 08 F116–F119: rules as functions,
  three severities with only `error` blocking, incremental runs driven by declared
  dependencies, abortable latest-wins on async, and the platform's own constraint validation
  read rather than re-declared.
- **[ADR-0078](../../adr/0078-latest-wins-per-rule-a-level-that-is-not-a-block-and-an-order-that-is-the-contract.md)**,
  four constraint-validation members added to the api-floor inventory, budgets re-pinned, and
  a browser spec for the half jsdom cannot prove.
- 41 example tests and a 5-test browser spec on Chromium and WebKit; **3 153 tests at 100%
  lines**, 98.91% branches on the new module (two deliberate forward-compatibility guards).

## The decision that shaped the implementation

F118 says "validating one field re-runs that field's rules and the cross-field rules that
declared it". Read carefully, that sentence breaks the obvious concurrency model — because a
rule declared on `end` with `dependsOn: ['start']` produces a finding that belongs to **`end`**.
So validating `start` writes `end`'s findings, and if the in-flight work is keyed by *the field
being validated* (which is how the F88 remote pipeline keys it, by query), two concurrent runs
can both write the same field.

**So latest-wins is keyed per rule, not per run.** Each rule owns one finding slot and at most
one in-flight execution; a newer execution aborts the older and the older cannot land, because
the settle path compares identity rather than trusting `signal.aborted` — an abort stops a
`fetch`, it cannot un-resolve a promise that already settled in a microtask. And the published
result is **derived** from the slots rather than mutated in place, so a half-finished run
cannot publish a half-written field. Race-freedom became structural instead of careful, which
is the difference between a design that holds and one that holds until someone adds a feature.

The tests for it invert settlement order on purpose: start two validations of the same field,
resolve the *second* first and the *first* second, and assert the second's answer is what
survived. That assertion is the only way to see the bug this design exists to prevent.

## The trap in F119, which is an ordering trap

`setCustomValidity(msg)` sets `validity.customError`, which makes `validity.valid` false. So an
engine that reads `validity` *after* pushing its own message reads **its own output back as a
native failure** — a feedback loop that reports the same problem twice and never clears. Per
field, per run, the order is therefore: clear the custom message on every control, then read
`validity`, then push the field's first blocking rule finding. It is two calls in a specific
order and it is a contract, not an implementation detail, so it is written down in the ADR and
in the api-floor entry for `setCustomValidity`.

There is a test asserting the engine never reads its own push-back — which passed first time,
and would have failed loudly the moment someone reordered those two lines.

## A rule can fail two ways, and they belong on opposite sides of one `try`

Spec 08 §5 explicitly left this to the ADR. A rule that **throws** — the network is down —
becomes an `error` finding with the original as `cause`: "could not decide" is not "fine", and
treating a blip as a pass lets the value through, which is failing open on exactly the thing
you were worried about. A rule that **returns nonsense** (`{severity: 'fatal'}`) throws a
`TypeError` naming the rule, because that is a programming error and ADR-0047 already drew
that line.

My first implementation had both inside the same `try` and the malformed-finding test caught
it: the shape error was being converted into a finding, hiding the bug behind a message the
user could not act on.

## What only a real engine could prove

jsdom implements constraint validation faithfully enough to unit-test against, and then
reports `validationMessage` as the single string *"Constraints not satisfied"* for every
failure. So the two claims F119 actually makes were unprovable there, and both are now
asserted on Chromium and WebKit: that a real engine's **own localized wording** reaches the
finding (the reason reading the platform beats re-declaring it), and that the push-back makes
a **real `checkValidity()` and a real submit refuse** — asserted by clicking a real submit
button and observing that the browser declined to fire the event, with nothing in this library
listening for it.

## The measurements

`/forms` goes from 1 840 B to **3 747 B**, and it now earns the per-function row 21.1
deliberately did not add: **`createForm` alone is 1 840 B — 49% of the entry.** That is the
ADR-0077 family split proved rather than asserted; a filter form links the binder and not the
engine.

The deep-ESM route grew 2 372 B **on the same six requests** — the rules, the races and the
constraint seam all landed inside files that route already downloaded whole. The one direction
the F87 table ever moves cheaply.

NFR-22's ceiling is re-derived again, to 66 kB, **with no new entry in it**: the twelfth one
grew. That is precisely the case the "whenever any input moves" rule exists for, and the first
time it has fired without an entry being added.

## Where the project stands

v1.3.0 tagged, Release still drafted (publishing is the owner's). **M21: 21.1 and 21.2 done**,
21.3–21.5 open. Two changesets queued. ADRs through 0078, next free 0079.

## How the next session resumes

1. Wait for this PR to merge (one item per PR).
2. **21.3**, the Bootstrap costume for the findings (spec 08 F120–F121). Two things are already
   settled and should not be re-litigated: it is the `bsAlert` shape — an injected class map on
   the engine, Bootstrap's names as a frozen constant — and **where it lands is a
   measurement**, because `/bootstrap` has 505 B under ADR-0041's clause (spec 08 NFR-38). The
   new half is F121: focus to the first error on a blocked submit, and a summary announced
   through the F110 live region.
3. The findings shape is now what 21.3 renders and 21.4 merges server errors into:
   `{message, severity, source, constraint?, cause?}`, frozen.
