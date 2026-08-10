# 2026-08-10 — One word, one meaning (17.8)

## What got done

The vocabulary v1.0.0 freezes, decided and applied in one pass —
[ADR-0048](../../adr/0048-one-word-one-meaning.md). **Eleven breaking renames**, plus two
conventions written down that cost no rename at all.

| Decision | Change |
|---|---|
| `label` = what the user sees; `ariaLabel` = the accessible name | six renames (`bsIcon`, `bsButtonGroup`, `bsCloseButton`, `bsSpinner`, `bsProgress`, `bsBreadcrumb`) + `IconSpec` |
| One auto-dismiss word | `bsToast`'s `{autohide, delay}` → `autoHideMs: number \| false` |
| `set<Noun>` takes new state | `setData(items)`, `setValue(value)`, `setView(view)` |
| A no-argument recompute keeps the vendor's name | `update()` / `refresh()` unchanged |
| A callback is named for its event | `onPage` → `onPageChange` |
| The `Ms` suffix rule | written down, **zero renames** |
| Callback argument order | written down, **zero renames** |

`naming-freeze.test.js` (22 tests) pins each word — including the old spellings being
*rejected*, not accepted.

## The four judgement calls

**Which direction for `label`.** The review found 6-vs-2; the cheap fix was to rename the
two. I renamed the six instead, because the platform settles the meaning (`<label>` is
visible, `aria-label` is explicitly the invisible variant) and because the traffic runs the
other way: all six renamed options have defaults or serve localisation, while
`bsButton.label` is the most-typed option in the toolkit. **Count the call sites, not the
declarations.**

**Where to stop.** `closeLabel`, `togglerLabel`, `spinnerLabel` and the control-band `label`s
are accessible names too, so consistency argued for `closeAriaLabel`. I stopped: the
top-level ambiguity was *demonstrated*, a sub-part's is *hypothetical* — a `.btn-close` draws
its glyph in CSS, so there is no visible text for `closeLabel` to be confused with. Three
uglier names for no measured problem is not a freeze, it is churn. Recorded in the ADR as a
decision so the next reader does not take it for an oversight.

**Whose word wins for auto-dismiss.** Bootstrap's `{autohide, delay}` or the engine's
`autoHideMs`. The engine, because ADR-0038 already settled the direction of composition
(`bsAlert` *is* the F49 engine in a costume) and because `inlineAlert` lives on `/dom` and
cannot borrow a design system's vocabulary it has no dependency on. The pair still exists —
in the config handed to Bootstrap's constructor, which is the one place it belongs.

**Which sense of `update()` to keep.** The 3-vs-2 count says rename the reposition sense.
The count is the wrong tiebreak: the reposition sense is *inherited* — Bootstrap and Popper
both call it `update`, and ScrollSpy calls its own `refresh` — and a wrapper that renames the
vendor's method makes the vendor's documentation wrong about our surface. So the data sense
moved, and it split into three honest names rather than one vague one: a collection is
`setData`, a scalar is `setValue`, a read model is `setView` (the word `TableView` and
`formatStatus(view)` already use).

## The rule that cost nothing

The `Ms` suffix looked like drift and was not. **A duration carries `Ms` unless its name is
already a duration.** `delay`, `interval`, `timeout`, `maxWait` can only be lengths of time;
`autoHide`, `minVisible`, `debounce` are a behaviour, a state and a technique, so a bare
number beside them says nothing. That explains 100% of the existing surface, requires no
rename, and is why `autoHideMs` — not `autoHide` — was the right name in §2.

Worth remembering as a review habit: before renaming for consistency, check whether the
inconsistency is already a rule nobody wrote down.

## Why the order mattered

Doing this before 17.7 would have been actively harmful. Every rename here is an option key
or a method name, and on the previous release a stale `bsIcon({ label })` would have silently
produced an unnamed icon — the rename would have *created* the failure mode the review was
trying to remove. With 17.7 landed it is `TypeError: unknown option 'label'`, and a stale
method call is `list.update is not a function`. The review's suggested order earned its keep.

## Where the project stands

M17: 17.1, 17.7, 17.8 done; 17.2–17.6 and 17.9–17.13 open. Two changesets pending,
`[Unreleased]` carries both breaking notes. ADRs through 0048, next free 0049. Every gate
green: **2305 tests**, 100% lines / 99.29% branches, all 98 size rows (**zero size change** —
renames are renames), publint, attw, agadoo, zero-deps, TypeDoc, api-floor, consistency lint.

## How the next session resumes

1. Wait for this PR to merge (one item per PR).
2. **17.9** is next by the review's order — the instance contract: `show()` return types,
   use-after-`destroy()` (including `bsProgress`, which still writes to a detached node), and
   the member matrix (`element` 12/15, `on()` 7/15, `instance()` 5/15, `isShown()` 2/15 and
   absent from `bsModal`). It also inherits one loose end from this item: `bsToast` accepts a
   `document` override while `bsPagination` and `bsTable` — both container-taking — do not.
3. 17.2 remains independent of every review item, if the runtime floor is wanted first.
