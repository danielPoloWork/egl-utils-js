# 2026-08-27 — A guard that is the promise, and a payload that is untrusted (21.4)

## What got done

- **`bindSubmit`** on `egl-utils-js/forms` — spec 08 F122–F123: validate, refuse, mark busy,
  disable, await, restore, report, with the double-submit guard structural and a server's errors
  routed onto the fields.
- **`applyFindings`** on the validator instance — the way in that 21.2 never needed and 21.4 does.
- **[ADR-0080](../../adr/0080-a-guard-that-is-the-promise-and-findings-from-outside-the-engine.md)**,
  the **threat-model boundary and its STRIDE pass** (NFR-42's explicit condition), budgets
  re-pinned on five routes, and the NFR-22 derivation recomputed a fourth consecutive time.
- 89 example tests at **100% lines and 100% branches** on the new module, plus 3 browser tests
  green on Chromium and WebKit.

## The guard had to be the promise, and that decided the method's shape

F122 says the double-submit guard is *structural*. The obvious implementation is a flag:

```js
async submit() {
  if (busy) return;      // ← the check
  busy = true;           // ← the set
  ...
}
```

That is correct here only by accident — the check and the set are adjacent. Move one `await`
between them and it is a race, which is exactly what happens the first time someone adds
"validate before you start". So the guard is the promise itself: `submit()` stores the promise it
started and hands the *same object* back to a second caller.

Which forced something small and easy to get wrong: **`submit()` cannot be an `async` method.**
An `async` wrapper returns a fresh promise per call, so `second === first` would be false while
every behavioural test still passed. The test asserts identity for that reason, not invocation
counts — a refusal-based implementation would pass an invocation count too.

## What resolves, and what rejects

Spec 08 §5 gave half the answer ("a form that fails validation is not an error") and pointed at
F102 for the rest. ADR-0071 is the precedent and it settles it cleanly:

| Outcome | Delivery |
|---|---|
| validation found an `error` | resolves `{status: 'blocked', validation}` — the form was asked and said no |
| the handler resolved | resolves `{status: 'succeeded', validation, handlerResult}` |
| the handler rejected | **rejects with the handler's own error**, unwrapped |

The third row is the one worth defending. An always-resolving `{status: 'failed', error}` is safer
against an unhandled rejection and wrong about what happened: a caller who ignores the outcome
swallows a server failure in silence, which is the defect ADR-0028 removed everywhere else here.
It would also put a property named `error` next to a findings vocabulary whose severities are
`error`/`warning`/`info` — ADR-0048's exact prohibition.

That left one real hole: **the intercepted path has no caller to reject to.** A `<form>`'s own
submit button is the whole point of `intercept`, and an unhandled rejection out of a DOM event
handler is noise, not a diagnostic. So every outcome is published to `on('settle')` — the channel
for the half no field can display, because a 500 with no body maps to no findings at all — and the
listener consumes the rejection of the call it made.

## The security half, which is the actual point of this item

Until now every string this library rendered came from the caller. F123 changes that, and three
decisions carry the weight.

**A field name is a key, not a selector.** `{errors: {"input[name=email]": "…"}}` is the payload
that makes the point. Names are tested with `Object.hasOwn` against the field set `createForm`
already resolved from the caller's own root, so a selector-shaped string selects nothing — there
is no `querySelector` on this path to reach.

**An unmatched name is reported, not dropped.** A renamed column or a server-side-only rule is the
realistic case, and discarding it leaves a user with a spinner that stopped and no explanation. It
becomes a form-level finding carrying `field`, so the name survives as data — and the message is
*not* rewritten to include it, because a server's wording is not ours to edit (NFR-21).

**`Object.fromEntries`, never `map[name] = …`.** BUG-0004's lesson, and this time the input is
untrusted rather than a caller's own column key. What makes it testable is pleasing: with
assignment, `{errors: {__proto__: "hacked"}}` sets the map's *prototype* and the complaint
**vanishes**. So the test asserts the finding is reported, which proves the map was not built by
assignment — a stronger assertion than checking `Object.prototype` afterwards, and it checks both.

The one thing the mapper does *not* do is coerce. A nested object under a field name is dropped
rather than `String()`-ed, because `[object Object]` rendered under a control is worse than
saying nothing. A mapper that returns a *malformed finding*, on the other hand, throws — ADR-0078's
boundary, unchanged: an operational failure fails closed, a programming error is loud.

## Where the findings had to live, and one word that was nearly wrong

The renderer subscribes to the validator. So a server finding stored in the submitter would have
needed a second renderer, and the F121 one — already on the page — would have shown a form with no
server errors on it. Hence `applyFindings` on the validator: its own slots beside the rule slots
(ADR-0078's structure, reused), cleared when the field is validated again because a complaint
about a value stops being true when the value changes.

The `source` was `'server'` for about an hour. It is `'external'`: the method is general — a
websocket, a cross-form check — and naming the slot after its commonest occupant would make a
cross-tab finding claim to have come from an HTTP response. ADR-0048, one word one meaning.

## What the browser suite caught that jsdom could not

Extending `pushCustomValidity` to server findings looked like tidiness (F119: the platform and the
engine never disagree). It is not tidiness. Without the push, a field with a server error carries
`.is-invalid` **and** matches `:valid`, so `.was-validated .form-control:valid` styles it green
while `.is-invalid` styles it red, and which one wins is a specificity argument in someone else's
stylesheet. jsdom's constraint validation is a simulation and would have agreed with either
version; the browser spec asserts `control.matches(':invalid')` on a real `ValidityState`.

The other browser-only claim is the blunt one: **the page does not navigate.** jsdom does not
implement form submission at all, so a Node test passes whether or not anything called
`preventDefault()` — and "saves correctly, then reloads the page" is the most user-visible way this
item could have failed.

## NFR-40 anticipated an API this does not use

`HTMLFormElement.requestSubmit` was on the wave's expected list. It is not called: intercepting
`submit` *is* the integration, and a caller who wants a button outside the form to trigger it calls
`requestSubmit()` in their own code, against their own floor. So the inventory gains no entry —
recorded in the ADR so the absence reads as a decision rather than an oversight.

## Budgets

| Row | Before | After | Cause |
|---|---:|---:|---|
| `/forms` (size-limit) | 5 488 B | **6 959 B** | the lifecycle, the mapper, the bookkeeping |
| `single: bindSubmit` | — | **1 911 B** | 27% of the entry; composes neither the validator nor the renderer |
| `single: createForm` | 1 893 B | 1 886 B | a fourth sibling re-split the shared chunk |
| `single: bindFormFeedback` | 2 251 B | 2 236 B | the same re-split |
| `/forms` (served, F87) | 11 207 B | **13 110 B** | same six requests for the fourth item running |
| global artifact | 48 452 B | **49 763 B** | re-pinned at measured + 2.1% |

NFR-22 recomputed by spec 05's method: **69 095 B → 70 kB**, and for the first time in this wave
the whole increase is one entry — `/forms` +1 471 B, every other entry byte-identical. Measured
against a `main` build on the same toolchain rather than against the figures in the rows, which
turned out to matter: several rows carry text from an older esbuild and would have made this item
look responsible for drift it did not cause.

## Next

**21.5** — dirty/touched tracking and the unsaved-changes guard (F124–F125), the last item in
spec 08. It needs the `beforeunload` inventory entry NFR-40 named, and a leak test as much as a
behaviour test.
