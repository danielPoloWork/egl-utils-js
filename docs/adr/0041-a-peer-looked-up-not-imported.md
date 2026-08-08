# ADR-0041: A peer looked up, not imported — and the one place containment loses

- **Status:** Accepted
- **Date:** 2026-08-08
- **Deciders:** Daniel Polo
- **Related:** [spec 04 §2 F68–F71, §3 NFR-17/NFR-18](../specs/04_spec_bootstrap_toolkit.md)
  (F68's error class and plumbing are fixed here; F70 amended to publish the instance;
  NFR-17's wrapper ceilings amended), ROADMAP 16.1,
  [ADR-0012](0012-sanitize-default-profile.md) (the optional-peer precedent, and where this
  departs from it), [ADR-0032](0032-overlay-gate-refcount-floor-and-focus.md) (the F50 gate
  this presents, and the containment rule this overrides once),
  [ADR-0037](0037-builder-contract-nodes-escape-and-the-atom-budget.md) (the builder
  contract the toast composes), [ADR-0039](0039-a-facade-with-a-door-and-what-the-table-costs.md)
  (the door precedent), [ADR-0003](0003-error-taxonomy-and-stable-codes.md) (stable codes,
  checked never with `instanceof`), [ADR-0015](0015-final-size-budgets-and-the-httpclient-exception.md)
  (measure, then amend), [BUG-0003](../bugs/2026/08/BUG-0003-cross-realm-abort-signal-in-composites.md)
  (found by this PR's NFR-18 suite, filed as ROADMAP 16.5)

## Context

M16 opens the half of the Bootstrap toolkit that needs Bootstrap's own JavaScript. Spec 04
F68 froze three things — the stable code `EGL_PEER_MISSING`, that resolution is **lazy**,
and the order *injected → ambient → throw* — and deferred "the error class and plumbing" to
this record. Four questions are actually open, and each has a wrong answer that looks
reasonable.

**How the peer is reached.** The `/sanitize` entry sets a precedent: it does
`import createDOMPurify from 'dompurify'` at module scope (ADR-0012). That is right *there*,
because the entry exists only to use DOMPurify — a consumer who imports `/sanitize` has
already decided to install it. It is wrong *here*: `/bootstrap` is one entry holding ~30
managers, of which the fourteen already shipped need no peer at all. A static import would
make `import { bsBadge } from 'egl-utils-js/bootstrap'` fail for a consumer who never wanted
Bootstrap's JavaScript, and it would fail at **load**, where nothing is known about what the
caller asked for.

**When resolution happens.** "Lazily, at first use" still leaves a choice: is constructing
`bsModal(el)` a use? Applications wire their UI during setup, so resolving there means a
packaging mistake surfaces during an unrelated startup sequence rather than at the operation
that needs the package.

**What "present but incomplete" means.** `globalThis.bootstrap` may exist and not carry
`Modal` — a partial build, or somebody else's variable of the same name.

**And one genuine conflict.** F71 presents the F50 gate over a Bootstrap modal by supplying
`onShow`/`onHide`. ADR-0032 makes the gate **contain** a failing presentation hook: a
decoration that cannot render must never fail the operation it decorates. But a missing peer
resolved *inside* `onShow` would be contained too — and the caller would see no overlay, no
error, and no reason. Two rules of this library point in opposite directions, and one has to
yield.

## Decision

**1. `PeerMissingError` on `egl-utils-js/errors`, code `EGL_PEER_MISSING`, with `.peer`.**
Every stable code in this library has a class carrying it (ADR-0003), and the taxonomy is
the public contract; a bare `EglError` with an assigned code would be the first exception.
`.peer` names the npm package, so a consumer can branch on *which* peer without parsing a
message — F80/F81 will report `@popperjs/core` through the same field. Checked by `.code`,
never `instanceof`.

**2. The peer is a value lookup, never an import.** `resolveComponent` reads
`options.bootstrap`, then `globalThis.bootstrap`, and throws otherwise. There is no
`import 'bootstrap'` and no dynamic `import()` either: a dynamic import would be
asynchronous, and `modal.show()` is not — making every wrapper method a promise to
accommodate a package that a CDN consumer has already loaded synchronously would be the tail
wagging the dog. The consequence is a real constraint, stated plainly: a bundler consumer
must pass `{ bootstrap }` once, because a bundled application has no `window.bootstrap`.

**3. Resolution happens at the first operation that needs Bootstrap, not at construction.**
`bsModal(el)` resolves nothing; `show()`, `hide()`, `toggle()` and `instance()` do. So
wiring is free, failure points at the call that needs the package, and a bundle loaded after
the wrapper was built still works. The result is deliberately **not memoized negatively**: a
late `<script>` is a normal loading order, not an error to be remembered.

**4. A namespace without the component is the same code with a different message.** From the
caller's side the capability is unreachable either way; what differs is the remedy, and the
remedy lives in the message ("does not provide it — check that the full bundle is loaded").
An injected object missing the component is *also* this error rather than a `TypeError`,
because splitting the failure by the source of the namespace would make the same broken
state report itself two ways.

**5. F71 resolves the peer before the gate is engaged — containment loses, once.**
`bsLoadingOverlay.show()` and `.wrap()` resolve `Modal` first and let the throw escape; only
then do they delegate to F50. ADR-0032's containment still governs everything that happens
*inside* the hooks (a transition that fails mid-flight is still contained). The distinction
that decides it: containment protects the caller from a presentation that **cannot render**,
which is a runtime condition; a missing peer is a **packaging mistake**, which is a
programmer error, and NFR-18's whole promise is that it surfaces typed at the call. A silent
no-overlay is the worst of both — it satisfies the letter of containment while destroying
the only signal that would let anyone fix it.

**6. Two smaller ones, both about not fighting Bootstrap.** `getOrCreateInstance` is
preferred over `new` where the component offers it, so a dialog already instantiated by
Bootstrap's `data-bs-toggle` data-API is **adopted** rather than shadowed by a second object
driving one element. And `destroy()` on a *shown* modal hides it and disposes on
`hidden.bs.modal`, because disposing a shown dialog leaves Bootstrap's backdrop on the page
and the `<body>` scroll-locked; "shown" is tracked from the DOM events, not from our own
calls, since Escape and the dismiss button close a dialog without passing through this
wrapper.

**F70 is amended** to publish what it wraps: `instance()` and `element`, the same door
ADR-0039 put on `bsTable` for the same reason — a facade that cannot be escaped becomes a
ceiling.

## Alternatives Considered

- **Static `import 'bootstrap'`, as `/sanitize` does for DOMPurify.** Rejected: it would put
  a peer install between every consumer and `bsBadge`, and fail at load rather than at use.
  The precedent holds for a single-purpose entry, not for one entry with two halves.
- **Dynamic `import('bootstrap')` inside the resolver.** Rejected: it makes every wrapper
  method asynchronous, or forces an `await ready()` step before any of them — a worse API for
  every consumer, to serve the bundler consumer who can pass `{ bootstrap }` in one line.
- **Resolving at construction.** Rejected: it moves the failure to application startup, away
  from the operation that needs the package, and makes a late-loading bundle unusable.
- **A `TypeError` for an injected namespace missing the component.** Rejected: same broken
  state, two error shapes, decided by where the object came from.
- **Letting F50 contain the missing peer** (the mechanically consistent reading of
  ADR-0032). Rejected: the caller gets a silent no-op where NFR-18 promises a typed failure.
  Recorded as the single, bounded exception rather than left as an inconsistency to discover.
- **Reimplementing the close button inside `bsToast`** to save the ~763 B `bsCloseButton`
  costs. Rejected: "compose, never reimplement" is spec 04 §4's architecture, and the
  accessible-name rule NFR-21 enforces lives in that builder. The bytes are the price of the
  rule, and the row below says so.

## Consequences

- **`/errors` grows by 34 B** (measured 317 B → 351 B), far inside its 0.4 kB clause.
- **Three budget rows pinned on measurement, and two clauses amended by this ADR** — the
  established rule: trim the real fat first, then amend, never delete the obligation. A
  `querySelectorAll` used to patch attributes onto nodes the code had just built was removed;
  it recovered ~10 B, which is the honest answer to "is any of this fat".
  - `bsModal` **1060 B** → row 1.13 kB, inside NFR-17's ≤ 1.25 kB wrapper clause. A wrapper
    that builds nothing fits the clause, which is evidence the clause is right for its class.
  - `bsToast` **2170 B** → row 2.32 kB, **reclassified as a composing row**: it composes
    `bsCloseButton` and builds a node, which is a different job from wrapping a behaviour.
    The clause "every remaining behavior wrapper ≤ 1.25 kB" was written before the wave knew
    which wrappers also build.
  - `bsLoadingOverlay` **2550 B** → row 2.73 kB, clause amended from **1.75 kB**. The clause
    sat below its own parts once more: `loadingOverlay` measured 958 B in 12.2 and
    `bsSpinner` 778 B in 14.1 — 1736 B of composed parts against a 1792 B ceiling, leaving
    56 B for its own code. This is the third instance of the same error (ADR-0038's
    `bsBreadcrumb`, ADR-0040's `bsTable`), and the pattern is now explicit enough to state:
    **a ceiling written for a composing symbol must be derived from the rows of what it
    composes, not estimated.**
  - The **`/bootstrap` entry clause moves 15 kB → 25 kB**, with the row pinned at 16.2 kB
    against a measured 15083 B. The clause is sized for the *finished* catalogue — eleven
    more wrappers land in 16.2–16.4 — rather than amended once per PR, while the row keeps
    gating this PR's growth. The two instruments do different jobs and are now used
    differently on purpose.
- **The browser fixture stays peer-free.** The bundle is injected per test by the behaviour
  suites instead, because the fixture also serves 14.1's assertion that the entry works with
  **no** `bootstrap` global — making that test pass by loading Bootstrap for everybody would
  have deleted the proof rather than extended it.
- **A defect in already-shipped code surfaced** and is filed rather than folded in:
  BUG-0003, ROADMAP 16.5. The NFR-18 suite runs every builder in plain Node against a
  foreign document, and three composites throw there — each owns an internal
  `AbortController` whose signal a different realm's DOM refuses. The three are excluded by
  name in the test, with a pointer, so the gap is visible rather than skipped.
- **A bundler consumer must inject.** `{ bootstrap }` once per wrapper, or a small local
  factory that closes over it. Documented in the README rather than papered over.

## References

- [spec 04 §2 F68–F71, §3 NFR-17/NFR-18](../specs/04_spec_bootstrap_toolkit.md)
- [ADR-0012](0012-sanitize-default-profile.md), [ADR-0032](0032-overlay-gate-refcount-floor-and-focus.md),
  [ADR-0003](0003-error-taxonomy-and-stable-codes.md)
- [BUG-0003](../bugs/2026/08/BUG-0003-cross-realm-abort-signal-in-composites.md)
- Bootstrap 5.3 component lifecycle: `getOrCreateInstance`, `dispose`, and the `*.bs.*`
  event families the wrappers subscribe to.
