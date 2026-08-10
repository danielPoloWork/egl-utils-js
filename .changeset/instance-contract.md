---
'egl-utils-js': minor
---

**Breaking:** commands throw, queries answer — the instance contract (ROADMAP 17.9,
ADR-0049).

Fifteen instance shapes now end the same way, and behave the same way once they have.

- `loadingOverlay(...).show()` → **`acquire()`**; `bsToast(...).show()` → **`add()`**. Every
  remaining `show`/`hide`/`toggle` returns `void`. The two that did not were doing different
  jobs: one hands back a lease on a reference-counted gate, the other creates a toast and
  returns its node.
- A command on a destroyed instance throws `TypeError: <api>: <method>() was called after
  destroy()` — one sentence where there were three, naming the method you called rather than
  the internal chokepoint the guard sits on. Four commands that used to do nothing in silence
  now refuse: `bsProgress.setValue`, `bsToast.hide`, `inlineAlert.hide`/`bsAlert.hide` and
  `loadingOverlay.wrap`.
- `isShown()` still answers after `destroy()` — `false`, which is true rather than merely
  convenient — and data properties such as `element` stay readable.
- `bsAlert` and `bsLoadingOverlay` report their own names in diagnostics instead of the
  engines they compose.

Additive alongside it: `element` on four more shapes (the F50 gate stays exempt — it owns no
node by design), `isShown()` on five, `on()` on `bsToast`, and the `document` override on
`bsPagination`/`bsTable` that `bsToast` already had.
