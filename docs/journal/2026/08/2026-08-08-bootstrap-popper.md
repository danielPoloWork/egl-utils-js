# 2026-08-08 — A second peer, one sanitizer, and a catalogue closed (roadmap 16.4)

## What got done

- **`bsTooltip` and `bsPopover`** in a new `bootstrap-popper.js` — spec 04 F80–F81, fixed by
  [ADR-0044](../../../adr/0044-a-second-peer-one-sanitizer-and-a-catalogue-closed.md).
- **The Bootstrap 5 catalogue is complete: 24 of 24 components**, plus `bsTable`, `bsIcon`,
  `bsLoadingOverlay` and the two icon-set presets — **29 exports**, one entry, each
  individually tree-shakeable.
- 25 jsdom cases and 3 real-engine cases; `bootstrap-popper.js` at 100% lines / 98.9%
  branches, global 100% lines, 2209 tests.
- Budgets: `bsTooltip` 1940 B and `bsPopover` 1950 B → rows 2.1 kB (from the 1.25 kB wrapper
  clause); entry 19163 B against the 25 kB clause — **unmoved across the whole of M14–M16**.

## Decisions taken

- **Popper's absence is detected by translating Bootstrap's own diagnostic**, because there
  is genuinely nothing else: the bundle build keeps Popper private, so there is no global to
  probe, and constructing eagerly to find out would defeat F68's laziness. Message-matching
  is a smell, so the guard is what makes it safe — anything that is *not* Bootstrap's
  "require Popper" complaint passes through untouched, since mistranslating an unrelated
  error into a packaging one sends the caller to the wrong fix.
- **One sanitizer, the caller's.** A plain string is text and no sanitizer runs at all;
  markup goes through the caller's pass first and Bootstrap's own is switched off for it.
  Two sanitizers is not twice the safety — it is a boundary with no owner, and the visible
  effect is the caller's chosen profile being narrowed by an invisible second one.
- **`@popperjs/core` is not declared as our peer.** It is Bootstrap's, and declaring it
  would show a second optional-peer warning to everyone who only wanted `bsBadge`. Naming
  it in the failure reaches exactly the people who need it.
- **`content` on a tooltip is a `TypeError`**, not a silent drop: a tooltip has one slot,
  and quietly discarding half of what a caller wrote is worse than refusing it.

## Findings worth carrying forward

- **A Bootstrap behaviour found by measuring, not by reading**: `setContent` on a *shown*
  tip removes it and does not put it back. Verified against raw Bootstrap with no wrapper
  involved, so it is theirs and not ours. The wrapper now sequences — hide, replace once
  the tip is actually gone, show again — which is the same hide-then-act-on-`hidden` idiom
  `destroy` uses.
- **The first fix was worse than the bug.** Applying the content and immediately calling
  `show()` started a second transition while Bootstrap's own was still running, and the tip
  ended up closed anyway. The event trace showed it plainly: `show, show, shown, hide,
  shown, hidden`. Acting mid-transition is the failure mode in both cases — which is why
  the working shape is the one `destroy` already had.
- **The `.peer` field designed in 16.1 fit without amendment.** It was added for a single
  peer and the second one landed on it unchanged, three milestones later.
- **The entry ceiling never moved.** Four milestones, 29 exports, zero amendments to the
  25 kB clause ADR-0041 sized before any of it existed. The strongest evidence this project
  has that a ceiling written for the *finished* surface beats one re-estimated per PR.

## Where the project stands

M14 and M15 complete; **M16 is four of five items in** — 16.1–16.4 done, **only 16.5
(BUG-0003) remains open**, and it is a defect fix in M14.2 code rather than new surface.
Spec 04's functional requirements F52–F81 are all delivered. v0.7.0 remains the released
version and **v0.8.0 is still uncut — six changesets now pending** (15.1, 15.2, 16.1, 16.2,
16.3, 16.4). ADRs through **0044, next free 0045**. Local Firefox still cannot launch;
Chromium and WebKit green.

## How the next session resumes

1. Wait for this PR to merge.
2. **The catalogue is closed, so two things are now due and neither is more code**: the
   **v1.0.0 conversation** the plan always pointed at this moment for, and the **release
   backlog** — six pending changesets covering two and a half milestones.
3. **16.5** (BUG-0003) is the only open implementation item: take the `AbortController`
   from the target's own view behind a `dom-helpers` seam, and flip the case
   `bootstrap-node-safety.test.js` currently pins as a known failure.
