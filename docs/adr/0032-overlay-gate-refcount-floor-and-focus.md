# ADR-0032: The overlay gate — a reference count, a floor measured from the appearance, and contained presentation failures

- **Status:** Accepted
- **Date:** 2026-08-07
- **Deciders:** Daniel Polo (maintainer), agent (senior project architect persona)
- **Related:** [spec 03](../specs/03_spec_dom_ui_table.md) §2 F50 and NFR-15;
  ROADMAP 12.2; [ADR-0031](0031-component-instances-and-the-alert-budget.md) (the component
  contract this inherits rather than restates),
  [ADR-0027](0027-logging-formatter-sink-split.md) (the containment rule reused for
  presentation hooks), [ADR-0028](0028-dom-entry-fails-fast-and-the-floor-gate-sees-the-dom.md)
  (`/dom` fail-fast and its 11.2 amendment, which is why this export is DOM-free until
  `focus.save` is asked for), [ADR-0029](0029-delegation-teardown-and-setter-symmetry.md)
  (teardown as a signal)

## Context

`loadingOverlay` (F50) is a component whose *presentation* is supplied by the caller, so
almost nothing it does is drawing. What it owns is timing, and timing is where every
hand-rolled loading overlay goes wrong in the same three ways:

1. **A boolean flag instead of a count.** Two overlapping operations both set
   `isLoading = true`; the first to finish sets it back to `false` and the overlay vanishes
   while the second is still running. The user watches the spinner disappear and the page
   sit there.
2. **A floor measured from the wrong instant.** Teams add a minimum visible time to stop the
   spinner flashing, and start the clock when `show()` is *called*. If the presentation is
   animated — a modal fading in over 300 ms — most of the floor is spent before anything is
   on screen, and the flash survives the fix.
3. **A hide that arrives mid-appearance.** A response faster than the animation asks the
   overlay to close before it has finished opening. Naively handled, the hide is either lost
   (the overlay stays up forever) or applied to a half-open dialog.

Focus is the fourth, quieter problem: hiding a container that still holds focus produces the
"blocked aria-hidden on an element because its descendant retained focus" warning and drops
the user at the top of the document.

[ADR-0031](0031-component-instances-and-the-alert-budget.md) already settled *how a
component is shaped* — factory, injected policy, owned teardown, loud use-after-destroy.
This ADR only records the semantics that are specific to a gate.

## Decision

**1. A reference count, and an idempotent release.** `show()` increments and returns a
release function that decrements **at most once**, however many times it is called. The
overlay hides when the count reaches zero. Idempotence is not politeness: a release called
twice would decrement a count another owner still holds, which reintroduces problem 1
through the back door. The release is returned rather than exposed as a `hide()` because a
caller who can only release *their own* acquisition cannot corrupt anyone else's.

**2. The floor is measured from when `onShow` settles.** The hook may be synchronous or
return a promise; the minimum-visible timer starts when it settles, so the floor covers time
the overlay is actually visible. A hide requested earlier is remembered and honoured the
moment the floor expires, which makes problem 3 a state transition rather than a race.

**3. Presentation hooks are called synchronously and their failures are contained.**
`onShow` runs inside `show()`, not a microtask later — a gate that defers the presentation
is a gate that flickers on fast paths. Both a synchronous throw and a rejected promise are
caught, the gate returns to a consistent state, and nothing is thrown into the caller. This
is the [ADR-0027](0027-logging-formatter-sink-split.md) rule applied to a second
cross-cutting concern: a spinner that fails to render must not fail the save it was
decorating. The cost is that a broken presentation is silent; the alternative — an exception
surfacing from an unrelated `release()` call, or an unhandled rejection with no caller to
receive it — is worse, and the gate never gets stuck, which is the failure that would
actually harm a user.

**4. Focus is opt-in, and it is the only thing that needs a document.** With `focus.save`
the active element is captured before showing, focus inside `focus.root` is blurred before
hiding, and the original element is refocused after `onHide` settles **only if it is still
in the document** — an operation that re-rendered its trigger away must not cause a throw or
a focus on a detached node. Without `focus.save` the gate touches no DOM at all, so its
timing logic runs and is tested in Node. That is NFR-14 as amended in 11.2 read strictly:
only the part that reaches for the ambient document demands one.

**5. `destroy()` bypasses the floor; `signal` destroys.** Teardown is not cosmetic, so it
hides immediately rather than leaving an overlay up for a component that no longer exists,
and it clears the timer. A late `onShow` settling after `destroy()` cannot resurrect the
gate. `show()` after `destroy()` throws, per ADR-0031. **F50's option and return lists in
spec 03 gain `signal` and `destroy()` in this PR**: NFR-15 already named F50 among the
exports whose teardown must ride an aborted signal, so the F50 line was the incomplete half
— the same correction 12.1 made for F49.

**6. The budget is pinned at the measurement: 958 B, row 1.03 kB, against the spec's
indicative 1.25 kB.** No amendment is needed this time; the row records the number so a
future change has to justify itself against it. `/dom` re-baselines to 3436 B measured
against its unchanged 4 kB clause.

## Alternatives Considered

- **A boolean `isLoading` with `show()`/`hide()`** — rejected: it is problem 1 verbatim. The
  count is the whole feature.
- **A public `hide()` that force-hides regardless of the count** — rejected: it hands any
  caller the ability to close an overlay another caller still needs, which is the same
  defect with a nicer name. `destroy()` exists for the one case where force is correct — the
  gate is going away entirely.
- **Starting the floor at `show()`** — rejected: it measures the animation instead of the
  visibility (problem 2). The extra state this costs is one boolean.
- **Injecting a clock (`now`) as the logger does** — considered and rejected as unnecessary:
  the floor needs one timer, not a timestamp, so `setTimeout` alone expresses it and fake
  timers drive it deterministically. Fewer options, fewer bytes, identical testability.
- **Letting presentation errors propagate** — rejected, see decision 3. A variant that
  re-threw asynchronously so the platform's unhandled-rejection reporting would see it was
  also rejected: it converts a cosmetic failure into a page-level error event, and the
  containment rule already has a precedent in this codebase.
- **A `focus` boolean instead of an options object** — rejected: clearing focus *inside the
  overlay* needs to know which element the overlay is, so `root` has to exist; folding both
  into one object keeps the related pair together and leaves room for future focus policy.
- **Building the overlay markup here** — rejected outright: it would make the component know
  about modals, spinners, and CSS frameworks. The `onShow`/`onHide` pair is what lets one
  gate serve all of them, and it is what the spec-04 Bootstrap adapter will bridge to
  `bootstrap.Modal` without this file changing.

## Consequences

- M12 is complete, and the spec-04 toolkit gets its overlay for free: `bsLoadingOverlay`
  becomes this gate with `onShow`/`onHide` bridged to a Bootstrap modal — a preset, not a
  reimplementation.
- Callers must hold their release. The `wrap(promiseOrFn)` convenience exists precisely so
  the common case never writes `try`/`finally` by hand, and it releases on rejection and on
  a synchronous throw alike.
- A failing `onShow` is silent by design. Applications that need to know a presentation
  failed should log inside their own hook, where the error is still in hand.
- `isShown()` reports `true` from the first `show()` — including while the overlay is still
  appearing — because "is the gate open" is the question callers actually ask.

## References

- [spec 03 §2 F50](../specs/03_spec_dom_ui_table.md) — the contract, and §3 NFR-12/NFR-15
- [ADR-0031](0031-component-instances-and-the-alert-budget.md) — the component shape this
  inherits
- [ADR-0027](0027-logging-formatter-sink-split.md) — the containment precedent
- [MDN: `aria-hidden` and focus](https://developer.mozilla.org/docs/Web/Accessibility/ARIA/Attributes/aria-hidden)
  — why focus must leave the overlay before it is hidden
