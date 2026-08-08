# 2026-08-09 — A controller from the node's own realm, and M16 closes (roadmap 16.5)

## What got done

- **BUG-0003 fixed** by one seam, `controllerFor(node)` on `dom-helpers.js`
  ([ADR-0045](../../../adr/0045-a-controller-from-the-node-s-own-realm.md)): a
  listener-owning export now builds its `AbortController` from the target's own view, so
  `addEventListener`'s per-realm brand check accepts the signal.
- **Seven call sites, not three.** The record named `bsAlert`, `bsPagination` and
  `bsListGroup({onSelect})`; grepping found those plus `bsTable`'s row delegation,
  `inlineAlert`, `delegate` and `autoGrow`.
- The pinned known-failure test is flipped, a stale comment in the Node-safety suite is
  gone, and `controllerFor` has its own unit suite. 2209 tests, global 100% lines,
  `dom-helpers.js` 100% across the board. No budget moved.
- **M16 is complete, and with it the whole M14–M16 Bootstrap wave**: spec 04's F52–F81
  delivered, the 24-component catalogue closed in 16.4, its last known defect closed here.

## Decisions taken

- **One seam rather than seven inline fixes.** The trap is structural: every future
  listener-owning export inherits it, and inherits it *silently*, because the failure only
  shows on the least-travelled path. Same reasoning as ADR-0042's ids — ask the node where
  it lives instead of assuming there is one answer.
- **The fallback is a correct answer, not a last resort.**
  `document.implementation.createHTMLDocument()` has no browsing context and no
  `defaultView`, and its nodes are local already, so one code path serves both the detached
  document and the genuinely foreign one.
- **No browser test.** Browsers accept cross-realm platform objects here, so a Playwright
  case would have passed *before* the fix too. A test that cannot fail is not evidence, and
  writing that down is worth more than the green tick.

## Findings worth carrying forward

- **A bug report is scoped by the test that found it, not by the code.** BUG-0003 was
  filed from the NFR-18 suite and named exactly the three components that suite exercised.
  The grep found seven. Fixing to the report would have left four live instances of the
  same defect — so the first step of a bug fix is re-deriving the scope from the source.
- **"Does not throw" is not proof for a listener.** The regression test dispatches a real
  event in the foreign realm and asserts the handler ran, then destroys and asserts it
  stopped. A controller nobody rejected and nobody used would have passed the weaker
  assertion perfectly.
- Two stale statements were removed from the suite along with the fix: the pinned failure
  and a comment explaining why an interactive builder could not be exercised in Node. When
  a workaround goes, the prose that justified it has to go with it, or the next reader
  believes a limitation that no longer exists.

## Where the project stands

**All milestones M1–M16 are complete.** Specs 01–04 are fully delivered; the Bootstrap 5
catalogue is closed at 24/24 with 29 exports. ADRs through **0045, next free 0046**. Local
Firefox still cannot launch; Chromium and WebKit green.

**Nothing is left in the plan that is more code.** What remains are two owner decisions:

- **The release backlog** — v0.7.0 is still the published version and **seven changesets
  are pending** (15.1, 15.2, 16.1, 16.2, 16.3, 16.4, and this patch), covering M15 and all
  of M16. Under the documented one-MINOR-per-milestone policy that is v0.8.0 and v0.9.0;
  batching them is a deviation to record rather than to assume.
- **v1.0.0** — the arc the plan was written for is finished. What a 1.0 needs beyond what
  exists is a decision about the surface, not more surface.

## How the next session resumes

1. Wait for this PR to merge.
2. Cut the pending releases, in whichever shape the owner chooses. The mechanics are in
   `docs/workflow/release.md`, and the v0.5.0 notes in the journal record the manual steps
   `changeset version` still needs (restore the Keep-a-Changelog skeleton, write both
   `docs/changelog/v0/vX.Y.Z.md` and `docs/releases/vX.Y.Z.md` in the same commit).
3. Anything after that is new scope: a spec 05 (the `bsTable` extras already catalogued as
   backlog — CSV export, sticky headers, column resize), or the 1.0 review.
