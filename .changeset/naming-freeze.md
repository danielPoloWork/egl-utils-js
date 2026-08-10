---
'egl-utils-js': minor
---

**Breaking:** one word, one meaning — the vocabulary v1.0.0 freezes (ROADMAP 17.8,
ADR-0048).

- `label` → **`ariaLabel`** on `bsIcon`, `bsButtonGroup`, `bsCloseButton`, `bsSpinner`,
  `bsProgress` and `bsBreadcrumb`, and inside an `icon` spec. `label` now always means text
  the user sees, so `bsButton.label` and a table column's `label` are unchanged. The renamed
  six all have defaults or serve localisation, so the churn falls on the options a caller
  passes least.
- `bsToast` takes one **`autoHideMs: number | false`** instead of Bootstrap's
  `{autohide, delay}` pair, at the manager and per `show()` — the same word `inlineAlert` and
  `bsAlert` already used. `false` means "stay up until dismissed"; the 5000 ms default is
  unchanged. Bootstrap's pair survives only in the config handed to its constructor.
- `bsListGroup(...).update(items)` → **`setData(items)`**, `bsProgress(...).update(value)` →
  **`setValue(value)`**, `bsPagination(...).update(view)` → **`setView(view)`**. A
  no-argument recompute keeps the vendor's own name, so `bsTooltip`/`bsPopover`/dropdown
  `.update()` and `bsScrollspy(...).refresh()` are untouched.
- `bsPagination`'s `onPage` → **`onPageChange`**.

Two conventions the review found already consistent are now written down rather than left to
luck: a duration carries the `Ms` suffix unless its name is already a duration (`delay`,
`interval`, `timeout`), and a data-carrying callback takes the event last while a DOM
primitive takes it first.

Every stale call fails loudly — `TypeError: unknown option 'label'`, or
`list.update is not a function` — because unknown option keys became a `TypeError` in the
previous release. That ordering was deliberate.
