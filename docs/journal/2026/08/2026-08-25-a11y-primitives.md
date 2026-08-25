# 2026-08-25 — Two primitives, and a ceiling recomputed (roadmap 20.5)

## What got done

- **`focusTrap`, `saveFocus` and `liveRegion`** on `/dom` (spec 07 F109–F110). Surface 123 →
  **126 exports**, all additive.
- **`loadingOverlay` now calls `saveFocus`** instead of keeping its own copy — which is what
  makes this an extraction rather than a second implementation.
- **[ADR-0070](../../adr/0070-two-primitives-extracted-and-a-ceiling-recomputed.md)**, and
  **spec 05 NFR-22 amended in the same PR** with the recomputed derivation.
- 39 jsdom cases in a new `dom-a11y.test.js`, 5 Playwright cases, one api-floor entry.

## Half of it was an extraction and half of it was not

Spec 07 says F109 is "extracted from the F50 overlay". That is exactly half true, and the
distinction was worth getting right rather than glossing: the overlay has **focus
save/restore** and has never had a **trap**. So `saveFocus` is genuinely lifted out — and
`loadingOverlay` was rewired to call it, because the difference between extracting and
reimplementing is whether the original caller ends up using the new thing. `focusTrap`
composes it for its own restore half, so there is now one implementation of "put focus back
where it was" and three callers.

That deduplication **cost bytes**: `loadingOverlay` 1 063 → 1 127 B, and `bsLoadingOverlay`
moved with its composed part to 2 758 B. Paid on purpose — two copies of focus logic drift,
and only one of them gets fixed.

## The trap's most important property is what it refuses to do

A focus trap is a safety feature that becomes a hazard when it overreaches. The version most
libraries ship installs a document-level `focusin` guard and drags focus back from anywhere.
This one **does not**, and that is a decision rather than an omission: a `focusin` trap fights
the user's own browser — a screen reader's virtual cursor, dev tools, the address bar — and
the requirement is about keyboard navigation, which Tab is. `bsModal` brings Bootstrap's own
focus enforcement for the dialog case, so F101 gets a second layer without this primitive
having to be one.

The same restraint runs through the rest. Everything **between** the edges is the platform's
tab order, untouched, because a trap that reimplements it is a trap that gets it wrong. No
layout is read to decide what is tabbable — a forced layout per Tab press is the cost F98
refused and every item since has inherited — so the four states the DOM answers for free do
the filtering and the CSS-hidden case is documented as the caller's.

And the case spec 07 put in the requirement: **a root with nothing focusable focuses itself**,
under a temporary `tabindex="-1"` removed on release, with Tab held rather than cycled. There
is nothing to cycle to; cycling is how a trap becomes a lock.

## WebKit does not Tab to links

The first browser run failed on Safari's engine, and it was not the trap. **WebKit does not
move Tab focus to links by default** — that is a user preference ("press Tab to highlight each
item"), off out of the box. A fixture containing an `<a href>` therefore asserts Safari's
preference rather than this code.

The fixture is form controls now, with the reason written beside it. Nothing was lost: the
unit suite still pins that the trap lists a link with an `href` and skips one without, and an
engine that never Tabs to a link never reaches it, trap or no trap.

## The ceiling arrived from the direction nobody was watching

ADR-0069 left 1 102 B under NFR-22's 40 kB and named ADR-0041's `/bootstrap` clause as M20's
tighter constraint. It was right about the pressure and wrong about which ceiling would bind
first: **20.5 does not touch `/bootstrap` at all**, and it still took the artifact to 39 696 B.

Spec 07 NFR-33 had already fixed the terms — recompute the derivation, never raise the number
— so this item did the arithmetic. Spec 05 derived 40 kB as the **sum of the measured entry
figures**, an upper bound on a deduplicated single file. The same method today:

| root | /storage | /sanitize | /text | /net | /table | /logging | /dom | /bootstrap | /errors | **sum** |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 6 103 | 2 104 | 1 491 | 924 | 770 | 6 861 | 1 475 | 7 481 | 24 518 | 377 | **52 104** |

≈ 39.8 kB at M18, **52 104 B** now; two waves of surface are the whole difference. So the
clause becomes **52 kB**, and the artifact at 39 696 B sits twelve kilobytes under it — which
is the deduplication the derivation always assumed.

A clause with 12 kB of slack does no per-PR work, so the **size-limit row stays the gate**,
pinned at measured + 2%. That is exactly the split ADR-0041 already made for `/bootstrap` — a
clause sized for the finished thing, a row sized for this PR — applied to the artifact for the
same reason. Worth noticing: the honest recomputation produced a **larger** bound than an
ad-hoc bump would have, and it is defensible precisely because nobody chose the number.

## Verified

2 859 tests at 100% lines; `dom-a11y.js` and `dom-components.js` both at 100% branches, after
deleting one dead `??` fallback rather than mock-covering it (an Element always has an
`ownerDocument`). Chromium and WebKit pass all 5 browser cases — the ones jsdom cannot answer,
since it implements no sequential focus navigation at all, so a real Tab decides where focus
goes. `check:package`, F87 transfer budgets, api-floor (49 APIs), `docs:api`, redos, lint,
format and the consistency lint green.

## How the next session resumes

1. Wait for this PR to merge (one item per PR).
2. **20.1** is the natural next item and the reason 20.5 came first: F101–F103's focus
   behaviour is defined in terms of what now exists, so the dialogs compose `focusTrap` and
   `saveFocus` rather than growing their own. 20.1 also still owns the two decisions spec 07
   deferred — the dialog surface shape, and the new entry's name and packaging.
3. A follow-up worth filing when someone touches it: `bsTable`'s F100 keyboard reorder can now
   announce through `liveRegion`. Not folded in here — that is a change to a shipped
   component, and this item is the primitive.
