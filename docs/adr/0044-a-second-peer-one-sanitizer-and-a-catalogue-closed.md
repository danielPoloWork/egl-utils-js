# ADR-0044: A second peer, one sanitizer — and a catalogue closed

- **Status:** Accepted
- **Date:** 2026-08-08
- **Deciders:** Daniel Polo
- **Related:** [spec 04 §2 F80–F81, §3 NFR-17/NFR-18/NFR-19](../specs/04_spec_bootstrap_toolkit.md)
  (F80 amended: `setContent` sequencing; NFR-17's ceiling for the pair), ROADMAP 16.4,
  [ADR-0041](0041-a-peer-looked-up-not-imported.md) (the F68 contract, the `.peer` field
  this second package uses, and the entry ceiling sized once for the whole catalogue),
  [ADR-0042](0042-ids-are-the-accessibility-and-a-ceiling-derived-not-guessed.md) and
  [ADR-0043](0043-three-shapes-that-are-not-a-group.md) (the shared lifecycle these two
  compose), [ADR-0012](0012-sanitize-default-profile.md) (the sanitizer whose profile must
  not be silently narrowed),
  [ADR-0037](0037-builder-contract-nodes-escape-and-the-atom-budget.md) (the F52
  `{html, sanitize}` pair extended here to a third-party renderer)

## Context

Tooltip and popover close the Bootstrap 5 catalogue, and they are the only two components
in it that differ from everything before them on two axes at once.

**They need a second peer.** Bootstrap positions both with `@popperjs/core`. The
`bootstrap.bundle` build carries it; the plain `bootstrap` build does not. So a project can
have the `bootstrap` peer installed, correct and working — every other wrapper in this
toolkit fine — and still fail here, on a package it was never told about. Worse, there is
nothing to probe: a bundled Popper is not exposed under any global, so the usual "look it
up, then decide" of ADR-0041 has nothing to look up.

**They hand content to a third-party renderer.** Every other builder in this toolkit writes
its own nodes and therefore owns the escaping completely. These two pass a string to
Bootstrap, which then decides whether to parse it — and Bootstrap ships its own sanitizer,
on by default. Two sanitizers over one value is not twice the safety: it is a boundary with
no owner, and in practice it means the caller's deliberately configured profile
(ADR-0012's curated allowlist, or their own) is silently narrowed by a second one they
never chose and cannot see.

## Decision

**1. Popper absence is detected by translating Bootstrap's own diagnostic.** Bootstrap
raises `TypeError: Bootstrap's tooltips require Popper (…)` from inside `show()` — not from
the constructor. The wrapper wraps every path that can reach Popper, matches that message,
and rethrows a `PeerMissingError` with **`.peer === '@popperjs/core'`** naming both remedies
(install the package, or load the bundle build).

This is message-matching, which is normally a smell, and it is recorded as a decision
precisely because it is the *only* detection available: there is no global to probe, and
constructing eagerly to find out would defeat F68's laziness. What makes it acceptable is
the fallback: **anything that is not Bootstrap's Popper complaint passes through
untouched.** Mistranslating an unrelated error into a packaging one would send a caller to
the wrong fix, which is worse than not translating at all.

The distinction the `.peer` field carries is the whole value: `bootstrap` is installed and
working, and the package to install is Popper. A generic "peer missing" would send someone
to re-check the one thing that is fine.

**2. One sanitizer, and it is the caller's.** A plain string is handed over with
Bootstrap's `html: false`, so Bootstrap writes text and **no sanitizer runs on either
side** — the safe default costs nothing. Markup requires the F52 `{html: true, sanitize}`
pair; the caller's sanitizer runs **here, before Bootstrap sees the value**, and Bootstrap's
own is then switched off (`sanitize: false`) for that content. One pass, one owner, and the
profile that runs is the one the caller chose. `sanitize: false` remains the signed
declaration of trusted content, as everywhere else on this entry.

**3. `setContent` sequences rather than fights the transition.** Measured against Bootstrap
directly, with no wrapper involved: calling `setContent` on a **shown** tip removes it and
does not put it back. Replacing the text of a visible tip is a natural request and a caller
means "change what this says", never "close it" — so when the tip is up the wrapper hides
it, applies the replacement once it has actually gone, and shows it again. On a hidden tip
the call applies straight through.

The first attempt at this was worse than the bug: applying the content and then calling
`show()` immediately started a second transition while Bootstrap's own was mid-flight, and
the tip ended up closed anyway. The fix is the hide-then-act-on-`hidden` idiom `destroy`
already uses in `behaviourWrapper` — acting mid-transition is what breaks, in both cases.

**4. `content` on a tooltip is a `TypeError`, not a silent drop.** A tooltip has one slot; a
popover has two. Accepting `content` on a tooltip and ignoring it would leave a caller
staring at a tip missing half of what they wrote.

## Alternatives Considered

- **Probing for Popper** before constructing (a global, a feature test). Rejected: the
  bundle build exposes nothing to probe, so the check would be wrong exactly where it
  matters most.
- **Declaring `@popperjs/core` as a peer dependency** of this package. Rejected: it is
  *Bootstrap's* peer, not ours, and declaring it would make every consumer of the entry —
  including someone who only wants `bsBadge` — see a second optional-peer warning. Naming
  it in the failure reaches exactly the people who need it.
- **Letting Bootstrap's sanitizer run as well**, "belt and braces". Rejected: see Context.
  Two sanitizers mean neither is the boundary, and the visible effect is the caller's
  profile being narrowed by an invisible second pass.
- **Passing markup with Bootstrap's `sanitize` left on and no pass of our own.** Rejected:
  the sanitizer would then be Bootstrap's, not the caller's, and the F52 contract's promise
  — *you* choose what is allowed — would quietly not hold on this one entry.
- **Documenting the `setContent` quirk instead of sequencing around it.** Rejected: a
  documented footgun is still a footgun, and the wrapper layer exists for exactly this class
  of lifecycle papering-over.
- **Returning a promise from `setContent`** so callers can await the re-show. Rejected for
  now: it would make one method asynchronous out of eleven, for a result nothing needs to
  await. Reconsider if a caller ever needs to know.

## Consequences

- **The catalogue is complete: 24 of 24 Bootstrap 5 components**, plus `bsTable`, `bsIcon`,
  `bsLoadingOverlay` and the two icon-set presets — **29 exports** on one entry, each
  individually tree-shakeable.
- **NFR-17: one row amended.** `bsTooltip` **1940 B** and `bsPopover` **1950 B** → rows
  2.1 kB, from the 1.25 kB wrapper clause. They are wrappers that also *prepare content* and
  *translate a diagnostic*, which is the same "wrapper that does more than wrap" class as
  `bsToast` (ADR-0041) and `bsCollapse` (ADR-0042). The ten bytes between them are the whole
  difference between the two components: one shared factory, one different slot map.
- **The entry ceiling never moved across the entire wave.** 19163 B measured against the
  25 kB clause ADR-0041 set once, before any of M14–M16 existed. Four milestones, zero
  amendments to it — the strongest evidence this project has that a ceiling written for a
  *finished* surface beats one re-estimated per PR.
- **A Bootstrap behaviour is now documented by measurement**, not by reading its source: the
  `setContent` finding is recorded in F80 with the sequence that works, so the next person
  to hit it finds the answer rather than the surprise.
- **`EGL_PEER_MISSING` now carries two distinct peers**, which is what the `.peer` field was
  added for in ADR-0041 — designed one milestone before the case that needed it, and it fit
  without amendment.

## References

- [spec 04 §2 F80–F81](../specs/04_spec_bootstrap_toolkit.md)
- [ADR-0041](0041-a-peer-looked-up-not-imported.md), [ADR-0012](0012-sanitize-default-profile.md)
- Bootstrap 5.3 `Tooltip`/`Popover`: the `sanitize`/`html` config pair, `setContent`'s
  remove-and-restore, and the `require Popper` diagnostic raised from `show()`.
