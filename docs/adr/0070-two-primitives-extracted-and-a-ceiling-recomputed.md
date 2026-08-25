# ADR-0070: Two primitives extracted, a trap that knows what it does not do, and a ceiling recomputed rather than raised

- **Status:** Accepted
- **Date:** 2026-08-25
- **Deciders:** Daniel Polo
- **Related:** [spec 07 §2 F109–F110, §3 NFR-31/NFR-33/NFR-34/NFR-36](../specs/07_spec_application_ux.md),
  ROADMAP 20.5, [spec 05 NFR-22](../specs/05_spec_browser_distribution.md) (**amended here**),
  [ADR-0032](0032-overlay-gate-refcount-floor-and-focus.md) (the F50 overlay whose focus half
  this extracts), [ADR-0041](0041-a-peer-looked-up-not-imported.md) (the clause-versus-row
  split this reuses for NFR-22), [ADR-0059](0059-one-file-one-global-and-a-budget-repinned.md)
  / [ADR-0061](0061-served-bytes-are-their-own-accounting.md) (the artifact's two
  measurements), [ADR-0069](0069-an-order-is-a-permutation-and-the-ceiling-held.md) (which
  named the announcement gap F110 closes), [ADR-0029](0029-delegation-teardown-and-setter-symmetry.md)
  (teardown as a returned function, the idiom `focusTrap` and `saveFocus` follow)

## Context

F109 and F110 are the two things every dialog needs and this library has had exactly once
each — inside the F50 overlay, where they are correct and unreachable. 20.1's promise dialogs
are specified in terms of them, which is why the owner took 20.5 first: building the
primitives before the thing that needs them means the dialog *composes* them instead of
writing a second copy that gets extracted later.

Three forces.

**A focus trap is a safety feature that becomes a hazard when it overreaches.** The failure
it prevents is a keyboard user Tabbing behind a modal into a page they cannot see. The
failure it *causes* is a region that will not let go — and spec 07 named that case in the
requirement rather than leaving it to be found: a root with nothing focusable in it.

**The overlay's copy is a duplicate the moment a second one exists.** Spec 07 says
*extracted*, and the difference between extracting and reimplementing is whether the original
caller ends up using the new thing.

**The artifact ceiling arrived.** ADR-0069 left 1 102 B under NFR-22's 40 kB and named the
`/bootstrap` clause as M20's tighter constraint. It was right about the direction and wrong
about which ceiling would bind first: 20.5 does not touch `/bootstrap` at all, and it still
took the artifact to 39 696 B. Spec 07 NFR-33 anticipated this and fixed the terms — recompute
the derivation, never raise the number.

## Decision

**1. Three exports on `/dom`, in the entry's existing idioms.** `focusTrap(root, options?)`
and `saveFocus(options?)` return an **idempotent teardown function**, which is what `delegate`
and `autoGrow` already do (ADR-0029); `liveRegion(options?)` returns an **instance with
`element` and `destroy()`**, which is what every component on this entry does. No new shape
was invented for either.

**2. `saveFocus` is the extraction; the trap is new.** The spec says F109 is "extracted from
the F50 overlay", and that is exactly half true — the overlay has focus save/restore and has
never had a trap. So `saveFocus` is lifted out and **`loadingOverlay` now calls it**, which is
what makes this an extraction rather than a second copy of the same fifteen lines. `focusTrap`
composes `saveFocus` for its own `restore` half, so there is one implementation of "put focus
back where it was" in the library and three callers of it.

**3. The trap is scoped to Tab, and says so.** It listens for `keydown` on the root and
corrects the two cases the platform would get wrong — the edge the key is about to leave
through, and focus sitting somewhere the trap does not own. It does **not** install a
document-level `focusin` guard to drag focus back from anywhere else. That is a deliberate
boundary, not an omission: a `focusin` trap fights the user's own browser — a screen reader's
virtual cursor, dev tools, the address bar — and the requirement is about keyboard navigation,
which Tab is. `bsModal` brings Bootstrap's own focus enforcement for the dialog case, so F101
inherits a second layer without this primitive having to be one.

**4. Everything between the edges is the platform's.** A Tab in the middle of the list is not
touched: the browser's own tab order is correct there, and a trap that reimplements it is a
trap that gets it wrong. One condition expresses both interventions — *is focus on something
this trap owns, and is it the last thing before the exit* — which is fewer branches than the
edge-plus-escape pair it replaces.

**5. No layout is consulted to decide what is tabbable.** Visibility is a rendered question,
and asking it would mean a forced layout **per Tab press**, on the hot path of a keyboard
user's navigation — the cost F98 refused and every item since has inherited. `disabled`,
`hidden` (including an ancestor), `aria-hidden="true"` and a negative `tabindex` are the four
states the DOM answers for free, and they cover what a caller controls. An element hidden by
CSS alone is the caller's to keep out of the root, and that limit is documented rather than
papered over.

**6. An empty root focuses itself.** The root takes a temporary `tabindex="-1"` — removed on
release, and never added if the caller already set one — so focus has somewhere to be that is
not `<body>`. Tab is then held rather than cycled, because there is nothing to cycle to. This
is the case that turns a trap into a lock if it is handled by cycling.

**7. The live region re-announces identical text by comparing, not by remembering.** A screen
reader announces a live region when its content *changes*, so the same message twice running
is silence the second time — exactly what a repeated "Saved" hits. Comparing against what is
already in the node and adding a trailing space makes the text differ without changing a word
of what is read, and needs no state of its own.

**8. Politeness is fixed at construction.** Changing `aria-live` on a live node is unreliable
across assistive technologies, so a caller who needs both makes two announcers. That is honest
about the cost; a per-announcement option that silently does not work would not be.

**9. NFR-22's ceiling is re-derived to 52 kB, not raised — and the row stays tight.** Spec 05
derived 40 kB as *the sum of the measured entry figures*, an upper bound on a deduplicated
single file. The same method reads **52 104 B** today (`root` 6 103, `/storage` 2 104,
`/sanitize` 1 491, `/text` 924, `/net` 770, `/table` 6 861, `/logging` 1 475, `/dom` 7 481,
`/bootstrap` 24 518, `/errors` 377) against ≈ 39.8 kB at M18; two waves of surface are the
whole difference. The artifact itself measures **39 696 B served**, twelve kilobytes under the
recomputed bound — and that gap *is* the deduplication the derivation always assumed.

A clause with 12 kB of slack does no per-PR work, so the **size-limit row is pinned at
measured + 2%** and remains the gate. That is the split ADR-0041 already made explicit for the
`/bootstrap` entry — a clause sized for the finished thing, a row sized for this PR — applied
to the artifact for the same reason.

## Alternatives Considered

- **A `focusin` guard as well as the keydown trap.** More thorough, and what Bootstrap's own
  modal does. Rejected as a *primitive*: it fights focus moved by anything that is not Tab,
  including assistive technology, and the one place it is clearly right — a modal dialog — is
  already covered by the component that owns that case. A primitive that cannot be composed
  without also being intrusive is the wrong primitive.
- **Reading `offsetParent` or `getComputedStyle` to skip invisible elements.** More accurate.
  Rejected on cost and on precedent: a forced layout per Tab press is the exact pattern F98
  refused, and the accuracy it buys is for a case — focusable but CSS-hidden — the caller
  created and can uncreate.
- **Leaving the overlay's focus code alone.** It works, and touching it risks a behaviour
  regression in a shipped component for no user-visible gain. Rejected because it makes the
  word "extracted" false and leaves two copies of focus-restore logic to drift, which is the
  failure mode the 17.1 readiness review was written to catch. The cost is measured and
  accepted: `loadingOverlay` 1 063 → **1 127 B**, and `bsLoadingOverlay` moved with its
  composed part to **2 758 B** — the shared helper is now pulled by both consumers, which is
  what deduplication costs when the duplicate was smaller than the seam.
- **A `politeness` argument on `announce()`.** The obvious ergonomics. Rejected: it would
  mutate `aria-live` on a live node, which assistive technologies honour inconsistently — an
  option that appears to work and sometimes does not is worse than a second announcer.
- **Adopting 52 kB as a *target* rather than an authoring bound.** Rejected: it would let the
  artifact grow 12 kB without a single gate firing. The recomputed clause and the tight row
  are both needed, and they are needed for different reasons.
- **Raising NFR-22 to a round number that fits.** The thing spec 07 NFR-33 explicitly forbids,
  and the reason it forbade it is visible here — the honest recomputation produced a *larger*
  bound than an ad-hoc bump would have, and it is defensible precisely because nobody chose it.

## Consequences

- `focusTrap`, `saveFocus` and `liveRegion` on `/dom`: **the public surface goes from 123 to
  126 exports**, all additive (NFR-31). No new `EGL_*` code — every failure here is a
  `TypeError` naming the option, or the existing `EGL_DOM_CONTRACT` when there is no document.
- One api-floor amendment (NFR-34): `document.activeElement`, Safari 7, `context`-guarded
  because `/dom` is an entry a server render legitimately loads and neither export is reached
  at import time. Declared by hand for the BCD comparison, since it is read off a local that
  holds the resolved document and the scanner cannot see it.
- **F110 closes the gap ADR-0069 named.** A column moved by F100's keyboard path is announced
  to nobody today; the announcer is now available for 20.1 and for a follow-up on `bsTable`.
  That follow-up is not folded in here — it is a change to a shipped component, and this item
  is the primitive.
- **Spec 05 NFR-22 is amended in this PR**, with the arithmetic, per AGENTS.md §7 and spec 07
  NFR-33. The `/bootstrap` clause is untouched and still has 482 B, which is why 20.1–20.4
  land on a new entry (spec 07 NFR-32) rather than on it.
- The test split follows the wave's rule. jsdom owns the model — which element the trap hands
  focus to, what it restores, what it refuses to leave, and that the announcer never moves
  focus. Playwright owns what only an engine has: **sequential focus navigation**, which jsdom
  does not implement at all, so a real Tab decides where focus goes and the assertion is that
  the trap and the platform agree rather than merely coexist.
- One engine difference is recorded in the browser fixture rather than worked around silently:
  **WebKit does not Tab to links by default**, so a fixture containing an `<a href>` would
  assert Safari's preference rather than this trap. The trap still lists the link — the unit
  suite pins that — and an engine that never Tabs to it never reaches it, trap or no trap.

## References

- Spec 07 §2 F109–F110, §3 NFR-31/NFR-33/NFR-34/NFR-36; spec 05 NFR-22 (amended above).
- WAI-ARIA Authoring Practices — the dialog focus contract, and live-region politeness.
- HTML Standard — sequential focus navigation, and the `tabindex` focus flag.
