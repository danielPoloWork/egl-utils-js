# 2026-08-26 — A queue, and a rule nobody has to guess (roadmap 20.2)

## What got done

- **`createToasts` on `egl-utils-js/ui`** (F104–F105): a cap with a queue, two admission rules,
  and one toast per operation — over `bsToast`, which still draws every node.
  [ADR-0072](../../adr/0072-a-queue-a-rule-nobody-has-to-guess-and-one-toast-per-story.md).
- 50 unit tests including the property test spec 07 §6 asks for, plus 2 three-engine browser
  tests; `ui-toasts.js` at 100% statements, branches, functions and lines.
- NFR-22 re-derived a **third** time (59 kB, 59 447 B), the artifact row re-pinned to 43.3 kB,
  the `/ui` route and size rows re-measured.
- No new `exports` path, no new error code, nothing renamed: 127 exports become 128.

## The clause that shaped the work

F104 contains an unusual sentence: *"What 'identical' means is part of the contract, not left to
the reader."* It is the most useful line in the requirement, because a dedupe rule nobody can
predict is worse than no dedupe — the caller cannot tell a dropped notification from a bug.

So the rule is written down three ways, and each part is a decision:

- **Identity is `variant` + `title` + `message`, and only when message and title are strings.**
  Node content is exempt. The only cheap comparison is reference equality, callers build a fresh
  node per call, so the rule would never fire — and a rule that silently never fires is worse
  than an honest exemption.
- **A duplicate is dropped, and the toast already up has its lifetime restarted.** Dropping
  alone is F104's literal reading, and it means a second save at 4.9 s into a 5 s toast produces
  no feedback at all. The restart is Bootstrap's own `show()` clearing its pending timeout —
  verified in `toast.js` rather than assumed, which is why no timer of ours appears in the
  module.
- **An explicit `id` leaves the dedupe system entirely.** This one the tests found. The first
  implementation checked the id, then fell through to content dedupe — so
  `add('Uploading…', {id: 'a'})` followed by the same text under `{id: 'b'}` returned `'a'` for
  both, and the second caller's later update silently retargeted the first file's toast. An id
  is an assertion of distinct identity; honouring it matters most in exactly the case ids exist
  for.

## The constraint that shaped the mechanism

**F69 has no update.** It builds a fresh node per toast, which is precisely what makes its "no
stale variant classes" property structural rather than a cleanup step.

Three options, and two were worse. Mutating the visible node means swapping `text-bg-*` classes
by hand the moment the variant changes — which is F105's whole case — and that is
reimplementing the part of F69 that makes stale variants impossible. Adding `update()` to F69
was blocked by arithmetic rather than taste: ADR-0041's 25 kB clause has 473 B left, the same
wall that put this wave on `/ui` in the first place.

So an update **hides and redraws in the slot the old toast vacates**, with two rules that make
it behave like one operation: the slot is reserved across the swap, so a burst of newer arrivals
cannot overtake the toast being updated; and a dismissal outranks a pending replacement, because
the caller asked for that toast to go, not to be replaced by whatever was queued for it.

## What the two browser tests are for

Deliberately two, not ten. The unit suite proves every rule against a double, which is the right
instrument for policy. Exactly two claims need an engine:

1. **`hidden.bs.toast` really bubbles to the container, and a real auto-hide really fires it.**
   The entire queue turns on that one event reaching one listener. The double dispatches it
   because we told it to. If it were ever untrue, every queued toast past the cap would wait
   forever — and that is the one failure the property test *cannot* see, because it drives the
   double.
2. **The promise transition survives real animations** — hiding and re-showing across a
   transition is where a swap either lands in the vacated slot or races.

## The rule the derivation just acquired

NFR-22 was re-derived for the third time, and this is the first time **no entry was added** —
`/ui` simply grew. The bound is the sum of the measured entry figures, so any growth changes it,
and 59 447 B would have broken the 57 kB clause 20.1 set. Recomputing rather than raising is
spec 07 NFR-33's requirement, and the general rule is now written into the ADR: **redo the
derivation whenever any input moves.** A clause nobody recomputes is a number, not a bound.

## Where the project stands

v1.2.0 released. M20 in progress: 20.5, 20.1 and 20.2 done; 20.3, 20.4, 20.6 and 20.7 open.
`.changeset/` holds three minor entries (20.5, 20.1, 20.2); `[Unreleased]` has all three. ADRs
through 0072, next free 0073. Every gate green.

## How the next session resumes

1. Wait for this PR to merge (one item per PR).
2. **20.3** (theme management) is the natural next item and the last one on `/ui` that needs no
   api-floor amendment — `data-bs-theme`, storage through the F21 wrapper, and a documented
   `<head>` snippet whose "before first paint" claim is a browser assertion by construction
   (spec 07 §6).
3. **20.4** and **20.6** are the two that still owe the `matchMedia` / `MediaQueryList` floor
   amendment (spec 07 NFR-34), each an explicit ADR-0017 inventory decision.
4. **20.7** is unrelated to the wave's features and can be taken any time the browser suite's
   flakiness becomes annoying enough.
