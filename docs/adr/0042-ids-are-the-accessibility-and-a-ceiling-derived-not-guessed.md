# ADR-0042: Ids are the accessibility — and the first ceiling derived rather than guessed

- **Status:** Accepted
- **Date:** 2026-08-08
- **Deciders:** Daniel Polo
- **Related:** [spec 04 §2 F72–F76, §3 NFR-17/NFR-21](../specs/04_spec_bootstrap_toolkit.md)
  (NFR-17's wrapper and manager ceilings amended), ROADMAP 16.2,
  [ADR-0041](0041-a-peer-looked-up-not-imported.md) (the F68 contract these copy, the
  lifecycle this generalises, and the budget rule this is the first to *apply*),
  [ADR-0037](0037-builder-contract-nodes-escape-and-the-atom-budget.md) (the F52 builder
  contract the three managers build under),
  [ADR-0038](0038-composites-compose-and-what-a-frozen-constant-costs.md) and
  [ADR-0040](0040-one-grammar-one-pager-and-a-ceiling-below-its-own-parts.md) (the two
  earlier ceilings that sat below their own parts),
  [ADR-0015](0015-final-size-budgets-and-the-httpclient-exception.md) (measure, then amend)

## Context

The navigation set is the first group where **most** of the components build markup rather
than merely drive it. That is not an aesthetic choice: Bootstrap's collapse, accordion,
tabs and navbar express their accessibility through **ids** — `aria-controls` naming the
region a button opens, `aria-labelledby` naming the header that titles a panel,
`data-bs-target` naming what a tab switches to. Ids are exactly what hand-written markup
gets wrong, and wrongly in the worst way: an `aria-controls` pointing at a stale id is not
a visible defect, it is a silent one, and a duplicate id is worse still because every
relationship then resolves to the same first element and *looks* correct in a spot check.

So three decisions were open. **Where ids come from**, given that a module-level counter is
the obvious answer and the wrong one. **Whether the wrappers keep copying the 16.1
lifecycle**, now that there would be five copies of a `destroy` whose ordering is subtle.
And **what these five cost**, against ceilings that spec 04 wrote before any of them
existed.

## Decision

**1. Ids are minted against the live document, plus a per-build reservation set.**
`uniqueId(doc, prefix, reserved)` asks `doc.getElementById` and retries until the name is
free. A module-level counter was rejected outright: two copies of this library on one page
— the dual-package hazard spec 01 §4 forbids sharing state across — would each count from
one and collide on the same document, which is precisely the failure ids must not have. The
document is the only authority that is not shared state, and it is exact rather than
probabilistic, which a random suffix would not be.

The `reserved` set closes the gap the document alone cannot, and it was **found by a test
rather than by reasoning**: a manager builds into a `DocumentFragment` and appends once, so
while it is building, `getElementById` cannot see anything it has already minted. Without
the set, every pane in one accordion took the same id and every `aria-controls` resolved to
the first — the exact "looks correct" failure this design exists to prevent, reproduced by
the design meant to prevent it. The test that caught it asserts
`document.getElementById(pane.id) === pane` per item, which is the only form of the
assertion that could have failed.

**2. The lifecycle is extracted, not copied.** `behaviourWrapper(target, options, spec)` now
owns what ADR-0041 wrote inline for `bsModal`: lazy resolution, subscriptions returning an
idempotent unsubscribe, open/closed state read from the DOM rather than from our own calls,
and the `destroy` that hides an open component first and disposes on its closing event.
`bsModal`, `bsCollapse` and `bsDropdown` are now configurations of it. The alternative was
five copies of an ordering that is easy to get subtly wrong in one of them and never notice.

`hideBeforeDispose` is the one parameter, and it exists because `Tab` is not like the
others: its "shown" means a panel is selected, not that an overlay is up, so there is
nothing to close before disposing.

**3. Managers build *or* adopt, through the same query.** Given `items`/`tabs` a manager
builds; given none it adopts existing markup by the same selector its own output satisfies
(`.accordion-item`, `[data-bs-toggle="tab"]`). One wiring path serves both, so adoption
cannot drift from construction — and `destroy()` removes only what it built, because
removing markup the caller wrote would be a surprise.

**4. Exclusivity, keyboard behaviour and positioning stay Bootstrap's.** The accordion
passes `parent` and lets Bootstrap close siblings; the tabs set `data-bs-toggle="tab"` and
let Bootstrap's Tab plugin own arrow-key roving; the navbar's dropdowns are F74 wrappers
rather than bespoke menus. A second implementation of any of these would fight the first.

**5. One deviation from Bootstrap's defaults, deliberately.** `bsCollapse` passes
`toggle: false`. Bootstrap's constructor toggles by default, and resolution here is lazy —
the constructor runs at the first `show()`/`toggle()` call, so the default would fire the
action twice.

## Alternatives Considered

- **A module-level id counter.** Rejected: shared mutable state, and it collides in exactly
  the dual-package case spec 01 §4 names.
- **A random id suffix** (`crypto.randomUUID`, `Math.random`). Rejected: probabilistic where
  an exact answer is available, and it would pull the crypto surface onto an entry that has
  no other use for it. `Math.random` is barred outright (ADR-0008).
- **Deriving ids from the container's id.** Rejected: containers frequently have none, and
  two managers in one container would still collide.
- **Copying the 16.1 lifecycle per component.** Rejected at the fifth copy; see decision 2.
- **Reimplementing accordion exclusivity** rather than passing Bootstrap's `parent`.
  Rejected: it duplicates behaviour the peer already owns and would disagree with it the
  moment a caller mixes our items with data-API ones.
- **Making the toggler wiring a separate export** so a bare `bsCollapse` could stay under
  the 1.25 kB wrapper clause. Rejected: the wiring is F72's stated value, and splitting an
  API to flatter a budget is the inversion this project has refused twice already.

## Consequences

- **NFR-17 amended for four of the five, and the amendment is the first *derived* one.**
  ADR-0041 stated the rule — a ceiling for a composing symbol comes from the rows of what it
  composes, never from an estimate — and this is its first use as arithmetic rather than as
  a post-mortem:
  - `bsDropdown` **1160 B**, row 1.24 kB: inside the ≤ 1.25 kB wrapper clause, which is
    what a wrapper that only wraps should measure. It and `bsModal` are the evidence the
    clause is right for its class.
  - `bsCollapse` **1380 B**, row 1.48 kB, clause raised to **1.5 kB**: it wires a toggler —
    id minting, `aria-expanded`, the `collapsed` class, teardown of both — which is a job a
    bare wrapper does not carry. The same "wrapper that also does something" distinction
    ADR-0041 drew for `bsToast`.
  - `bsAccordion` **2490 B**, row 2.66 kB, clause **2.75 kB** (from 1.5 kB): it composes
    `bsCollapse` at 1380 B, so the old ceiling sat 120 B *below one of its parts*.
  - `bsTabs` **2050 B**, row 2.19 kB, clause **2.25 kB** (from 1.5 kB).
  - `bsNavbar` **2770 B**, row 2.96 kB, clause **3 kB** (from 1.5 kB): composes
    `bsCollapse` (1380 B) and `bsDropdown` (1160 B) — 2540 B of parts, so **230 B is its
    own**. Predicted before measuring, and the measurement agreed.
  - The `/bootstrap` entry row moves to 18.6 kB on a measured 17334 B, inside the 25 kB
    clause ADR-0041 sized for the finished catalogue — which is why no clause changed here.
- **`bsModal` grew 52 B** (1060 → 1180 B) as the price of the shared helper. It stays inside
  its unchanged clause, and the row records the reason: five copies of a subtle teardown
  cost more than 52 B of the wrong kind.
- **A convention corrected in passing.** `bsToast` resolved the *ambient* document while
  every other container-taking manager (`bsTable`, `bsPagination`) uses the container's own.
  For a container inside an iframe that builds nodes in the wrong document. Fixed here,
  before v0.8.0 makes it a shipped behaviour, and the same rule is what the new managers
  follow.
- **Playwright now exercises Bootstrap's plugins against our generated markup**, which is
  the only place the "Bootstrap accepts what we built" claim can be tested: a tab it will
  not switch to, or a collapse whose transition never fires, looks perfectly correct in
  jsdom.

## References

- [spec 04 §2 F72–F76, §3 NFR-17/NFR-21](../specs/04_spec_bootstrap_toolkit.md)
- [ADR-0041](0041-a-peer-looked-up-not-imported.md),
  [ADR-0038](0038-composites-compose-and-what-a-frozen-constant-costs.md),
  [ADR-0040](0040-one-grammar-one-pager-and-a-ceiling-below-its-own-parts.md)
- WAI-ARIA Authoring Practices: the tabs pattern's `tablist`/`tab`/`tabpanel` triple and the
  disclosure pattern's `aria-expanded`/`aria-controls` pair.
