# ADR-0029: Teardown as a signal, and setters that stay symmetric

- **Status:** Accepted
- **Date:** 2026-08-06
- **Deciders:** Daniel Polo (maintainer), agent (senior project architect persona)
- **Related:** [spec 03](../specs/03_spec_dom_ui_table.md) §2 F44–F45, NFR-14 (amended here),
  NFR-15; ROADMAP 11.2; builds on
  [ADR-0028](0028-dom-entry-fails-fast-and-the-floor-gate-sees-the-dom.md) (the entry's
  contract and structural type checks) and
  [ADR-0004](0004-signal-first-cancellation-contract.md) (the signal-first convention this
  extends from async into DOM lifetimes)

## Context

Both halves of 11.2 exist to remove a habit rather than to wrap an API.

**Delegation.** The ordinary way to make rows clickable is to bind a listener per row after
each render. It costs a listener per row per render, and it needs a matching teardown pass
that is easy to forget and invisible when missed — the page keeps working while listeners
accumulate. Delegation replaces the whole cycle with one listener that outlives the nodes
beneath it. The catch is that delegation has three details people get wrong: which element
the handler receives, how far `closest` is allowed to climb, and how the listener is
eventually removed.

**Setters.** `el.disabled = !enabled` is not worth a function. What *is* worth a function is
the guard that surrounds it — `if (el)` at every call site, because the element is optional —
and the asymmetry that creeps in once hiding is done two ways. A hand-rolled pair where
`show` clears both a `hidden` attribute and a framework class while `hide` sets only the
attribute leaves an element stuck after the wrong sequence, and the bug survives review
because each half reads correctly on its own.

## Decision

**1. Teardown is an internal `AbortController`, not a retained handler reference.**
`delegate` registers its listener with `{signal: internal.signal}`; unsubscribing is
`internal.abort()`. This makes the returned function **idempotent by construction** —
aborting twice is defined as a no-op by the platform — with no handler reference to retain
and no `removeEventListener` argument list to keep in sync. A caller `signal` is bridged with
`signal.addEventListener('abort', detach, {once: true, signal: internal.signal})`, so the
bridge cleans itself up in *both* directions: a long-lived component signal does not
accumulate a listener per short-lived binding.

An **already-aborted** caller signal attaches nothing at all, rather than attaching and
immediately removing — otherwise a spy on the root observes one spurious registration for a
subscription that was over before it began.

**2. The handler receives the *matched* element, not `event.target`.** `handler(event,
matchedElement)`. The target is the deepest node clicked — an icon inside a button, a
`<span>` inside a row — and is almost never what the caller wants. Passing the match as an
explicit second argument is the difference between a delegation helper and a thin
`addEventListener` alias.

**3. Matching is `closest` plus an explicit containment check.**
`event.target.closest(selector)` climbs to the document root, so without
`root.contains(match)` a selector like `'body'` or `'.page'` would match an ancestor
*outside* the delegated subtree. The check is one line and closes a whole class of
surprising matches.

**4. The setters are no-ops on nullish and `TypeError` on a wrong type.** An absent optional
element is a normal state, so requiring `if (el)` at each call site is how those guards get
forgotten; a *wrong type* is a programmer error and still throws. This is the same split the
earlier waves use — expected-malformed input degrades, wrong types throw.

**5. `setVisible` drives one mechanism, never two.** The `hidden` attribute by default (the
platform's own, needing no stylesheet); with `hiddenClass`, that class **instead**. Driving
both would leave an element that one mechanism hides and the other shows, with CSS
specificity deciding. Because each call touches exactly one thing, hide and show always undo
each other — the asymmetry described above is impossible rather than merely avoided, and a
test asserts `outerHTML` is byte-identical after a hide/show round trip.

**6. `setEnabled` prefers the property, falls back to the attribute.** Every form control has
a `disabled` property and the browser consults it. For a `div` acting as a button or a custom
element there is no property, and assigning one creates an inert expando; the *attribute* is
at least visible to CSS and to `attributeChangedCallback`. So: property when present,
`toggleAttribute('disabled', …)` otherwise.

**7. `setValue` covers the four shapes of "value" and dispatches nothing.** Checkbox/radio
take `checked`; a `select` selects the matching option, or the matching set when `multiple`;
everything else takes `value`; nullish clears rather than writing `"null"`. A select whose
value matches no option gets `selectedIndex = -1`, so no phantom selection is left behind.

**No event is dispatched.** A programmatic assignment fires no `input`/`change` natively.
Synthesising one would make this function behave unlike the assignment it replaces and could
re-enter the very handler that called it; callers who need a listener to run dispatch
explicitly. The absence is documented rather than left to be discovered.

**8. NFR-14 is amended, because 11.1 already diverged from its letter.** The clause said
*every* `/dom` export throws without a document. But `bindElements(map, {root})` does not —
it acts on the root it is given, and 11.1 shipped a test asserting exactly that as a
feature. `delegate(root, …)` and the setters are the same shape. The accurate rule, now in
the spec: **an export that resolves the *ambient* document throws when there is none; an
export handed an explicit node needs no global document.** Requiring one a function never
reads would be a check for its own sake, and would make these unusable inside a server-side
DOM implementation.

## Alternatives Considered

- **`removeEventListener` with a retained reference.** The conventional approach, and it
  requires keeping the handler, type, and capture flag aligned between add and remove — a
  triple that drifts. It also makes idempotence something to implement rather than inherit.
  Rejected once `{signal}` proved to be within the floor (Safari 15, Node 15.4 — checked
  against BCD, not assumed).
- **Pass only the event, letting callers call `closest` themselves.** Smaller surface, and
  it hands back the exact detail people get wrong, including the missing containment check.
- **Let `closest` match freely, without `root.contains`.** Fewer bytes; silently matches
  ancestors outside the delegated subtree.
- **Throw on a nullish element** in the setters, for consistency with "validate everything".
  Rejected: it reinstates the per-call guard the function exists to remove.
- **`setVisible` driving both the attribute and the class.** "More thorough", and the source
  of the stuck-element bug: two mechanisms, one CSS specificity contest.
- **`setValue` dispatching `input`/`change`** (optionally via `{notify: true}`). Genuinely
  useful for frameworks observing the field, and rejected here as scope: it is a behaviour
  change from the assignment it replaces, it can re-enter the caller's own handler, and it
  belongs to a deliberate decision rather than a default. Recorded so a future item can add
  it explicitly.
- **A `setChecked` / `selectOption` split instead of one polymorphic `setValue`.** Honest,
  and it pushes the element-type branch back to every call site — which is the branch the
  function exists to absorb.
- **Inventorying every DOM member 11.2 touches** (`closest`, `classList`, `toggleAttribute`,
  `contains`). Rejected as noise: all are a decade old and universally available, and the
  scanner cannot see them anyway (they are members of parameters). Only the one
  floor-adjacent API — the `addEventListener` `{signal}` option — is declared by hand, which
  is where a hand-written entry earns its keep.

## Consequences

- Every listener this entry attaches has a defined end: an idempotent unsubscribe, an
  `AbortSignal`, or both, and the bridge between them self-cleans. NFR-15 is asserted
  mechanically — one attachment regardless of matching-node count, and no handler call after
  teardown.
- Delegation removes the rebind-per-render cycle for anything that re-renders, which is what
  makes the M13 table binding tractable: it will wire controls once and never rebind rows.
- The setters are symmetric by construction, so the classic stuck-element bug cannot be
  written with them.
- `setValue`'s silence about events is a documented contract. Anyone relying on a
  framework-visible change must dispatch explicitly — stated in the JSDoc and pinned by a
  test that asserts no `input` or `change` fires.
- `/dom` grows 639 B → **1210 B** (row re-baselined to 1.3 kB, inside NFR-12's 4 kB clause);
  `delegate` 392 B, `setEnabled` 201 B, `setVisible` 256 B, `setValue` 299 B — every plain
  function comfortably inside its 1 kB clause.
- The inventory gains a 28th entry whose purpose is the **floor comparison**, not the
  deny-by-default scan. That asymmetry is worth naming: ADR-0028's scanner sees globals, so
  an API reached off a parameter can only be governed by a deliberate declaration.
- One correction carried forward: the first draft of that entry asserted Safari added
  `{signal}` in exactly 15.4. It is 15. A hand-typed version claim is precisely what this
  inventory exists to prevent, and the BCD lookup caught it immediately — which is the gate
  working on its author.

## References

- [spec 03 §2 F44–F45, NFR-14, NFR-15](../specs/03_spec_dom_ui_table.md) — the contract, with
  NFR-14 as amended here
- [ADR-0028](0028-dom-entry-fails-fast-and-the-floor-gate-sees-the-dom.md) — the entry's
  fail-fast contract, structural type checks, and the scanner's documented limits
- [ADR-0004](0004-signal-first-cancellation-contract.md) — the signal-first convention this
  carries from async cancellation into DOM listener lifetimes
- [MDN: `EventTarget.addEventListener`, `signal` option](https://developer.mozilla.org/docs/Web/API/EventTarget/addEventListener#signal)
