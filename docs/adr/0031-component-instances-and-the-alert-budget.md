# ADR-0031: Components are instances that own their state — and what one costs

- **Status:** Accepted
- **Date:** 2026-08-07
- **Deciders:** Daniel Polo (maintainer), agent (senior project architect persona)
- **Related:** [spec 03](../specs/03_spec_dom_ui_table.md) §2 F49 and NFR-12/NFR-15;
  ROADMAP 12.1; [ADR-0030](0030-sanitize-is-a-required-parameter.md) (the
  `{ html, sanitize }` contract mirrored here),
  [ADR-0029](0029-delegation-teardown-and-setter-symmetry.md) (teardown as a signal),
  [ADR-0028](0028-dom-entry-fails-fast-and-the-floor-gate-sees-the-dom.md) (the `/dom`
  fail-fast rule and its 11.2 amendment),
  [ADR-0015](0015-final-size-budgets-and-the-httpclient-exception.md) (the precedent for a
  named, measured budget exception), [ADR-0010](0010-storage-in-memory-fallback-contract.md)
  (why a silent fallback is right for storage and wrong here)

## Context

`inlineAlert` (F49) is the first **UI component** in the library, and 12.2's overlay plus
the whole spec-04 toolkit will copy whatever shape it establishes. Two questions had to be
settled before any of them exist.

**How a component holds state.** The shape this library is replacing is the static
singleton: one class, static fields, `onInit(containerId)`. It is convenient exactly once.
The moment a page has two alerts — the usual pair is one at page level and one inside a
dialog — the second `onInit` re-points the single static slot, so the dialog's alert
inherits the page alert's pending auto-hide timer and writes into whichever container
initialised last. The failure is silent, intermittent, and reads as "the message
disappeared too early".

**What a component is allowed to assume.** A component that hardcodes `alert-success` and
a Material ligature has quietly made adopting it mean adopting Bootstrap and an icon font.
For a library whose root entry has zero runtime dependencies, importing a design system
through class-name literals is the same coupling wearing a disguise.

A third question arrived with the measurement. Spec 03 NFR-12 wrote an **indicative**
per-component ceiling of 1.25 kB before the component existed. The implementation measures
**1382 B**.

## Decision

**1. Components are factories returning instances that own everything they touch.**
`inlineAlert(container, options)` returns `{ show, hide, destroy }` closed over that
instance's nodes, its timer, and its own `AbortController`. Two instances on one page share
nothing. There is no module-level mutable state, which is also what keeps the dual-package
build honest (spec 01 §4).

**2. Policy is injected; only mechanism ships.** `classes` and `icons` are maps merged over
neutral, framework-free BEM defaults (`egl-alert`, `egl-alert--success`, …) that style
nothing until a consumer writes CSS. No icon set is bundled or named. A Bootstrap look is
one `classes` map away, and the library never learns that Bootstrap exists — the same
boundary the spec-04 toolkit will sit on the far side of.

**3. Text by default, markup by decision.** `message` is written with `textContent`. Rich
content requires the explicit `{ html: true, sanitize }` pair, byte-for-byte the F47
contract from [ADR-0030](0030-sanitize-is-a-required-parameter.md): a sanitizer, or the
literal `false` to declare the markup trusted; omitting it throws. One rule for injected
HTML across the entry beats two rules a reader has to keep apart.

**4. Teardown is total, and using a dead instance is loud.** `destroy()` aborts the
internal controller (detaching the close-button listener), clears any pending timer, and
removes the node it added — nothing else in the container. An external `signal` destroys
the instance too, so a component tears down on the same signal as the listeners around it
(NFR-15). Calling `show()` after `destroy()` throws a `TypeError` rather than doing
nothing: a silent no-op here would report success while the page stayed unchanged, which is
precisely the failure [ADR-0028](0028-dom-entry-fails-fast-and-the-floor-gate-sees-the-dom.md)
refuses to ship. `hide()` after `destroy()` stays harmless, because idempotent teardown must
not punish a defensive caller.

**5. Nodes are built in the container's own document.** `container.ownerDocument` first,
the ambient document only as a fallback. An alert inside an iframe or a server-side DOM
implementation therefore works, consistent with NFR-14 as amended in 11.2: only an export
that reaches for the *ambient* document may demand one.

**6. The per-component budget is pinned at the measurement: the `inlineAlert` clause moves
from 1.25 kB to 1.5 kB, with the size-limit row at 1.48 kB (measured 1382 B + 7%).**
Spec 03 §3 NFR-12 is updated in this PR accordingly. The 1.25 kB figure was written before
the contract was: it did not account for the F47-parity sanitize decision and its
explanatory message, the `ownerDocument` path, the `AbortSignal` teardown NFR-15 requires,
or the `role` mapping that makes the alert audible to a screen reader. Those are contract
obligations, not ornament, and the honest response to "the guess was low" is to record the
measurement, not to delete an obligation to protect a guess. The entry-level promise that
actually governs consumers — **`/dom` ≤ 4 kB** — is untouched and comfortable: the full
entry measures 2958 B.

## Alternatives Considered

- **A static singleton with an `onInit(container)` call** — the shape being replaced.
  Rejected because it is the source of the stolen-timer and stolen-container defects
  described above; the convenience it buys is one saved variable.
- **A class (`new InlineAlert(...)`)** — rejected for consistency: every stateful surface in
  this library is a lowercase factory (`httpClient`, `asyncQueue`, `logger`,
  `tablePipeline`), and a class additionally exposes a prototype to SemVer for nothing.
- **Shipping a Bootstrap class map as the default** — rejected: it would make the common
  case pretty and every other case a fight, and it would bind a zero-dependency library to
  one design system's release cycle. The toolkit that *does* know Bootstrap lives behind its
  own entry (spec 04) precisely so this one does not.
- **Sanitizing markup by default with the `/sanitize` entry** — rejected for the reason
  ADR-0030 already settled: it would make `/dom` silently depend on the DOMPurify optional
  peer. Deferred to the caller, loudly.
- **Trimming the component to fit the 1.25 kB guess** — considered seriously and partly
  done (the error prose was shortened, saving 29 B). Going further meant deleting the icon
  factory, the accessible close label, or the `role` mapping — capabilities the contract
  asks for. Rejected: a budget is a guard against accidental growth, not an argument for
  removing what the spec requires. This is the ADR-0015 situation, resolved the ADR-0015
  way — a named, measured row rather than a mutilated function.
- **Exempting components from per-item rows entirely**, leaning only on the `/dom` entry
  budget — rejected: the per-item row is what makes a future regression attributable to a
  specific export instead of showing up as "the entry got bigger".

## Consequences

- 12.2's `loadingOverlay` and every spec-04 component inherit this template: factory,
  injected policy maps, owned teardown, loud use-after-destroy. Reviewers have one shape to
  check against.
- Consumers must supply CSS. The defaults are deliberately inert, so an alert with no
  stylesheet renders as unstyled text — visible and readable, but plainly unstyled. The
  README example shows the class map that adopts a framework in one option.
- `.size-limit.json` carries a named component row with the measured figure in its name, so
  the next change to this file has to justify itself against a real number.
- Spec 03 NFR-12's indicative ceiling for F49 is now a pinned, measured one. F50's 1.25 kB
  figure remains indicative and will be pinned the same way when 12.2 lands — including, if
  the measurement warrants it, at a lower number.
- A component that is created but never shown leaves the container untouched: the nodes are
  built on first `show()`, so `inlineAlert` costs nothing until it is used.

## References

- [spec 03 §2 F49](../specs/03_spec_dom_ui_table.md) — the contract, and §3 NFR-12/NFR-15
  for the budget and teardown rules
- [ADR-0030](0030-sanitize-is-a-required-parameter.md) — the `{ html, sanitize }` pair this
  mirrors
- [ADR-0015](0015-final-size-budgets-and-the-httpclient-exception.md) — the precedent for a
  named, measured budget exception
- [`docs/security/threat-model.md`](../security/threat-model.md) — the untrusted-HTML boundary
- [MDN: ARIA `alert` and `status` roles](https://developer.mozilla.org/docs/Web/Accessibility/ARIA/Roles/alert_role)
  — why a failure interrupts and a confirmation waits
