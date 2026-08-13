# ADR-0055: The sanitizer's peer is looked up, not imported — one contract for both peers

- **Status:** Accepted
- **Date:** 2026-08-12
- **Deciders:** Daniel Polo (owner), agent (senior project architect persona)
- **Related:** ROADMAP 17.6 (and 18.1, which proves this in three engines),
  `docs/releases/v1.0.0-readiness-review.md` (the finding this pre-empted),
  [ADR-0041](0041-a-peer-looked-up-not-imported.md) (the contract this adopts, and whose
  reasoning for the opposite choice here is revisited), [ADR-0012](0012-sanitize-default-profile.md)
  (the static import this replaces), [ADR-0030](0030-sanitize-is-a-required-parameter.md)
  (injection over import, the house pattern), [ADR-0046](0046-one-proposal-triaged-and-the-no-bundler-wave-adopted.md)
  and [spec 05](../specs/05_spec_browser_distribution.md) F82 (the premise that changed),
  [ADR-0051](0051-the-sanitizer-s-peer-range.md) (the peer's version range)

## Context

Two optional peers, two opposite mechanisms:

- **`/sanitize`** does `import createDOMPurify from 'dompurify'` at module scope (ADR-0012).
- **`/bootstrap`** *looks up* `options.bootstrap`, then `globalThis.bootstrap`, and throws
  `EGL_PEER_MISSING` at the first operation that needs it (ADR-0041).

**ADR-0041 justified that asymmetry, and its reasoning was sound at the time:** a static
import "is right *there*, because the entry exists only to use DOMPurify — a consumer who
imports `/sanitize` has already decided to install it. It is wrong *here*: `/bootstrap` is
one entry holding ~30 managers, of which the fourteen already shipped need no peer at all."

**What changed is the premise, not the argument.** That reasoning assumes an npm consumer
whose bundler resolves bare specifiers. ADR-0046 adopted the no-bundler wave and spec 05
makes the plain HTML page a first-class consumer, and for that consumer the static import is
not merely inelegant — it is **fatal at load**:

```
Uncaught TypeError: Failed to resolve module specifier "dompurify"
```

The module dies before any typed error of ours can speak, so nine of ten entries load from a
static file server and the tenth cannot. Spec 05 F82 is written mechanism-neutral and defers
the choice here; the 17.1 readiness review reached the same finding independently and
recorded that 17.6 already owned it.

There is no resolution trick that serves both: a bundler and a bundler-free browser both take
the `import` condition, so no `exports` condition can hand one a static import and the other
a lookup. The choice is genuinely exclusive — static import, or lookup.

## Decision

**1. The DOMPurify module is a value looked up, never imported.** `options.dompurify`, then
`globalThis.DOMPurify`, then `PeerMissingError` with code `EGL_PEER_MISSING` and
`.peer === 'dompurify'`. The `/sanitize` entry therefore carries **no bare specifier** and
loads anywhere. This is ADR-0041's contract verbatim, including its two supporting rules:

- **No dynamic `import()`.** It would make `sanitizeHtml` asynchronous — the same "tail
  wagging the dog" ADR-0041 rejected, and worse here, because a sync sanitizer is what makes
  `element.innerHTML = sanitizeHtml(x)` expressible at all.
- **Not memoized negatively.** A `<script>` that lands after a failed call is a normal
  loading order, not an error to remember.

**2. Both module shapes are accepted.** A **factory** (the package's default export, and what
Node sees) is bound to the explicit `window`, or to the ambient one. A **bound instance** —
what `purify.min.js` leaves on `window.DOMPurify` — is used as-is and cannot be rebound, so a
`window` option cannot change its DOM. Fixing the shape detection exposed a latent bug: the
old code assumed the factory shape whenever `window` was given, which was unreachable while
the module could only arrive by import and throws `purify is not a function` the moment a
caller injects a bound instance.

**3. The peer is resolved before the DOM, and the two failures stay distinct.** No module is
`EGL_PEER_MISSING`; no DOM is the `TypeError` naming the jsdom remedy. You cannot bind a
sanitizer to a window without the sanitizer, and the remedies are different (install/inject
versus supply a DOM). Under the static import the peer could not be missing, so the two were
never separable; now they are, and each says what to do.

**4. A module that is reachable but not a sanitizer is a `TypeError`, not a peer error.**
Unreachable and unusable are different faults with different remedies — the same distinction
ADR-0041 point 4 draws, resolved the other way there because a partial `bootstrap` namespace
leaves the *capability* unreachable, whereas a wrong value passed to `dompurify` is a
programmer error in the call.

**5. The browser fixture drops its import map**, and that absence is now an assertion. It
supplies DOMPurify with a classic `<script src=".../purify.min.js">`, which is the ambient
half of this contract and exactly what the target page does.

## Alternatives Considered

- **Keep the static import; document that the no-bundler path needs an import map.** The
  zero-churn option, and the one with the best bundler ergonomics. Rejected: it contradicts
  spec 05 F82, which the owner adopted in ADR-0046, and it freezes the load-time failure at
  1.0 — after which fixing it breaks bundler consumers anyway. The whole reason this item is
  pre-1.0 is that the choice cannot be deferred cheaply.
- **A `createSanitizer({ dompurify })` factory returning a bound `sanitizeHtml`**, mirroring
  ADR-0025's injected client. Genuinely nicer for a bundler consumer: inject once, call
  everywhere. **Deferred, not rejected** — it is purely additive (a new export, a minor), so
  it can land in 1.x if practice shows the per-call option grates, whereas the *contract*
  must be frozen now. Shipping both at once would give 1.0 two ways to do one thing before
  anyone has evidence which is needed.
- **A module-level `useDomPurify(mod)` registration.** One line at startup, no per-call
  option. Rejected: process-wide mutable registration is the static-singleton shape ADR-0031
  set out to replace, and it makes the resolved peer depend on import order across a
  dependency tree — the failure mode being silent and load-order-dependent.
- **Setting `globalThis.DOMPurify` from a bundler build as the documented path.** Rejected as
  advice: telling application code to write a global to configure a library is worse than an
  explicit parameter, and it collides with any other consumer of that name.
- **Keeping a static import in a second entry** (`/sanitize/auto`) that registers the peer,
  leaving `/sanitize` lookup-based. Rejected for 1.0: it adds an exports-map path and a
  second way to reach the same behaviour, to save bundler consumers one option — and it
  depends on the registration mechanism rejected above.

## Consequences

- **BREAKING for bundler consumers.** `sanitizeHtml(html)` used to work after
  `pnpm add dompurify`; it now throws `EGL_PEER_MISSING` unless the module is injected or
  global. The remedy is one option, or a one-line local binding
  (`const clean = (html) => sanitizeHtml(html, { dompurify: DOMPurify })`), and it is in the
  README and the JSDoc. This is why the item is pre-1.0: post-1.0 it costs a major.
- **A build-time guarantee becomes a runtime one, and that is the real cost.** With a static
  import a missing peer failed the bundler; now it fails at the first sanitize call. The
  security property is unchanged — absence is a loud typed throw, never a silent pass-through
  of unsanitized HTML, and a test asserts exactly that — but the failure moved later, and
  saying so plainly is part of accepting it. ADR-0030's precedent is the same trade in the
  same area: `injectFragment` made the sanitizer an explicit required parameter rather than a
  quiet default.
- **`/sanitize` loads with no bundler and no import map**, which is F82's outcome. The
  three-engine proof and the documented no-bundler snippets remain **18.1**'s and **18.4**'s;
  this ADR ships the mechanism plus the fixture change that makes the absence of the import
  map load-bearing today.
- **The `/errors` taxonomy gains a second user of `PeerMissingError`.** `.peer` now
  distinguishes `'bootstrap'`, `'@popperjs/core'` and `'dompurify'` — the field ADR-0041
  added for exactly this.
- One new option (`dompurify`) on `SanitizeOptions`; under ADR-0047 the destructuring is the
  schema, so it is accepted by construction and every other key still rejects.
- **`/sanitize` no longer has an external dependency in its module graph**, so the entry's
  own budget row measures the whole entry rather than the whole entry minus a peer the
  bundler would add. `dompurify` stays an optional peer at `^3.4.13` (ADR-0051), unchanged.

## References

- [ADR-0041](0041-a-peer-looked-up-not-imported.md) (the contract adopted here),
  [ADR-0012](0012-sanitize-default-profile.md) (the static import replaced),
  [ADR-0030](0030-sanitize-is-a-required-parameter.md), [ADR-0031](0031-component-instances-and-the-alert-budget.md)
  (why a registry was rejected), [ADR-0051](0051-the-sanitizer-s-peer-range.md).
- [spec 05](../specs/05_spec_browser_distribution.md) §1 and F82; ROADMAP 17.6, 18.1, 18.4.
- `docs/releases/v1.0.0-readiness-review.md` (the finding, recorded as already owned by 17.6).
