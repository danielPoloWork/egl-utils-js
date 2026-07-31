# ADR-0015: Final size budgets, and the one per-function budget composition cannot meet

- **Status:** Accepted
- **Date:** 2026-07-31
- **Deciders:** Daniel Polo (owner), agent (tech-lead persona)
- **Related:** spec §3 NFR-01, NFR-02, ADR-001 (exports map), ADR-0007 (httpClient composes `timeout`), ADR-0014 (the opposite tightness policy for benchmarks), ROADMAP 7.3

## Context

NFR-01 has three clauses, of which only two were ever gated:

- root entry full import ≤ 6 kB — **gated since M1**;
- `/storage` ≤ 2 kB — **gated since M1**;
- **any single function ≤ 1 kB after shaking — never measured.**

NFR-02 ("importing one named export pulls zero unrelated modules") was gated by `agadoo`
alone, which proves the bundle *is* shakeable but not *what survives* shaking. The spec asks
for "agadoo **+ size-limit scenario builds**", and the scenario builds were missing.

Those two gaps are the same measurement: import one named export, measure what comes with it.
Adding it turned the per-function clause from an assertion into a number — and immediately
found a violation.

## Decision

**1. Entry budgets are tightened to measured-plus-6%.** Measured: root 5036 B, `/storage`
1706 B, `/sanitize` 1457 B, `/errors` 291 B. Budgets become 5.35 kB, 1.81 kB, 1.55 kB, 310 B.

Tight budgets are safe here for a reason worth stating, because it is the **opposite** of the
conclusion ADR-0014 reached for benchmarks: **size-limit is byte-deterministic** — repeated runs
produced byte-identical results — whereas throughput varies 14–47% between runs. Determinism
permits a 6% band; noise forbade one. Two gates, two tightness policies, both derived from how
the underlying quantity behaves rather than from a house preference. Verified non-vacuous: a
budget set 1 B below the measured size fails with "exceeded by 6 B" and exit code 1.

**2. Per-function scenario builds gate all 23 root exports at 1 kB.** This is NFR-01's
per-function clause enforced literally, and it is also the *mechanism* for NFR-02: a function
that pulled in unrelated modules could not fit in 1 kB, so the budget makes the shakeability
claim falsifiable. Measured, they range from `isObject` at 93 B to `retry` at 717 B — with one
exception.

**3. `httpClient` gets a documented 1.3 kB budget instead of 1 kB.** It measures **1251 B**,
22% over. The cause is verified rather than assumed: `{ httpClient }` alone is 1251 B and
`{ httpClient, timeout }` together is **1252 B** — adding `timeout` costs one byte, because
`timeout` is *already* inside httpClient's graph. The overage is precisely the composed
`timeout` combinator (560 B standalone) plus `HttpError`, which **ADR-0007 deliberately reuses
rather than reimplementing**, so that the library has one cancellation semantics instead of two.

Bringing `httpClient` under 1 kB would mean inlining a second timeout implementation — trading
a documented design decision for a byte count, and reintroducing exactly the duplication
ADR-0007 rejected. The budget is raised for this one function, the reason is recorded here, and
the exception is **visible in the CI output itself** (the entry is named "documented NFR-01
exception, ADR-0015") so it cannot quietly become the norm.

## Consequences

- NFR-01 and NFR-02 are now enforced in full, per entry *and* per function; 27 budgets run in
  ~7 s inside the existing `packaging` job, so no new CI job is needed.
- **This is a spec divergence and is flagged as such.** NFR-01 says "any single function ≤ 1 kB"
  without qualification, and one function does not comply. The measurement, the cause, and the
  design trade-off are recorded; whether to accept the exception permanently, amend NFR-01 to
  exempt composing facades, or require a redesign is the owner's call. Nothing here silently
  redefines the requirement — the alternative would have been to leave the clause unmeasured,
  which is how it stayed compliant-looking for six milestones.
- Budgets now sit close to reality, so an addition that grows a bundle needs a deliberate,
  reviewed bump. Since all 25 spec functions have shipped, the surface is complete and further
  growth should be exceptional rather than routine.
- The per-function numbers are useful documentation in their own right: a consumer importing
  only `isObject` pays 93 B, and the table makes that concrete instead of promising
  "tree-shakeable" in prose. They belong in the README at 7.5.

## Alternatives considered

- **Leave the per-function clause unmeasured** — the status quo, and how a requirement stays
  green without being true. Rejected: an unmeasured NFR is decoration.
- **Inline a second timeout implementation inside `httpClient` to fit 1 kB** — meets the letter
  of NFR-01 and damages the design: two cancellation code paths, two sets of edge cases, and a
  direct contradiction of ADR-0007. Rejected as the wrong thing to optimize.
- **Raise the per-function budget to 1.3 kB for everything** — uniform and simpler, but it
  would grant 22 functions headroom they do not need and hide the next composite that creeps
  over. Rejected in favour of one named exception.
- **Exclude `httpClient` from the per-function gate entirely** — simplest, and it would stop
  measuring the function most likely to grow. Rejected: a raised budget still gates.
- **Set entry budgets at measured + 0%** — maximal sensitivity, but a toolchain patch that
  shifts output by a handful of bytes would then break the build for no design reason. The 6%
  band absorbs that while still catching a real regression (proven: 6 B over fails).
