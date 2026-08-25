# 2026-08-25 — Promise-based dialogs, and an eleventh entry (roadmap 20.1)

## What got done

- **`egl-utils-js/ui`** — the eleventh entry, and the two decisions spec 07 deferred to this
  item: its **name**, and the **shape** of the dialog surface. Both fixed by
  [ADR-0071](../../adr/0071-a-manager-not-three-globals-and-a-dismissal-is-an-answer.md).
- **`createDialogs`** (F101–F103): a manager with `confirm`, `prompt`, `open` and `destroy`,
  built on the F70 modal wrapper, the F55/F56 buttons and the F109 focus primitives — none of
  them reimplemented.
- 59 unit tests plus a three-engine Playwright suite; `ui-dialogs.js` at 100% statements,
  branches, functions and lines.
- NFR-22 **re-derived a second time** (57 kB, eleventh input, 57 278 B), the artifact row
  re-pinned to 42 kB, and four transfer routes re-measured.
- Wiring for a new entry, which is eleven files and easy to half-do: exports map, tsup, typedoc,
  `global.js`, the artifact assert, the composed-namespace test, size rows, transfer budgets,
  both browser fixtures, and the no-bundler route assertion.

## The two questions spec 07 left open

**A manager, not three free functions.** The tempting shape is `confirm`/`prompt` as module
exports — it is what `window.confirm` trained everyone on. Three things ruled it out, and only
the first is decisive: spec 07 §6 requires a `destroy()` that settles a dialog open *now*, and a
function that has already returned a promise has nowhere to hang one. Then: thirteen shared
options that want defaulting once rather than repeating per call site, and the fact that
`import { confirm }` **shadows the platform's own global** at every import site that uses it.
Sugar functions over the manager were considered and rejected for the reason ADR-0048 exists —
two shapes for one capability is where drift starts.

**The entry is `/ui`**, the name spec 07 proposed and this PR froze, because an `exports`-map
path is MAJOR-protected the moment it ships. The boundary is testable rather than aesthetic:
`/bootstrap` **builds** components, `/ui` **orchestrates** them, and a symbol belongs here if it
would still make sense with a different component library underneath.

## What the browsers found

The three-engine suite was not a formality. **On WebKit the first Tab press moved focus out of
the dialog.** The cause was a documented design choice meeting an undocumented assumption:
ADR-0070 gave `focusTrap` a deliberately narrow scope — Tab only, listening on its own root, no
document-level `focusin` guard — and justified part of that narrowness by saying the one case
needing more, a modal dialog, was *"already covered by the component that owns that case."*
WebKit says Bootstrap does not reliably cover it: focus was still on `<body>`, so the keydown
never reached the trap's root.

Two ways to fix it, and the choice generalises. Widening the primitive would make every consumer
of `focusTrap` pay for one component's problem, and would reintroduce exactly the behaviour
ADR-0070 refused (fighting focus moved by assistive technology). Having the **composing
component** place focus where its own contract needs it is one line. So the dialog focuses
itself on `shown` — and ADR-0070's decision stands unchanged while its justification is amended.

The rule for the rest of the wave: **if you put a trap around a region, place focus inside it
yourself.** Do not trust whatever drew the region to have done it.

Two Bootstrap 5.3 facts were verified against the installed source rather than assumed, because
F103 depends on both: `{ focus: false }` disables Bootstrap's own trap entirely
(`if (this._config.focus)`), and focus restoration is registered **only** by its data-API click
handler — *"only register focus restorer if modal will actually get shown"* — so a
programmatically shown modal gets none. Both halves of F103 therefore have to be ours.

## Two smaller decisions worth their comment lines

**Where the synchronous/asynchronous boundary sits.** Everything up to `show()` runs outside the
promise. A content value the library will not render — markup without a sanitizer, an object
where a string belongs — is a programming error and throws where the caller is (ADR-0049);
building inside the executor would have turned every one of those into a rejection the caller
then has to tell apart from a missing peer, which is the one distinction F102 exists to protect.

**A dismissal that beats the entrance transition settles at once.** Bootstrap's `hide()` returns
without emitting anything while a show is in flight, so routing that case through `hidden` would
leave the promise pending for good. There is no exit animation because there was no entrance to
reverse — and the first version of this code had the bug, found by an async-transition test that
had been passing for the wrong reason.

## What the eleventh entry cost

Recorded because these are the numbers that otherwise drift:

| | before | after |
|---|---:|---:|
| `/ui` size-limit row | — | 5 163 B |
| `/bootstrap` size-limit row | 24 518 B | 24 527 B |
| `/dom` size-limit row | 7 481 B | 7 483 B |
| artifact (size-limit) | 39 609 B | 41 119 B |
| `/bootstrap` served, deep ESM | 41 671 B / 8 req | 44 278 B / 10 req |
| `/dom` served, deep ESM | 14 971 B / 8 req | 15 495 B / 9 req |

`/bootstrap` and `/dom` gained **9 B and 2 B without one line of their source changing** —
esbuild re-split the shared chunks around a new consumer of them. Their deep-ESM routes paid far
more, because that route downloads whole files rather than tree-shaken ones. That gap is the
whole reason spec 05 F87 counts served bytes separately, and it sharpens advice the README
already gave: a page needing `/bootstrap` should take the single-file artifact, now 3 kB smaller
over one request than the deep route is over ten.

Also found: the `/bootstrap` size row's prose still said 24 406 B, stale by 112 B since 20.5 —
which had recorded the true figure in the *artifact* row and not in `/bootstrap`'s own. Re-read
from the build and corrected.

## One item filed rather than folded in

Verifying the browser half turned up something that is not 20.1's to fix: **the Playwright
suite flakes under local parallelism**. A full chromium run fails 2 of 142 tests on `main` and
3 of 150 with this branch applied — a different pair every time, each passing on a re-run in
isolation. So it is contention, not a defect: the suite is `fullyParallel` with one worker per
core, and every worker asks the repo's minimal static server for Bootstrap's bundle and
stylesheet once per test.

This PR removed its own share (both assets are read from `node_modules` once and injected as
content, and the file's timeout is doubled with the measurement that earned it), which fixes
one file rather than the cause. The rest is **20.7**, filed per AGENTS.md §10. Worth knowing
that the baseline was measured rather than assumed: stashing the branch and re-running proved
the flake predates it, which is the difference between filing an item and chasing a ghost.

## One spec typo, fixed in passing

Spec 07 called the modal wrapper **F73** twice (in F101 and §4). F73 is `bsAccordion`; the modal
is **F70**. Corrected here rather than inherited by the code that cites it.

## Where the project stands

v1.2.0 released. M20 in progress: 20.5 and 20.1 done, 20.2–20.4 and 20.6 open. `.changeset/`
holds two minor entries (20.5, 20.1); `[Unreleased]` has both. ADRs through 0071, next free 0072.
Every gate green.

## How the next session resumes

1. Wait for this PR to merge (one item per PR).
2. **20.2** is the natural next item — the toast manager over F69 — and it inherits a settled
   shape from this one: a `create*` factory returning an instance the caller owns and destroys,
   options merged defaults-then-overrides with `undefined` meaning *not said*, unknown keys
   rejected, and a `destroy()` that settles rather than abandons what is outstanding. It lands on
   `/ui`, adding no new `exports` path.
3. 20.4 and 20.6 are the two that still owe an api-floor amendment (`matchMedia` and
   `MediaQueryList` change events, spec 07 NFR-34). 20.1 needed none — every platform API it
   touches was already inventoried.
