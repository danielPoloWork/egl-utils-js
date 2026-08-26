# ADR-0072: A queue, a rule nobody has to guess, and one toast per story

- **Status:** Accepted
- **Date:** 2026-08-26
- **Deciders:** Daniel Polo
- **Related:** [spec 07](../specs/07_spec_application_ux.md) §2 F104–F105, §4, §6,
  NFR-31/NFR-33/NFR-35/NFR-36; ROADMAP 20.2;
  [ADR-0071](0071-a-manager-not-three-globals-and-a-dismissal-is-an-answer.md) (the `/ui`
  entry, and the manager shape this is the second instance of),
  [ADR-0041](0041-a-peer-looked-up-not-imported.md) (the lazy peer, and the entry clause that
  sent this wave elsewhere), [ADR-0048](0048-one-word-one-meaning.md) (`autoHideMs`, and why
  `add` is not `show`), [ADR-0049](0049-commands-throw-queries-answer.md) (commands throw,
  queries answer — `state()` is the query),
  [ADR-0047](0047-an-unknown-option-key-is-a-typeerror.md) (the option contract),
  [ADR-0031](0031-component-instances-and-the-alert-budget.md) (instances, not singletons),
  [ADR-0059](0059-one-file-one-global-and-a-budget-that-means-something.md) (the artifact
  clause-versus-row split, re-derived again here)

## Context

F69 gives a page toasts. What it does not give it is a **policy**, and the gap is visible the
first time a loop notifies: six `add` calls stack six toasts, in arrival order, each with its
own timer, over the page they are reporting on.

Spec 07 F104 asks for three things — a cap, dedupe, update-by-id — and adds a clause that is
unusual and load-bearing: *"What 'identical' means is part of the contract, not left to the
reader."* A dedupe rule nobody can predict is worse than no dedupe at all, because the caller
cannot tell a dropped notification from a bug.

F105 asks for one more: a promise's three states told as **one** toast. The reason is
ordering, not tidiness. Written by hand as three `add` calls, a slow network produces
"Saving…", then "Saved", with the earlier "Saving…" still sitting underneath — the story out
of order, permanently, until two independent timers happen to expire.

And one constraint shaped every mechanism below: **F69 offers no update.** It builds a fresh
node per toast, which is exactly what makes its "no stale variant classes" property structural
rather than a cleanup step — and it means "update in place" has to be built from the
primitives F69 does offer, or not at all.

## Decision

**1. `createToasts(options?)`, the same manager shape ADR-0071 fixed.** A `create*` factory
returning an instance the caller owns and destroys; options merged defaults-then-overrides
with `undefined` meaning *not said*; unknown keys rejected (ADR-0047); no module state
(NFR-35). The wave now has two instances of one shape rather than two shapes.

**2. The manager builds its own container unless given one.** Without `container`, it creates
a `.toast-container position-fixed p-3` positioned by a `placement` vocabulary of seven names,
each mapping to Bootstrap's **own** position utilities — so a caller restyling it is editing
Bootstrap rather than guessing at us — and removes it again on `destroy`. Given one, it fills
it and leaves it behind. That is `bsLoadingOverlay`'s owned-versus-given pattern, unchanged. A
page that just wants notifications should not have to author positioning markup first.

**3. What "identical" means, stated rather than implied.** With no `dedupeKey`, two toasts are
identical when their `variant`, their `title` and their `message` all match — **and only when
the message and the title are both strings**. Three consequences, each deliberate:

- **Node content is never deduplicated.** The only cheap comparison is reference equality;
  callers build a fresh node per call, so it would never match. A rule that silently never
  fires is worse than an honest exemption.
- **A duplicate is dropped, not redrawn** — literally "not shown twice" — **and the toast
  already up has its lifetime restarted**, so a repeated event still reads as recent without a
  second node appearing. That restart is Bootstrap's own `show()`, which clears the pending
  timeout and schedules a new one; verified against the installed `toast.js` rather than
  assumed, which is why no timer of ours appears anywhere in this module.
- **A caller-supplied `id` leaves the dedupe system entirely**, in both directions: neither
  matched against nor matchable. An id is an assertion of distinct identity, and honouring it
  matters most in the case ids exist for — `add('Uploading…', {id: 'a'})` followed by the same
  text under `{id: 'b'}` must stay two toasts, or the second caller's later update silently
  retargets the first one's. This one was found by a test that disagreed with the first
  implementation, which had dedupe outranking the id.

**4. An update hides the old toast and draws the replacement in the slot it vacates.** F69 has
no update, and the two alternatives were worse: mutating the node means reimplementing F69's
variant vocabulary and its escaping to keep the no-stale-classes property true, and adding an
update method to F69 is blocked by the same arithmetic that created `/ui` — ADR-0041's clause
has 473 B left.

So an update is a hide followed by a show, with two rules that make it behave like one:

- **The slot is reserved across the swap.** The replacement is drawn from the `hidden` handler
  rather than re-entering the queue, so a burst of newer arrivals cannot overtake the toast
  being updated.
- **A dismissal outranks a pending update.** `dismiss(id)` during a swap clears the
  replacement: the caller asked for that toast to go, not to be replaced by what was queued
  for it.

An update of a **queued** toast is just a payload swap — nothing has been drawn.

**5. `promise()` returns the caller's own promise, unchanged.** The pending state is shown with
`autoHideMs: false` — an operation of unknown duration has no honest timer, and a "Saving…"
that vanished before it finished is how a user learns not to trust the toasts — and the
settled state replaces it under the same id. `success` and `error` may be functions of the
value and the reason, which is how a message says *"Saved 3 rows"* rather than *"Saved"*.

The helper attaches a `then` and returns the **original** promise, so the settlement passes
through byte-for-byte and an unhandled rejection stays the caller's to handle rather than being
absorbed by our observer. Destroyed mid-flight is the ordinary navigate-away race: the
operation still settles for the caller, it simply has nowhere left to be announced.

**6. `state()` is a query, and it exists for the invariant.** It returns the ids visible and
the ids queued. Spec 07 §6 asks for a property test over randomised arrival sequences
asserting *"never more than n visible, and never a queued toast that is never shown"* — and an
invariant nothing can observe is an invariant nobody can test. The suite checks it after
**every** step rather than at the end, because a transient breach is still a breach.

**7. NFR-36 is inherited, not re-implemented.** F69 already sets `role`/`aria-live` from
severity — `alert`/`assertive` for danger and warning, `status`/`polite` otherwise — so every
toast this manager admits is announced, and an update rewriting a live region announces the new
text, which is exactly what the promise transition needs.

**8. NFR-22 re-derived a third time, to 59 kB.** Same method, same eleven inputs, reading
**59 447 B**; the whole movement is `/ui` growing 2 169 B. Recorded here because it establishes
the rule the remaining items inherit: **the derivation is redone whenever any input moves**,
not only when an entry is added. A clause nobody recomputes is a number rather than a bound.
The row remains the gate, re-pinned to 43.3 kB (measured + 2.1%).

## Alternatives Considered

- **Mutating the visible toast's `.toast-body` instead of replacing the node.** Cheaper, and
  genuinely "in place". Rejected: the moment the variant changes — which is F105's whole case,
  pending to success — it means swapping `text-bg-*` classes by hand, which is reimplementing
  the part of F69 that makes stale variants impossible. Two implementations of one class
  vocabulary is how they drift.
- **Adding `update()` to F69's `BsToastInstance`.** The honest home for it, and additive rather
  than breaking. Rejected on arithmetic: ADR-0041's 25 kB `/bootstrap` clause has 473 B left,
  which is less than the method would cost — the same wall that put this wave on `/ui` in the
  first place (spec 07 NFR-32).
- **Dedupe by dropping silently, with no lifetime restart.** Closest to F104's literal words.
  Rejected: a second save at 4.9 s into a 5 s toast would produce no feedback at all. The
  restart costs one call into the peer's own semantics and makes the rule useful rather than
  merely correct.
- **Deep-comparing node content so dedupe covers everything.** Rejected: expensive on the hot
  path of a notification burst, and unpredictable — two nodes differing in a whitespace text
  node would be "different" for reasons no caller can see. An exemption that is written down
  beats a rule that cannot be reasoned about.
- **A `pending`-only promise helper that leaves the caller to announce the result.** Smaller
  surface. Rejected: it is the three-`add` shape again with extra steps, and the out-of-order
  story F105 exists to prevent comes back the first time the network is slow.
- **Returning a derived promise from `promise()` rather than the caller's own.** Would let the
  helper catch, so a caller who ignores the result gets no unhandled rejection. Rejected: that
  is precisely swallowing, and F105 says the helper observes. Hiding a rejection from the
  runtime's own reporting is not a favour.

## Consequences

- **The public surface goes from 127 exports across eleven entries to 128**, one new export
  (`createToasts`) and **no new `exports`-map path** — NFR-31's additive-only clause holds.
- **`/ui` is now two managers deep and the shape held**: 20.3 and 20.4 inherit it with nothing
  new to decide about lifecycle, options or teardown.
- **One assumption about F69 is now load-bearing**: that `hidden.bs.toast` bubbles to the
  container, which is what lets one listener see every toast's departure. F69 documents it and
  a three-engine test asserts it against a real auto-hide timer, because if it were ever
  untrue every queued toast past the cap would wait forever — the one failure the property test
  cannot see, since it drives a double.
- **Bootstrap's `show()`-restarts-the-timer behaviour is relied on** for the dedupe restart. It
  is quoted in the code comment that depends on it, verified against `toast.js`, and it is not
  a private API — but it is behaviour rather than documented contract, so it is named here to
  be re-checked on a major Bootstrap bump.
- **A caller-supplied container may hold toasts this manager did not build**, and their
  `hidden` events are ignored rather than counted as freed slots. Tested, because a page
  migrating call site by call site is the normal way this gets adopted.
- **The artifact clause has ~17 kB of slack** (59 kB against 42 432 B served) and will keep
  widening as entries grow: the bound double-counts shared chunks by construction, which is
  the deduplication the derivation always assumed.

## References

- [spec 07](../specs/07_spec_application_ux.md) §2 F104–F105, §4, §6, NFR-33/NFR-35/NFR-36.
- [spec 04](../specs/04_spec_bootstrap_toolkit.md) F69 (`bsToast`) — every node here is its.
- Bootstrap 5.3 `toast.js`: `show()` calls `_clearTimeout()` and re-schedules through
  `_maybeScheduleHide()`, which is the restart decision 3 leans on.
- `src/test/javascript/it/d4np/utils/ui-toasts.test.js` — the admission rules and the cap
  property; `src/test/browser/ui-toasts.spec.js` — the two claims only an engine can settle.
