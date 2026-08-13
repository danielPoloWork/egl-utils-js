# ADR-0058: The per-function budget keeps its exceptions named, not exempted

- **Status:** Accepted
- **Date:** 2026-08-13
- **Deciders:** **Daniel Polo (owner — the decision this ADR records is his)**, agent
  (senior project architect persona, evidence and recommendation)
- **Related:** ROADMAP 17.4; [ADR-0015](0015-final-size-budgets-and-the-httpclient-exception.md)
  (which left this open, in those words), [ADR-0007](0007-http-client-facade-contract.md) (why
  `httpClient` composes `timeout`), spec 01 §3 NFR-01 (amended here), spec 02 §3 NFR-08 (which
  already states the chosen rule), spec 03 §3 NFR-12 and spec 04 §3 NFR-17 (which do not — see
  "What this does not change")

## Context

ADR-0015 measured NFR-01's per-function clause for the first time and immediately found it
violated by one function. It recorded the violation rather than hiding it, and left the
resolution to the owner in as many words:

> whether to accept the exception permanently, amend NFR-01 to exempt composing facades, or
> require a redesign is the owner's call.

A 1.0 freezes the clause, so the call had to be made. The roadmap item framed the evidence as
"practice has amended it four times over (`httpClient`, `bsTable`, `tablePipeline`,
`bindTableControls`)". **Measured before deciding, that framing turned out to be wrong** — those
four names are governed by *four different clauses*, and the one NFR-01 actually governs has
exactly one exception.

### The measurement

87 single-import rows exist; 29 measure over 1 kB. Grouped by the clause that governs them:

| Clause | Entry | Rows over 1 kB | What the clause says |
|---|---|---:|---|
| **NFR-01** (spec 01) | root | **1** — `httpClient` 1310 B | "any single function ≤ 1 kB", unqualified |
| NFR-08 (spec 02) | `/text` `/net` `/table` `/logging` `/storage` | 3 — `tablePipeline`, `logger`, `comparator` | 1 kB **+ named, measured exception rows, ADR-0015-style** |
| NFR-12 (spec 03) | `/dom` | 3 — `bindTableControls`, `inlineAlert`, `loadingOverlay` | 1 kB for *plain functions*; F42/F49/F50/F51 **categorically exempt**, with their own ceilings |
| NFR-17 (spec 04) | `/bootstrap` | 22 | class ceilings (atoms 1.2 kB, wrappers 1.25 kB, composites per-row) — **no 1 kB clause at all** |

On the root entry, where NFR-01 applies: **27 of 28 functions comply, and comfortably.** The
largest compliant is `retry` at 767 B — 25% under. The distribution runs 15 B (`VERSION`) to
767 B, then jumps to `httpClient` at 1310 B. There is no cluster pressing against the ceiling.

## Decision

**The clause stays `≤ 1 kB`, unqualified. A function that composes another public export and
cannot meet it takes a named, measured exception row, documented by ADR in the PR that lands
it — never silently, and never by deleting the row.**

Landed root exception: **`httpClient` at 1.35 kB** (measured 1310 B), for the composed `timeout`
+ `HttpError` that ADR-0007 deliberately reuses.

Two things make this the right shape rather than merely the conservative one:

1. **The pressure is doing real work.** 27 of 28 comply with 25% of headroom to spare. A clause
   that almost everything meets is a live constraint; exempting a category to accommodate one
   member would retire it for no measured benefit.
2. **It is not a new rule.** Spec 02 NFR-08 already states it verbatim — *"a composite that
   cannot meet 1 kB takes a named, measured exception row documented ADR-0015-style"* — and has
   named two under it, both citing ADR-0015's composition argument. 17.4 writes into NFR-01 the
   rule the project has been following in the clause next door for three waves. That is the
   literal reading of the item's own brief: *a 1.0 should ship the clause it actually enforces.*

## Alternatives Considered

- **Amend NFR-01 to exempt composing facades as a category** (pinned instead to measured + ~7%).
  Less ceremony — no ADR per exception. **Rejected**: an open category ("anything that composes")
  is the kind of exemption that widens by precedent, and the measurement says nothing needs it —
  one function in 28, with the rest 25% clear. The ceremony *is* the mechanism: an ADR per
  exception is what has kept the count at one for six milestones.
- **Require a redesign** — inline a second timeout implementation in `httpClient` to fit 1 kB.
  **Rejected**, and ADR-0015 already rejected it once: it trades a documented design decision for
  a byte count and reintroduces exactly the duplication ADR-0007 refused, so the library would
  carry two cancellation semantics to satisfy a budget.
- **Unify all four clauses into one policy.** Tempting once the divergence above was visible, and
  **out of scope**: NFR-12's exemption and NFR-17's class ceilings were each decided by their own
  ADRs (0031, 0034, 0035, 0037, 0040) with reasons specific to components and builders, and
  reopening four accepted decisions to make a table look tidy is not what 17.4 asked for. Recorded
  as an observation instead — see below.

## What this does not change, stated so the record is not read as tidier than it is

**The four clauses still differ, deliberately.** This ADR closes NFR-01's open question and
nothing else:

- **NFR-08 already matches** this decision, and cites the same precedent.
- **NFR-12 keeps its categorical exemption** for F42, F49, F50 and F51. That is *not* the open
  category rejected above: it exempts **four enumerated F-items**, each with its own ceiling and
  ADR, which is a closed list rather than a door. A future `/dom` component gets no automatic
  exemption from it.
- **NFR-17 has no 1 kB clause to reconcile**, having been written from the start around classes
  of builder (atom / wrapper / composite) with per-row measured pinning.

A reader comparing the four should conclude that they answer *different questions about different
kinds of symbol*, not that one is stale. NFR-01 was the only one with an unanswered question in
it, and it now has none.

## Consequences

- **No code changes, no budget moves, no new gate.** `httpClient`'s row already carried its
  exception; only the clause it points at is now complete. The `.size-limit.json` row name is
  updated to cite this ADR alongside ADR-0015, so CI output names the rule as well as the origin.
- **The bar for a second root exception is explicit**: it must compose another public export,
  measure over, and arrive with an ADR in its own PR. "It grew" is not a qualifying reason.
- ADR-0015's open sentence is answered rather than left dangling, and spec 01 NFR-01 no longer
  contains a question. That matters at a freeze: an unanswered clause is the thing a consumer
  cannot plan against.
- **M17 has no decision-heavy items left.** 17.5 cuts the release.

## References

- ROADMAP 17.4; [ADR-0015](0015-final-size-budgets-and-the-httpclient-exception.md)
  ("…is the owner's call"), [ADR-0007](0007-http-client-facade-contract.md).
- spec 01 §3 NFR-01 (amended); spec 02 §3 NFR-08; spec 03 §3 NFR-12; spec 04 §3 NFR-17.
- Measurement: `pnpm size` over all 87 single-import rows, 2026-08-13, at `main` after PR #121.
