# ADR-0071: A manager, not three globals — a dismissal is an answer, and an eleventh entry

- **Status:** Accepted
- **Date:** 2026-08-25
- **Deciders:** Daniel Polo
- **Related:** [spec 07](../specs/07_spec_application_ux.md) §2 F101–F103, §4 (the two
  questions it deferred to this item), §5 (the entry name it proposed rather than froze),
  NFR-31/NFR-32/NFR-33/NFR-35/NFR-36; ROADMAP 20.1;
  [ADR-0070](0070-two-primitives-extracted-and-a-ceiling-recomputed.md) (the F109 primitives
  this composes, and the trap's documented scope — amended in practice here),
  [ADR-0041](0041-a-peer-looked-up-not-imported.md) (the 25 kB `/bootstrap` clause that sent
  this wave to a new entry, and the lazy-peer contract the dialogs inherit),
  [ADR-0031](0031-component-instances-and-the-alert-budget.md) and
  [ADR-0027](0027-logging-formatter-sink-split.md) (the two Singleton rejections this
  decision is the third instance of), [ADR-0047](0047-an-unknown-option-key-is-a-typeerror.md)
  (the option contract every bag here keeps), [ADR-0048](0048-one-word-one-meaning.md)
  (`label` visible, `ariaLabel` accessible),
  [ADR-0049](0049-commands-throw-queries-answer.md) (use-after-`destroy()`, and who a
  diagnostic names), [ADR-0059](0059-one-file-one-global-and-a-budget-that-means-something.md)
  and [ADR-0061](0061-two-honest-numbers-and-a-route-that-must-be-listed.md) (the artifact
  clause-versus-row split this re-derives again)

## Context

Spec 07 fixed the *observable* contract for promise-based dialogs and deliberately deferred
two things to the item that implements them (§4, §5): **what shape the surface has** — free
functions per dialog kind, or a manager instance that mints them — and **what the new entry
is called**, since an `exports`-map path is MAJOR-protected the moment it ships.

Three forces set the answers, and a fourth arrived from a browser.

**The `/bootstrap` entry had run out of room, arithmetically.** ADR-0041 sized its clause at
25 kB *for the finished catalogue*; the catalogue is finished and measures 24 518 B, leaving
482 B. `bsModal` and `bsToast` alone — the two components this wave wraps — measure 1 266 B
and 2 473 B. So the wave does not fit, no care makes it fit, and the clause is not the wrong
size (spec 07 NFR-32). A new entry was forced, which is why the naming question could not be
postponed past the first item.

**The interaction being replaced is a callback pair.** `askUser(message, onOk, onCancel)`
reads acceptably once and stops composing immediately: two questions in sequence nest, a
question inside a `try` cannot use the `catch`, and the answer arrives somewhere other than
where it was asked for. A dialog is a question with one answer arriving later, which is what
a promise *is*.

**The failure mode a promise introduces is worse than the one it removes**, if the wrong
thing rejects. `confirm()` that rejects on Cancel makes "the user said no" arrive in the same
channel as "there is no Bootstrap on this page" — and the `catch` that logs the second will
log the first, forever, in every application that adopts it.

**And a real engine disagreed with an assumption.** ADR-0070 gave the F109 trap a
deliberately narrow scope — Tab only, listening on its root, no document-level `focusin`
guard — and justified the narrowness partly on the grounds that *"the one place it is clearly
right — a modal dialog — is already covered by the component that owns that case."* The
three-engine suite for this item says otherwise on WebKit. See decision 5.

## Decision

**1. The surface is one factory returning a manager: `createDialogs(options?)`.** Its
methods are `confirm(message, options?)`, `prompt(message, options?)` and `open(options)`,
each returning a promise, plus `destroy()`.

Three reasons, in the order of how much they decided it:

- **`destroy()` needs an owner.** Spec 07 §6 requires a test for *"a `destroy()`
  mid-dialog"*, and a free function that has already returned a promise has nowhere to hang
  one. A dialog left open with an `await` on the other end of it is a leak, and the manager
  is what can answer it.
- **The shared options are thirteen** — labels, variant, size, centred, dismissible,
  backdrop, keyboard, class, html, sanitize, bootstrap, document, signal — and a page asks
  its questions in one costume. Defaults want somewhere to live; per-call overrides win over
  them, and `undefined` means *not said* rather than *off*.
- **`confirm` and `prompt` as module exports would shadow the platform's own globals** at
  every import site that used them. `import { confirm } from 'egl-utils-js/ui'` is a
  same-name replacement for a global with different semantics — the kind of collision that
  reads fine on the import line and confuses everyone who later reads the call.

It also satisfies NFR-35 by construction: no module-level mutable state, two managers on one
page share nothing, and the suite constructs two and asserts they cannot observe each other.

**2. The entry is `egl-utils-js/ui`** — the name spec 07 §5 proposed, now frozen. The
boundary that justifies it is spec 07 §4's, and it is testable rather than aesthetic:
`/bootstrap` **builds** components, `/ui` **orchestrates** them, and a symbol belongs here if
it would still make sense with a different component library underneath. A dialog that
resolves a promise would; `bsBadge` would not.

**3. A dismissal is an answer; only "could not be asked" rejects.** Escape, the backdrop, the
close control, the cancel button, an aborted signal and `destroy()` all **resolve** — `false`
for a confirm, `null` for a prompt, the caller's `dismissValue` for `open`. A rejection means
the question never reached anyone: `EGL_DOM_CONTRACT` (no document) or `EGL_PEER_MISSING` (no
Bootstrap). No new error code, because neither of those is a new failure.

Two consequences worth naming, because they are the parts that are easy to get subtly wrong:

- **The answer is recorded before anything starts closing.** A button press sets the answer
  thunk and *then* asks the dialog to close, so a dismissal racing behind it finds the answer
  already chosen. Exactly-once stops depending on transition timing, and the suite proves it
  by **counting** settlements rather than by inspecting the value — a double-resolve is
  invisible from the value.
- **A shape violation still throws, synchronously.** Everything up to `show()` runs outside
  the promise: markup without a sanitizer, or an object where content belongs, is a
  programming error and lands where the caller is (ADR-0049). Building inside the executor
  would have turned every one of those into a rejection the caller then has to tell apart
  from a missing peer — which is the one distinction decision 3 exists to protect.

**4. `null` for a dismissed prompt, and the field's value untrimmed.** `null` stays
distinguishable from the empty string a user may legitimately have entered, and trimming is a
decision about the caller's data, not this library's.

**5. The dialog places focus itself, and ADR-0070's trap keeps its narrow scope.** On
`shown`, `/ui` focuses the dialog element — or, for a prompt, its field. Bootstrap already
focuses `this._element`, so this looks redundant, and on WebKit it is not: with Bootstrap
left to do it, **the first Tab press moved focus out of the dialog on WebKit**, because focus
was still on `<body>` and the F109 trap listens on its root by design. Two candidate fixes,
and the choice matters beyond this item:

- widen the primitive with a document-level `focusin` guard — which ADR-0070 rejected for
  reasons that have not changed, and which would make every consumer of `focusTrap` pay for
  one component's problem;
- have the **composing component** put focus where its own contract needs it — which is one
  line, keeps the primitive's scope exactly as documented, and is what F103 promises anyway.

The second. ADR-0070's *justification* is amended (Bootstrap does not reliably cover the
modal case), its *decision* stands unchanged. The dialog, not its affirming button, because
focus on a button means Enter agrees to the question — not a default anything destructive
should have.

**6. Focus restoration rides the trap, and F103 is one mechanism rather than two.**
`focusTrap` composes `saveFocus` (ADR-0070), so installing the trap **before** `show()`
captures the element the user was actually on, and releasing it on settlement puts focus
back. It is also required rather than merely tidy: verified against Bootstrap 5.3's source,
focus restoration is registered only by its **data-API click handler** (*"only register focus
restorer if modal will actually get shown"*), so a programmatically shown modal gets none —
and `{ focus: false }`, a legal passthrough, disables Bootstrap's own trap entirely
(`if (this._config.focus)`). F103 has to hold for both, so both halves are ours.

**7. A dialog is always named, with no option to forget.** `aria-labelledby` points at the
title where there is one and at the **question itself** where there is not, so NFR-21/NFR-36
are satisfied without an `ariaLabel` option that can be omitted. Bootstrap owns `role` and
`aria-modal`; naming is the half it does not do. The prompt's `<label for>` is the same idea:
the question labels the field, rather than a message and an `aria-label` that can disagree.

No live region. NFR-36 asks that a state change be announced, and a modal dialog announces
itself through the platform mechanism — a named `role="dialog"` with focus moved into it. An
F110 announcer on top would say it twice.

**8. An unanswerable dialog is refused.** `open({actions: [], dismissible: false, keyboard:
false, backdrop: 'static'})` has no button, no close control, no Escape and no dismissible
backdrop: the `await` never returns and the page sits behind a modal it cannot close. That is
the empty focus trap of ADR-0070 wearing different clothes, and it gets the same treatment —
name the case rather than let it be discovered.

**9. NFR-22 is re-derived a second time, to 57 kB, and the row is re-pinned to 42 kB.** The
same method spec 05 used — the sum of the measured entry figures, an upper bound on a
deduplicated single file — now has an **eleventh input** and reads **57 278 B**: `root`
6 103, `/storage` 2 104, `/sanitize` 1 491, `/text` 924, `/net` 770, `/table` 6 861,
`/logging` 1 475, `/dom` 7 483, `/bootstrap` 24 527, `/errors` 377, `/ui` 5 163. Spec 07
NFR-33 required the recomputation rather than a bigger number, and ADR-0059's split holds:
the clause is an authoring bound with slack, the size-limit row is the gate.

**10. What the eleventh entry cost the entries that did not change.** Recorded because it is
the sort of number that otherwise drifts silently: `/bootstrap` moved **+9 B** and `/dom`
**+2 B** without one line of their source changing, because esbuild re-split the shared
chunks around a new consumer of them. The deep-ESM routes paid much more —
`/bootstrap` 41 671 → **44 278 B** and 8 → **10 requests**, `/dom` 14 971 → **15 495 B** and
8 → **9** — because that route downloads whole files rather than tree-shaken ones. That is
exactly what spec 05 F87 exists to keep visible, and it sharpens the advice already on the
`/bootstrap` row: a page needing that entry should take the artifact, which is now 3 kB
smaller over one request than the deep route is over ten.

## Alternatives Considered

- **Three free functions, `confirm`/`prompt`/`dialog`.** Simplest to import and the shape
  most callers would guess. Rejected for the three reasons in decision 1, of which the
  decisive one is mechanical rather than aesthetic: spec 07 §6 requires a `destroy()` that
  settles a dialog open *now*, and a returned promise has nowhere to put it. Thin sugar
  functions *over* the manager were also considered and rejected — two shapes for one
  capability is the drift ADR-0048 was written to stop, three months after it was written.
- **A rejected promise for Cancel**, matching `window.confirm`'s ergonomics more closely by
  making the negative path exceptional. Rejected: it puts "the user said no" in the same
  channel as "there is no Bootstrap here", and F102 exists precisely to keep those apart. It
  also makes the common case an exception, which every linter and every reviewer then has to
  be told to ignore.
- **A `dialogs()` factory named after its return value**, matching `tablePipeline()`,
  `liveRegion()` and `loadingOverlay()`. Rejected on one practical ground: the natural
  variable name at the call site *is* `dialogs`, and a factory that cannot be assigned to the
  obvious name is a factory every consumer renames. `createResource` is the house precedent
  for a `create*` factory, and this wave's remaining managers (20.2–20.4) inherit the same
  prefix so the entry reads as one family.
- **Widening `focusTrap` with a document-level `focusin` guard**, which is what Bootstrap's
  own modal does and would have fixed the WebKit case inside the primitive. Rejected per
  decision 5: it makes every consumer of a general primitive pay for one component's
  problem, and it fights focus moved by assistive technology — the reason ADR-0070 refused it
  in the first place.
- **An F110 live region announcing "dialog opened".** Rejected per decision 7: a named
  dialog with focus in it is already announced by the platform, and a second announcement is
  a worse experience, not a more thorough one.
- **Raising NFR-22 to a round 64 kB** rather than recomputing. Rejected — spec 07 NFR-33
  forbids exactly that, and it is the clause's whole point: the ceiling means something only
  while it is derived.

## Consequences

- **The public surface goes from 126 exports across 10 entries to 127 across 11**, one new
  export (`createDialogs`) and one new exports-map path (`./ui`). Nothing existing changed
  name, signature, option or code — NFR-31's additive-only clause holds, and the inventory
  above is what proves it.
- **`./ui` is MAJOR-protected from now on**, which is why the name was an ADR rather than an
  implementation detail. 20.2–20.4 land on it and add no further paths.
- **20.2–20.4 inherit a settled shape**: a `create*` factory returning an instance the caller
  owns and destroys, options merged defaults-then-overrides with `undefined` meaning *not
  said*, unknown keys rejected, and a `destroy()` that settles rather than abandons whatever
  is outstanding.
- **The trap's documented scope is now load-bearing knowledge for every composing
  component**, not just this one: if you put a trap around a region, place focus inside it
  yourself rather than trusting whatever drew the region to do it.
- **Bootstrap 5.3 internals are relied on in one place and one place only** — that
  `{ focus: false }` disables its trap, and that its focus restorer is data-API-only. Both
  were verified against the installed source rather than assumed, both are quoted in the
  code comment that depends on them, and neither is a call into a private API: the dialog
  simply does the work itself in both cases.
- **The artifact clause has 16 kB of slack now** (57 kB against 41 063 B served), which is
  more than it had at 20.5 and by design: the clause is an upper bound that double-counts
  shared chunks, and each new entry widens the gap it was always meant to have.
- **One spec cross-reference was wrong and is fixed here**: spec 07 called the modal wrapper
  F73 twice (F101 and §4); F73 is `bsAccordion` and the modal is **F70**. A typo, corrected
  in the same PR as the code that would otherwise inherit it.

## References

- [spec 07](../specs/07_spec_application_ux.md) §2 F101–F103, §4, §5, §6, NFR-31–NFR-36.
- [spec 05](../specs/05_spec_browser_distribution.md) NFR-22, re-derived here for the second
  time.
- [spec 04](../specs/04_spec_bootstrap_toolkit.md) F70 (`bsModal`), F55/F56 (the buttons).
- Bootstrap 5.3 `modal.js`: `if (this._config.focus) this._focustrap.activate()`, and the
  data-API `EVENT_HIDDEN` handler commented *"only register focus restorer if modal will
  actually get shown"* — the two facts decision 6 rests on.
- `src/test/browser/ui-dialogs.spec.js` — the three-engine suite that found the WebKit focus
  case decision 5 answers.
