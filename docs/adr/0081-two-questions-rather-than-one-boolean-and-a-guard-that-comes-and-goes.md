# ADR-0081: Two questions rather than one boolean, and a guard that comes and goes

- **Status:** Accepted
- **Date:** 2026-08-27
- **Deciders:** Daniel Polo
- **Related:** [spec 08](../specs/08_spec_form_engine.md) §2 F124-F125, §3 NFR-39/NFR-40/NFR-41,
  ROADMAP 21.5 (the item that closes spec 08);
  [ADR-0028](0028-dom-entry-fails-fast-and-the-floor-gate-sees-the-dom.md) (name the contract
  rather than fail on an undefined read),
  [ADR-0045](0045-a-controller-from-the-node-s-own-realm.md) (why the `beforeunload` listener is
  detached by hand and not through an internal controller),
  [ADR-0047](0047-an-unknown-option-key-is-a-typeerror.md),
  [ADR-0048](0048-one-word-one-meaning.md) (why this does not have a `reset()`),
  [ADR-0049](0049-commands-throw-queries-answer.md),
  [ADR-0071](0071-a-manager-not-three-globals-and-a-dismissal-is-an-answer.md) (the F101 dialogs
  `confirmLeave` is built to take),
  [ADR-0077](0077-a-subject-entry-a-primitive-that-stayed-one-and-a-family-not-a-god-object.md)
  (the family this completes),
  [ADR-0080](0080-a-guard-that-is-the-promise-and-findings-from-outside-the-engine.md) (the
  sibling before it)

## Context

F124 asks for *dirty* and *touched*, per field and per form, and is unusually explicit about why
they are two things: an unsaved-changes guard wants dirty, and "do not show me an error for a
field I have not filled in yet" wants touched. F125 asks for a `beforeunload` registration
attached **only while the form is dirty** and detached on teardown, plus an explicit check the
application calls before an **in-app** route change — the case `beforeunload` cannot see.

Four questions the requirement does not answer.

**Is dirty stored or derived?** The baseline is not fixed: `setBaseline()` moves it after a save
and `reset()` returns to it (F115). A flag maintained on edits is therefore one `setBaseline`
away from being wrong, and wrong in the direction that matters — a form that says it has unsaved
changes after saving is a guard users learn to click through.

**What can this instance actually hear?** `setValues` fires no events, deliberately (F45/F115: a
programmatic write is not a user edit and synthesising one would re-enter the handler that asked
for the write). So a value written in code is invisible to every listener this could attach.

**Why does "only while dirty" matter enough to be a requirement?** A permanent registration is
simpler and, on a naive reading, equivalent — the handler could just check dirty when it fires.

**What does the in-app check answer when nobody supplied a question?** `confirmLeave()` has to
return something when the form is dirty and no dialog was injected.

## Decision

**1. Dirty is derived on every read; touched is the only state this keeps.** Every query
recomputes from `form.baseline()` and `form.getValues()`, so no query here can be stale — the
ADR-0028 posture applied to a value rather than to a missing document. What is stored is the set
of touched field names, because "the user has been here" is genuinely history and cannot be
derived from anything.

Comparison is `Object.is` on the leaves and element-wise on arrays, which covers the whole shape
space F112-F115 admits. A `File` compares by identity: two different files with the same name are
two different files, and the platform offers no cheaper truth.

**A field the baseline does not mention is never dirty.** That is exactly what `reset()` does with
it — nothing — so there is no value for it to differ *from*, and calling it changed would make a
form with a partial baseline look permanently unsaved.

**2. `refresh()` is the seam, and it is F115's consequence rather than a gap.** The queries are
always right; the `'change'` event and the guard's attachment are driven by what this can observe.
After a programmatic `setValues`, `setBaseline` or `reset`, the caller calls `refresh()`. The
alternative is a library that synthesises `input` events, which F45 refused for reasons that have
not changed, and the seam is one line in the one place a caller already knows they did something
silent.

**3. The guard is opt-in, and attached only while there is something to guard.** `trackChanges`
attaches its own **form-scoped** listeners unconditionally, because noticing an edit is its whole
job; it touches the **window** only for `guard: true`. And "only while dirty" is not tidiness: in
every current engine a live `beforeunload` listener makes the page ineligible for the
back/forward cache, so a permanent registration would tax every clean form on every page for a
warning that never fires. A handler that checks dirty when it fires is too late — by then the
page has already paid.

It is detached by hand, never through an internal `AbortController`: the controller would come
from this document's realm while the listener lives on a window that may be another, which is the
BUG-0003 trap ADR-0045 recorded and `bindTableHistory` already avoids for `popstate`. The window
is resolved from the form's own `ownerDocument.defaultView` and is injectable, so a detached or
server-side document raises `EGL_DOM_CONTRACT` naming the option instead of failing on an
undefined read.

**4. A clean form asks nothing, and "nobody was asked" is not consent.** `confirmLeave()` resolves
`true` immediately when the form is clean — putting a dialog in front of a user who changed
nothing is how a guard gets disabled by the people it protects. When the form is dirty it asks the
injected `confirm`; with none injected it resolves **`false`**, which is the safe half and leaves
`isDirty()` right there for anyone writing their own flow. An answer that is not a boolean is a
`TypeError`, the same boundary every injected callback in this library gets.

**5. `touch()`/`untouch()`, and deliberately no `reset()`.** ADR-0048 governs: `reset` already
means "restore the baseline into the controls" on `createForm`, and a second `reset` meaning
"forget which fields were visited" would be the same word for two things in one subsystem.
`touch()` is what a blocked submit calls so every error is allowed to show at once; `untouch()` is
its exact inverse, and what a successful save calls beside the form's own `setBaseline()`.

**6. `fieldOf` moved to `forms-values.js`.** The event-target-to-field-name loop existed in
`createValidator` and this item needed the same eight lines. It now lives beside the field set it
queries, as an entry-internal export on neither barrel. Two copies is where that gets fixed, not
four (the F109 lesson, applied early rather than late).

**No trust boundary changes.** Unlike 21.4, nothing here reads an untrusted input: the guard
consumes no payload and the only new platform surface is an event registration.
`docs/security/threat-model.md` is therefore unchanged, and this sentence exists so the absence is
a finding rather than an omission.

## Alternatives Considered

| Option | Why not |
|---|---|
| **One `dirty` boolean, with touched left to the caller** | The two questions have different answers for the same field — an undo leaves it touched and clean, an untouched field can never be dirty — and every caller who needed the second one would rebuild it from `focusout` listeners this instance already owns. |
| **A stored dirty flag updated on each edit** | One `setBaseline()` away from lying, and the lie is "you have unsaved changes" *after* a save. |
| **Register `beforeunload` once and check dirty inside the handler** | Simpler, and it spends the page's back/forward-cache eligibility permanently to avoid an `addEventListener` call per dirty transition. F125 asks for the opposite trade for that reason. |
| **Synthesise `input` events from `setValues` so nothing needs `refresh()`** | F45 refused exactly this: a synthetic event re-enters the handler that asked for the write. The seam is honest; the synthesis would be a bug generator in someone else's code. |
| **`confirmLeave()` resolves `true` when no `confirm` was injected** | Silently allows the navigation the method exists to question. A caller who wants that already has `isDirty()`. |
| **`confirmLeave()` throws when no `confirm` was injected** | Turns a forgotten option into a broken route transition, in the code path that runs when a user is trying to leave. |
| **The guard on by default** | A window-level registration performed because someone constructed a form-scoped helper. `validateOn: []` in 21.2 is the precedent: this family attaches nothing a caller did not ask for beyond its own root. |
| **A `reset()` on the tracker** | ADR-0048. `createForm.reset()` already owns that word in this subsystem. |

## Consequences

- **`/forms` reaches 7 844 B** (+885 B) and `trackChanges` alone measures **1 608 B** — the
  smallest of the five siblings, and the only one that reaches a window. The entry is 2.1× its
  21.1 size across five items, which the five per-function rows make a menu rather than a bill.
- **NFR-22's derivation is recomputed a fifth time and the clause does not move**: 69 980 B rounds
  to the same 70 kB, with **20 B** under it. The derivation moved and the bound did not, which is
  the distinction spec 08 NFR-43 is actually about; the next byte added to any entry re-derives it
  to 71 kB.
- **`Window.beforeunload` joins the API-floor inventory** — the entry NFR-40 named in advance. Its
  BCD floor is trivially old, and the entry is about *context*: the only window-level registration
  the form entry makes, a bfcache cost the instance cannot see, and a dialog no page can word.
- **The surface is additive**: 139 exports become 140 across the same twelve entries.
- **Spec 08 is closed.** F112–F125 are all implemented, and M21 completes with it.

## References

- [spec 08](../specs/08_spec_form_engine.md) §2 F124-F125, §3 NFR-39/NFR-40/NFR-41, §6
- [ADR-0077](0077-a-subject-entry-a-primitive-that-stayed-one-and-a-family-not-a-god-object.md),
  [ADR-0078](0078-latest-wins-per-rule-a-level-that-is-not-a-block-and-an-order-that-is-the-contract.md),
  [ADR-0079](0079-a-costume-that-is-only-a-constant-and-a-node-where-the-css-can-see-it.md),
  [ADR-0080](0080-a-guard-that-is-the-promise-and-findings-from-outside-the-engine.md) — the rest
  of the family
- `src/main/javascript/it/d4np/utils/forms-track.js`,
  `src/test/javascript/it/d4np/utils/forms-track.test.js`,
  `src/test/browser/forms-track.spec.js`
