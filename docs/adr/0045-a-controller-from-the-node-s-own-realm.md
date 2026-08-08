# ADR-0045: A controller from the node's own realm — and a bug report that undercounted

- **Status:** Accepted
- **Date:** 2026-08-09
- **Deciders:** Daniel Polo
- **Related:** [BUG-0003](../bugs/2026/08/BUG-0003-cross-realm-abort-signal-in-composites.md)
  (closed by this record), ROADMAP 16.5,
  [spec 03 §3 NFR-14/NFR-15](../specs/03_spec_dom_ui_table.md) (the teardown contract the
  controller serves, and the Node-safety split it was breaking),
  [spec 04 §2 F52](../specs/04_spec_bootstrap_toolkit.md) (the `{document}` option this
  restores), [ADR-0037](0037-builder-contract-nodes-escape-and-the-atom-budget.md) (which
  introduced the injectable document),
  [ADR-0042](0042-ids-are-the-accessibility-and-a-ceiling-derived-not-guessed.md) (the
  sibling rule for ids, and the same reasoning about not assuming one realm)

## Context

Every export in this library that owns its teardown creates an `AbortController` and hands
its `signal` to `addEventListener`, so one `abort()` detaches everything at once (NFR-15).

`addEventListener` brand-checks the `signal` member of its options dictionary **against its
own realm**. A controller built in *this* realm is therefore refused by a node from another
one — a `new JSDOM()` document under Node, an `<iframe>`, a popup — with a platform
`TypeError` naming an internal detail and neither the option nor the realm:

```text
Failed to execute 'addEventListener' on 'EventTarget': parameter 3 dictionary has
member 'signal' that is not of type 'AbortSignal'.
```

That is precisely the server-render and iframe path the `{document}` option was added for
in ADR-0037, so the option worked for every builder that rendered and failed for every
builder that also listened.

BUG-0003 named three components — `bsAlert`, `bsPagination`, `bsListGroup({onSelect})` —
because those were the three the NFR-18 suite happened to exercise. Grepping for the
construct found **seven**: those three plus `bsTable`'s row delegation, `inlineAlert`,
`delegate`, `autoGrow` and `bindTableControls`. The report undercounted by more than half,
which is worth recording: a defect found through one test is scoped by that test, not by
the code.

## Decision

**One seam, `controllerFor(node)` on `dom-helpers.js`**, used by all seven call sites. It
resolves `node.ownerDocument.defaultView.AbortController` and constructs from that, falling
back to this realm's when there is no view.

The fallback is not a last resort, it is the correct answer for a real case:
`document.implementation.createHTMLDocument()` produces a document with **no browsing
context and therefore no `defaultView`**, and its nodes belong to this realm already — so
the same code path serves the detached-document case and the genuinely-foreign one.

A seam rather than seven inline fixes, because the trap is structural: every listener-owning
export written from here on inherits it, and would inherit it *silently* — the failure only
appears when someone passes a foreign document, which is the least-travelled path and the
one with no coverage by default. It also mirrors the rule ADR-0042 set for ids: **ask the
node where it lives rather than assuming there is only one answer.**

**The fix is proved by a listener that fires, not by a call that does not throw.** The
regression test in the Node-safety suite dispatches a real event in the foreign realm and
asserts the handler ran, then destroys and asserts it stopped. A controller nobody rejected
and nobody used would pass a does-not-throw assertion perfectly.

## Alternatives Considered

- **Fixing the three components BUG-0003 named.** Rejected once the grep found seven: the
  report was scoped by its discovering test, and shipping a fix that matched the report
  rather than the code would have left four live instances of the same defect.
- **Dropping the internal controller and tracking listeners by hand** (keeping references,
  removing each in `destroy`). Rejected: it is the pattern `AbortController` exists to
  replace, it loses the `{signal}` composition NFR-15 depends on, and it multiplies the
  bookkeeping across seven call sites to avoid one three-line helper.
- **Documenting the limitation** — "pass your own `signal` when using a foreign document".
  Rejected: it pushes a platform subtlety onto the caller, in the one scenario where they
  are least likely to be testing.
- **A browser Playwright case.** Deliberately **not** added: browsers accept cross-realm
  platform objects here, so the case would have passed before the fix as well. A test that
  cannot fail is not evidence, and saying so is more useful than the green tick.

## Consequences

- **Seven call sites fixed by one helper**, and the `{document}` option now works for
  builders that listen as well as builders that render — closing the gap between what
  ADR-0037 promised and what shipped.
- **BUG-0003 is closed**, and its record amended to name all seven rather than the three it
  was filed with.
- **Two stale statements removed from the test suite**: the pinned known-failure case, and a
  comment in the Node-safety suite explaining why an interactive builder could not be
  exercised there. Both are replaced by the behaviour they were standing in for.
- **No budget moved.** The shared helper replaces seven inline constructions, so the entries
  it touches measure the same or marginally less.
- **M16 completes with this item**, and with it the whole M14–M16 Bootstrap wave: spec 04's
  F52–F81 delivered, the 24-component catalogue closed in 16.4, and the last known defect
  in it closed here.

## References

- [BUG-0003](../bugs/2026/08/BUG-0003-cross-realm-abort-signal-in-composites.md)
- [ADR-0037](0037-builder-contract-nodes-escape-and-the-atom-budget.md),
  [ADR-0042](0042-ids-are-the-accessibility-and-a-ceiling-derived-not-guessed.md)
- DOM Standard: `addEventListener`'s `AddEventListenerOptions.signal`, and Web IDL's
  per-realm interface brand checks.
