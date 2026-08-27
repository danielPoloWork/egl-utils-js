# 2026-08-27 — Two questions rather than one boolean, and spec 08 closed (21.5)

## What got done

- **`trackChanges`** on `egl-utils-js/forms` — spec 08 F124–F125: dirty and touched per field and
  per form, `touch()`/`untouch()`, the `beforeunload` guard, and `confirmLeave()` for the in-app
  route change the platform cannot see.
- **[ADR-0081](../../adr/0081-two-questions-rather-than-one-boolean-and-a-guard-that-comes-and-goes.md)**,
  the `Window.beforeunload` API-floor entry NFR-40 named in advance, and budgets re-pinned on
  three routes.
- 48 example tests at **100% lines and 100% branches** on the new module, plus 3 browser tests
  green on Chromium and WebKit.
- **Spec 08 is closed** — F112–F125 all implemented — and **M21 completes with it**.

## The two questions, and the test that shows why they are two

Everything in this item follows from one case:

```js
type('name', 'Grace');   // dirty, touched
type('name', 'Ada');     // clean, still touched
```

An undo is not a visit that never happened. A guard that warned here would be warning about
nothing, and a form that hid the error on a field the user has been sitting in for a minute would
be hiding it for the wrong reason. One boolean cannot hold both facts, which is what F124 says and
what this test pins.

## Dirty is derived, and that decision is about `setBaseline`

The obvious implementation stores a flag and flips it on edits. It is wrong the moment the
baseline moves — and the baseline moves on every successful save:

```js
await api.put(url, form.toJSON());
form.setBaseline();      // these values are the clean ones now
// a stored flag is still true here, and the user is told they have unsaved changes
```

So every query recomputes from `form.baseline()` and `form.getValues()`. Nothing here can be
stale, which is the ADR-0028 posture applied to a value rather than to a missing document.

One rule fell out of that and is worth stating because it looks arbitrary until you line it up
with F115: **a field the baseline does not mention is never dirty.** That is exactly what
`reset()` does with such a field — nothing — so there is no value for it to differ *from*.
Treating "absent" as "changed" would make a form with a partial baseline look permanently unsaved.

## What this cannot hear, and the one seam that admits it

`setValues` fires no events, deliberately (F45: a programmatic write is not a user edit, and
synthesising one re-enters the handler that asked for the write). So a value written in code is
inaudible to every listener this could attach.

The resolution is a split rather than a fix:

| | driven by |
|---|---|
| `state()`, `isDirty()`, `isTouched()` | recomputation — always right, no seam |
| `'change'` event, guard attachment | what this can observe — `refresh()` after a silent write |

Synthesising the missing event was the alternative and it is worse than the seam: it would fire
inside code that already knows it just wrote, which is where re-entrancy bugs come from.

## Why "only while dirty" is a requirement and not tidiness

F125 asks for the `beforeunload` registration attached only while the form is dirty. The simpler
reading — register once, check dirty when it fires — is equivalent in behaviour and not in cost:
**a live `beforeunload` listener makes the page ineligible for the back/forward cache** in every
current engine. A handler that checks dirty at fire time has already spent that, on every clean
form on every page, for a warning that never happens.

So the guard is opt-in (a *window*-level registration is not something a form-scoped helper should
perform because someone constructed it — `validateOn: []` in 21.2 is the same instinct), and it
comes and goes with the dirty flag. It is detached by hand rather than through an internal
`AbortController`, because the controller comes from this document's realm while the listener
lives on a window that may be another: the BUG-0003 trap ADR-0045 recorded, which
`bindTableHistory` already avoids for `popstate`.

Asserting that needed a window that can be interrogated — the platform exposes no listener
registry — so the leak test counts registrations on an injected fake. Two forms on one page,
one destroyed, the other's registration still standing: that is NFR-41 and NFR-15 in the same
test.

## `confirmLeave()`, and what "no question" answers

A clean form resolves `true` and asks nothing: a dialog in front of a user who changed nothing is
how a guard gets disabled by the people it protects. A dirty form asks the injected `confirm` —
which is where an F101 dialog goes, in your own words, for the in-app route change `beforeunload`
never sees.

With nothing injected it resolves **`false`**. Both alternatives were worse: `true` silently
allows the navigation the method exists to question, and throwing turns a forgotten option into a
broken route transition at the exact moment a user is trying to leave.

## What the browser suite is for here

The Node suite dispatches its events by hand, which proves the wiring and nothing about whether a
real interaction produces those events at all — and this instance's correctness rests entirely on
that assumption. So the browser spec types with a real keyboard, tabs out, clicks a checkbox and
picks an option, on three engines.

The `beforeunload` dialog is deliberately **not** browser-tested: automation suppresses it by
design, so a test of it would be asserting the harness. What is assertable about it is a leak
test, and that is where it lives.

## A second copy, fixed at two

`fieldOf` — the event-target-to-field-name loop — existed in `createValidator` and this item
needed the same eight lines. It moved to `forms-values.js`, beside the field set it queries, as an
entry-internal export on neither barrel. Two copies is where that gets fixed; the F109 lesson was
recorded at four.

## Budgets

| Row | Before | After | Cause |
|---|---:|---:|---|
| `/forms` (size-limit) | 6 959 B | **7 844 B** | the tracker |
| `single: trackChanges` | — | **1 608 B** | the smallest of the five siblings |
| `/forms` (served, F87) | 13 110 B | **14 137 B** | the same six requests, for the fifth item running |
| global artifact | 49 763 B | **50 606 B** | re-pinned at measured + 2.0% |

**NFR-22's derivation was recomputed a fifth time and the clause did not move**: 69 980 B rounds
to the same 70 kB that 21.4 derived — with **20 B** under it. The derivation moved and the bound
did not, which is the distinction the rule is actually about. The next byte added to any entry
re-derives it to 71 kB.

## Spec 08 is closed

F112–F125, five items, one new entry, seven new exports and one new instance method — and the
whole wave was additive: no existing export, option name, error code or `exports`-map path
changed (NFR-37).

| Item | What it added |
|---|---|
| 21.1 | `createForm` on a new `/forms`, `getValue` on `/dom` |
| 21.2 | `createValidator` |
| 21.3 | `bindFormFeedback`, `BOOTSTRAP_FEEDBACK_CLASSES` |
| 21.4 | `bindSubmit`, `applyFindings`, the library's first untrusted-payload boundary |
| 21.5 | `trackChanges` |

## Next

M21 is complete, so the next move is the maintainer's: a **release PR** rolling the five queued
changesets — one per item — into a minor. Nothing in the roadmap is open below this.
