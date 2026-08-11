# 2026-08-10 — Commands throw, queries answer (17.9)

## What got done

The instance contract, settled across all fifteen shapes —
[ADR-0049](../../adr/0049-commands-throw-queries-answer.md).

- **Three rules**, in the shape of command–query separation: a command on a destroyed
  instance throws `TypeError: <api>: <method>() was called after destroy()`; a query still
  answers (`isShown()` → `false`); `destroy()` is idempotent. Data properties are not
  commands and stay readable.
- **`show()` returns `void` everywhere.** The two that did not are renamed for what they
  actually do: `loadingOverlay.show()` → **`acquire()`** (it hands back a lease) and
  `bsToast.show()` → **`add()`** (it creates a toast and returns the node).
- **Four silent commands fixed**: `bsProgress.setValue`, `bsToast.hide`,
  `inlineAlert.hide`/`bsAlert.hide`, `loadingOverlay.wrap`.
- **The member matrix turned into rules** — `element` where a node is owned, `isShown()`
  wherever `show`/`hide` exist, `instance()` only where there is exactly one Bootstrap
  component, `on()` wherever events flow. Additions: `element` ×4, `isShown()` ×5, `on()` on
  `bsToast`.
- **A state violation stays a `TypeError`** — no eleventh `EGL_*` code.
- **Composing entries own their diagnostics**: `bsAlert` and `bsLoadingOverlay` no longer
  report failures under the engine's name.
- **17.8's loose end closed**: `document` now works on `bsPagination` and `bsTable`.
- `lifecycle.js` holds the rule and the guard; `instance-contract.test.js` (64 tests) sweeps
  every shape. Specs 03 F49/F50 and 04 F69/F70/F71/F80 amended; seven size rows re-baselined
  and three clauses amended.

## The judgement calls

**Not making `isShown()` throw.** The tempting rule is "everything refuses after destroy" —
one sentence, no exceptions. It is also wrong: a destroyed component *is not shown*, so the
question has an answer, and throwing would force a caller to guard something already known.
Command–query separation turned out to be the rule that made the whole matrix explainable
rather than a list of exceptions, including why `element` stays readable.

**Renaming rather than flattening the return types.** The cheap way to make `show()` return
one thing is to make it return nothing everywhere. That deletes capability: the toast node is
the only handle to one toast, and the gate's release closure *is* its refcount contract —
replace it with a `hide()` and callers can call it more often than they acquired, which is
exactly how refcounts drift. So the two kept their behaviour and lost the misleading name.

**Not adding an `EGL_*` code for use-after-destroy.** There is a real counter-argument, and it
is recorded in the ADR: a late callback can reach a component an aborted signal already
destroyed, and a code would let that be caught without string-matching. It loses on
asymmetry — **adding a code later is a MINOR; freezing one now is permanent** — and on the
fact that the idiomatic guard already exists (the same signal cancels the work). When the
reversible option and the irreversible one look equally good, take the reversible one.

**An internal positional parameter, not an option key.** `inlineAlert` and `loadingOverlay`
take the reported API name as a third argument. Since ADR-0047, *every accepted option key is
public API*, so routing it through options would have frozen an internal detail as surface.
Documented as internal rather than hidden — the honest version of a private parameter in a
JSDoc-typed library.

## What the sweep caught that I had not

Writing `instance-contract.test.js` as a sweep over all fifteen shapes rather than a few
examples paid for itself immediately: it failed on `bsAlert` and `bsLoadingOverlay` still
reporting the engine's name, because I had added the `api` parameter to `inlineAlert` and
`loadingOverlay` but wired it at only one of the two call sites. A per-component test would
have passed.

It also cost coverage briefly — `bsToast.on()` was new, additive, and untested, which the
gate caught at 99.89% lines. Three real behaviour tests later (bubbling covers toasts that do
not exist yet; the unsubscribe is idempotent; `destroy` drops the manager's own subscriptions,
not only its toasts) it is back to 100%.

## The cost, stated plainly

Seven size rows re-baselined and **three clauses amended** — `inlineAlert` 1.5 → 1.58 kB,
`bsPagination` 1.5 → 1.58 kB, `bsModal` 1.25 → 1.31 kB, plus `bsToast`'s named row 2.32 →
2.55 kB. Unlike 17.7, this growth is **features**: `on()` + `isShown()` + `element` on
`bsToast` is +152 B, and `bsModal`'s +17 B is the one method F70 should have had. The entry
rows barely moved (`/bootstrap` 19953 B inside 20.5 kB, `/dom` 4929 B inside 4.93 kB) and no
entry clause moved at all.

## Where the project stands

M17: 17.1, 17.7, 17.8, 17.9 done; 17.2–17.6 and 17.10–17.13 open. Three changesets pending.
ADRs through 0049, next free 0050. Gates green: **2371 tests**, 100% lines / 99.38% branches,
all 98 size rows, publint, attw, agadoo, zero-deps, TypeDoc, api-floor, consistency lint.

## How the next session resumes

1. Wait for this PR to merge (one item per PR).
2. The review's order puts **17.2** next — the runtime floor, independent of every review
   item and the last decision-heavy one before the small ones (17.10–17.13).
3. If the owner prefers to finish the review's queue first, **17.10** (`withUrlParams`'s
   entry) is a fast/low decision and **17.11** (the `dompurify` peer floor) is
   security-adjacent and should not sit indefinitely.
