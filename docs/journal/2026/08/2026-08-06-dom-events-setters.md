# 2026-08-06 — Delegation, setters, and an amended NFR-14 (roadmap 11.2)

## What got done

- **`delegate`** (F44) and **`setEnabled` / `setVisible` / `setValue`** (F45) on
  `egl-utils-js/dom`, in a new `dom-events.js` behind the existing barrel.
- 50 new tests, plus six added to the Node-safety suite; **1043 tests green** overall at
  **100% statements, branches, functions and lines**.
- [ADR-0029](../../../adr/0029-delegation-teardown-and-setter-symmetry.md) records the
  teardown decision, the setter-symmetry argument, and the eight alternatives weighed.
- Inventory gains a 28th entry for the `addEventListener` `{signal}` option — the one
  floor-adjacent API this item depends on.

## Decisions taken

- **Teardown is an internal `AbortController`, not a retained handler reference.** The
  listener registers with `{signal: internal.signal}`, so unsubscribe is one `abort()`:
  **idempotent by construction**, nothing to keep in sync, no `removeEventListener` argument
  triple to drift. A caller `signal` is bridged with `{once: true, signal: internal.signal}`
  so it cleans up in *both* directions — a long-lived component signal cannot accumulate a
  listener per short-lived binding.
- **An already-aborted signal attaches nothing**, rather than attaching and immediately
  removing: a spy on the root would otherwise observe one spurious registration for a
  subscription that was over before it began.
- **The handler receives the matched element**, not `event.target`. The target is the deepest
  node clicked — an icon inside a button, a `<span>` inside a row — and is almost never what
  the caller wants. That second argument is the difference between a delegation helper and a
  thin `addEventListener` alias.
- **`closest` plus an explicit `root.contains(match)` check.** `closest` climbs to the
  document, so without the check a selector like `'body'` matches an ancestor *outside* the
  delegated subtree.
- **Setters are no-ops on nullish, `TypeError` on a wrong type.** An absent optional element
  is a normal state; requiring `if (el)` at every call site is how those guards get
  forgotten.
- **`setVisible` drives one mechanism, never two** — the `hidden` attribute, or a given class
  *instead*. Driving both leaves an element that one mechanism hides and the other shows,
  with CSS specificity deciding. Because each call touches exactly one thing, hide and show
  always undo each other: a test asserts `outerHTML` is byte-identical after a round trip, so
  the classic stuck-element bug cannot be written with these.
- **`setValue` dispatches no event.** A plain assignment fires none natively; synthesising one
  would make the function behave unlike what it replaces and could re-enter the handler that
  called it. Documented, and pinned by a test.

## The spec correction

NFR-14 said *every* `/dom` export throws without a document. **11.1 already diverged from
that** — `bindElements(map, {root})` acts on the root it is given, and shipped with a test
asserting exactly that as a feature. `delegate(root, …)` and the setters are the same shape.

Amended in this PR to the accurate rule: an export that resolves the **ambient** document
throws when there is none; an export handed an explicit node needs no global document.
Requiring one a function never reads would be a check for its own sake — and would make these
unusable inside a server-side DOM implementation. Six Node-safety tests now prove the amended
contract in both directions.

Worth noting how this surfaced: not from a failing gate, but from writing the *next* item
against the spec and finding the previous one already outside its letter. A frozen spec is
only useful if divergence is corrected the moment it is noticed.

## Measurements

| Import | Measured | Row |
|---|---|---|
| `/dom` full entry | 1210 B (was 639 B) | 1.3 kB — re-baselined, inside NFR-12's 4 kB clause |
| `{ delegate }` | 392 B | 1 kB ✅ |
| `{ setValue }` | 299 B | 1 kB ✅ |
| `{ setVisible }` | 256 B | 1 kB ✅ |
| `{ setEnabled }` | 201 B | 1 kB ✅ |

## Lessons

- **The BCD lookup caught its own author.** The first draft of the `addEventListener`
  `{signal}` entry asserted Safari added it in *exactly* 15.4 — nothing to spare against our
  floor. It is **Safari 15** (and Node 15.4), comfortably below. A hand-typed version claim is
  the precise thing this inventory exists to prevent, and it took one run to expose.
- The correct BCD path was two levels deeper than guessed
  (`…addEventListener.options_parameter.options_signal_parameter`); enumerating the node's
  subkeys is faster than guessing at the shape.
- **The scanner cannot see members of parameters.** `root.addEventListener(...)` is invisible
  to a regex that matches `Global.member`, so a floor-adjacent API reached that way is
  governed only by a deliberate declaration. That asymmetry (documented in ADR-0028) is
  exactly where a hand-written inventory entry earns its keep.

## Where the project stands

Specs 01–02 complete (v0.3.0 tagged; **Release draft unpublished, nothing on npm**). Spec 03:
11.1 and 11.2 done, **11.3 next** (`injectFragment` with a mandatory caller-supplied
sanitizer, `autoGrow` behind an injected measure seam, `withUrlParams`), then M12 and M13.

⚠️ **GitHub Actions has processed no event for this repo since ~15:00** — 11.1 (#77) merged
to `main` with **no CI run at all**, and this branch will be the same until Actions recovers.
Every gate CI would run has been verified locally, with two exceptions it cannot cover
locally: the **Node 18/20/22 matrix** (this machine is Node 24) and the **Playwright browser
job**. Re-run CI on `main` once Actions is back.

## How the next session resumes

1. Wait for this PR to merge (one PR at a time), and check whether CI has resumed.
2. Roadmap **11.3** on `feat/dom-inject-fragment`: `injectFragment` (mandatory `sanitize`
   parameter — a sanitizer or literal `false`; errors propagate as `HttpError`), `autoGrow`
   (layout reads behind an injected `measure` seam, since jsdom has no layout), and
   `withUrlParams` (the double-`?` regression test). It needs a **threat-model update** for
   the untrusted-HTML boundary. Next free ADR number: **0030**.
