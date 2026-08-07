# 2026-08-07 — The controls bridge, and spec 03 delivered (13.2)

## What got done

Roadmap **13.2**: `bindTableControls` in `/dom` (`dom-table.js`, spec 03 F51) — the only
bridge between the two halves of the tabular wave, and the last of spec 03's F-items.

- Filter and search inputs are debounced (F7) into public commands; sort headers share
  **one** delegated listener (F44) and receive `aria-sort`; pagination controls are enabled
  from the derived view; a page-size control accepts a blank value as "stop paginating".
- The binding holds **no state**: the page for a *next* click is read back from
  `pipeline.view()`. That is what keeps the pipeline server-usable and lets one instance be
  derived during SSR and adopted by the browser afterwards.
- **Teardown is structural** (NFR-15): one internal `AbortController` detaches every
  listener, cancels every in-flight debounce and unsubscribes from the pipeline. An aborted
  caller signal does the same; an already-aborted one binds nothing.
- 27 jsdom tests + 5 real-browser scenarios. `dom-table.js` at 100% lines **and** branches;
  the whole library is now at 100% branches.
- [ADR-0035](../../../adr/0035-the-controls-bridge-and-the-dom-budget.md); patterns
  catalogue row 14 (**Mediator** — neither the controls nor the pipeline reference each
  other).

## Three decisions the pre-implementation clause had left open

**Reflection is one-way for text inputs.** Sort headers and pagination reflect state back;
filter and search inputs never do. A control that rewrites the field its user is typing in
fights its own user — cursor position, IME composition and all.

**The pagination wording is injected, and the default has no words.** `formatStatus(view)`
defaults to `'1 / 4'`. A default reading "Page 1 of 4" would ship an English string into
every consumer's UI, which is exactly the hardcoded-policy failure this wave exists to
undo. Spec 03 F51's option list is amended in the same PR rather than diverging silently.

**A selector matching nothing throws**, naming every miss at once. Passing a selector
asserts the control exists; a typo that silently disables a filter box is the defect
`bindElements({strict})` was built to catch.

## The browser gap is closed

M11 and M12 shipped browser-relevant behaviour with **no browser test at all** — the
fixture did not even load `/dom` or `/table`. 13.2 loads both and adds five real-engine
scenarios: filtering through real typing, the sort cycle publishing `aria-sort` as the
accessibility tree sees it, pagination disabling at the ends, one delegated listener
surviving a full re-render — **and the F50 focus save/blur/restore case 12.2 owed**, since
real focus traversal is precisely what jsdom cannot establish. All 30 pass on Chromium.

One observation for the future: `pageSessionId survives a reload but differs between tabs`
failed once under parallel load and passed in isolation and on re-run (it took 14.5 s that
time). Timing-sensitive, not broken — worth watching rather than fixing blind.

## Budget: measured, then amended (third time, same rule)

`/dom` measured **4718 B** against a 4 kB clause once F51 pulled the F7 `debounce` onto the
entry; `{ bindTableControls }` **2093 B** against an indicative 1.75 kB. The tempting trim
was a private debounce inside the binding — refused: F7 is a shipped, tested primitive
whose `cancel` semantics NFR-15 depends on, and duplicating a subset to protect a byte
estimate is the inversion of ADR-0031's lesson. Clause amended to **5 kB**, rows pinned at
measured+7%.

## Where the project stands

**Spec 03 is delivered**: F42–F51 all implemented, and its coverage rows §1/§2/§4/§5/§6 are
✅. §3 stays 🚧 for one reason — **13.3 is still open**, so M13 is not complete and v0.6.0
cannot be cut yet under the one-MINOR-per-milestone policy.

13.3 is the bench-gate blind spot 13.1 found: `tools/bench-regression.mjs` only collects a
group whose benchmark name starts with `egl `, so every absolute suite runs in CI and is
discarded. It is a verification fix, not a feature, and the owner may reasonably renumber
it out of M13 to release now. ADRs used through **0035**, next free **0036**.

## How the next session resumes

1. Wait for this PR to merge.
2. Decide 13.3: implement it (fix the collector, re-record `baseline.json` on comparable
   hardware — **not** on this workstation) or move it out of M13.
3. Then **cut v0.6.0** (changesets Version PR off `changeset-release/main`, restore the
   Keep-a-Changelog skeleton by hand, write `docs/changelog/v0/v0.6.0.md` **and**
   `docs/releases/v0.6.0.md` in the same commit, then tag).
4. Then **PR #0c**: spec 04 + M14–M16 planning — the full 24-component Bootstrap 5 toolkit
   on a `/bootstrap` subpath, built on top of everything specs 02 and 03 now provide.
