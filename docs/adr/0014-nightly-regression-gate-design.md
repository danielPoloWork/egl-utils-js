# ADR-0014: The nightly NFR-04 gate — enforce a parity floor, not a diff against history

- **Status:** Accepted
- **Date:** 2026-07-31
- **Deciders:** Daniel Polo (owner), agent (tech-lead persona)
- **Related:** spec §3 NFR-04, §6, ADR-0013 (benchmark methodology), ROADMAP 7.2

## Context

NFR-04 requires a *"nightly benchmark regression workflow (> 10% fail)"*. ADR-0013 built the
suite and closed with a warning: one comparison (the timer-bound retry row) had run-to-run
variance the same size as the threshold, so gating it would produce nightly flakes.

Building the gate turned that warning into the central design problem. Three measurements,
taken while implementing it, drove every decision here — each one invalidated a design that
looked reasonable beforehand:

1. **Absolute throughput is not comparable across runs.** It depends on the machine, and a
   shared CI runner varies by far more than 10%. A gate on stored hz is a hardware-noise
   detector wearing a performance-gate costume.
2. **A first attempt gated single-run ratios and used vitest's `rme` as the noise guard. It
   flaked immediately** — 1–3 spurious failures on *every* run against an unchanged codebase
   (`uniq`: 1.49, then 1.29, then 1.30). The diagnosis matters: `rme` was ±1%, so the
   measurement was precise *within* a run while the ratio moved 15% *between* runs. **`rme`
   measures sampling precision, not reproducibility** — it was the wrong noise estimate, and
   using it created false confidence.
3. **The per-run distribution is bimodal, not noisy-around-a-mean.** With longer warmup the
   same `uniq` comparison produced 2.35, 2.40, 2.40 — then 1.44. V8 occasionally settles into
   a slower optimization tier. **No threshold can fix a bimodal distribution.**

A fourth observation reframed the problem: after adding warmup, some comparisons became very
stable (`omit` spanned 1.952–2.000 over five runs, a 2.5% spread) while others stayed wide
(`deepClone` spanned 1.189–1.662, a 40% spread). **Stability is a per-comparison property**,
not a property of the suite.

## Decision

**1. Enforce a floor on the ratio, not a diff against history.** NFR-04's requirement *is* a
floor: `ourHz / baselineLibraryHz >= 0.9`, with both terms measured in the **same run on the
same machine** so machine speed cancels. This is what makes the gate usable — the noise
described above is 14–47%, but the ratios sit at **1.2–6.5** while the floor is **0.9**. There
is an order of magnitude of headroom, so noise cannot reach the floor and only a real defect
crosses it. The regression this project actually shipped (`uniq` and `groupBy` at ratio
0.37–0.50) would have been caught immediately.

This is also the *literal* reading of the requirement. "More than 10% worse" means worse than
the baseline library, not worse than our own previous run: a change that leaves us 5× faster
than lodash is not an NFR-04 violation even if it halved our throughput.

**2. Aggregate with a median over several runs** (default three, odd so the median is an
observed value). The median is chosen over best-of-N deliberately: best-of-N discards every
unfavourable sample and would bias each number in our favour. The repository already had this
instinct — the NFR-05 timing gate re-measures before believing an outlier.

**3. The stored baseline file is a RECORD, not a gate input.** It documents the measured
position for reviewers and records each comparison's `observedSpread`, so anyone reading a
number can see how much trust it deserves. Drift against it is **reported and never fails the
build**. Two things follow: the gate has no chicken-and-egg bootstrap problem, and it cannot
rot — a stale record degrades a log line, not the build.

**4. One semantic exclusion.** The array-heavy merge comparison is excluded regardless of
stability, because its ratio expresses a *difference in work*, not speed (ADR-0013). Groups with
no baseline library have nothing to normalize against and are reported only. **Measurement noise
is explicitly not a reason for exclusion** — the floor absorbs noise by construction, so no row
needs excusing on those grounds.

**5. Nightly, not per-PR.** Aggregating several passes takes minutes. Per-PR checks stay fast;
this runs on a schedule (`17 3 * * *`, off the hour) with `workflow_dispatch` for deliberate
runs, and uploads its output as an artifact. `--frozen-lockfile` matters beyond hygiene here:
the baselines are pinned exactly, and a differently-resolved version would change every ratio.

## Consequences

- **NFR-04's parity requirement is enforced on every comparison that expresses one** — not a
  hand-picked stable subset. An earlier draft of this gate derived a gated subset from measured
  stability and would have enforced only 3 of 13 rows; the floor enforces 12, and does so
  without flaking. Choosing the right quantity to measure removed the need to compromise on
  coverage.
- The gate does **not** detect a pure self-regression that keeps us comfortably ahead of the
  baselines. That is a deliberate scope boundary, not an oversight: NFR-04 is a parity
  requirement, and inventing a self-regression gate on top of a 14–47% noise floor would
  reintroduce exactly the flakiness this design removes. Drift is reported for humans to notice.
- Re-recording the position (`pnpm bench:baseline`) is a reviewable act, but it is no longer
  load-bearing: forgetting to do it cannot break CI.
- Baseline pinning was found to be **wrong in the merged 7.1 work**: `pnpm add -D -E` with range
  specifiers (`lodash@4`) wrote carets, so ADR-0013 and the changelog asserted exact pins the
  manifest did not have. Corrected here to exact versions, with Dependabot `ignore` rules added —
  a baseline bump must be a deliberate re-baselining, never a routine merge.
- The benchmark suite gained explicit warmup (`BENCH_OPTIONS`). This was necessary for the
  numbers to be *truthful*, independent of gating: the short defaults never let V8 finish
  optimizing either side, so the suite had been comparing two half-warm functions.

## Alternatives considered

- **Gate absolute hz against a committed baseline** — the obvious reading of "regression gate",
  and unusable: runner variance dwarfs the threshold. Rejected on measurement.
- **Gate the ratio against the previously recorded ratio** (a true diff) — intuitive, and what
  this ADR first implemented. Rejected on measurement: the per-run spread is 14–47%, so an
  unchanged codebase fails routinely. The fix was to change *what* is compared, not to keep
  tuning the comparison.
- **Derive a gated subset from measured stability**, gating only rows whose spread is below the
  threshold — honest, and it was implemented and measured. Rejected because it enforced only 3
  of 13 comparisons on a noisy machine, and it promoted or demoted rows based on which 5-run
  sample happened to be tight, including promoting the very row ADR-0013 had established as
  inherently unstable. A floor makes the stability question moot.
- **Gate single-run ratios, guarded by `rme`** — implemented first, flaked on every run.
  Rejected on measurement, and the reason is recorded above because the mistake is subtle:
  `rme` looks like a noise estimate but describes the wrong kind of noise.
- **Widen the threshold until nothing flakes** — would have required ~40% for the worst rows,
  turning the gate into decoration while still claiming to enforce 10%. Rejected: the threshold
  is NFR-04's, and a gate that quietly redefines the requirement it enforces is worse than an
  absent one.
- **Best-of-N instead of median** — more stable against the slow JIT tier, but it discards
  unfavourable samples by construction, which biases every number in our favour. Rejected.
- **Run the gate per-PR** — immediate feedback, but minutes of runtime on every push plus a
  flake surface on the critical path. Rejected in favour of nightly plus manual dispatch.
- **Store the whole distribution and apply a statistical test** — more rigorous in principle;
  rejected as disproportionate for a utilities library, and the spread-derived gating rule
  captures the same insight in a form a reviewer can read at a glance.
