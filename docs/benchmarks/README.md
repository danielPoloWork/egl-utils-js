# Benchmarks

Reproducible performance measurements for `egl-utils-js`. Any performance claim in the
spec, README, or a PR must be backed by a benchmark here and by code under
`src/bench/javascript/it/d4np/utils/`. Numbers without a reproducible method
are not evidence.

## Methodology

- **Harness:** `tsup (esbuild) — dual ESM/CJS + .d.ts generated from JSDoc types (ADR-001)` builds the bench target; run with `pnpm bench`.
- **Environment:** record the machine (CPU, RAM, OS), the toolchain version, and the build
  configuration (release/optimized) with every result — a number without its environment is
  not comparable.
- **Discipline:** warm up, run multiple iterations, report a central tendency **and** spread
  (e.g. median + p99), and pin the commit SHA the run was taken at.
- **Regression gate:** the CI `benchmark` job runs the suite; a result is a regression only
  against a recorded baseline on comparable hardware (note when CI hardware is too noisy to
  gate and the run is informational).
- **Naming (enforced, not conventional):** every benchmark *this project* writes begins with
  `egl `; a baseline library's does not. That prefix is how the collector tells a parity pair
  from an ours-only group, so a benchmark without it **fails the gate** rather than quietly
  dropping out of it (roadmap 13.3,
  [ADR-0036](../adr/0036-collecting-every-benchmark-and-the-collapse-floor.md)).

## The two gates

| Gate | Applies to | Enforced |
|------|-----------|----------|
| **NFR-04 parity floor** | a group pairing one `egl ` benchmark with a baseline library | `ourHz / baselineHz ≥ 0.9`, both from the same run so machine speed cancels ([ADR-0014](../adr/0014-the-nfr04-gate-is-a-floor-not-a-diff.md)) |
| **Absolute collapse floor** | an ours-only group — no third-party equivalent exists to divide by | `observedHz / recordedHz ≥ 0.25` (4x slower fails), **only when the recorded figure's `environment` tag matches the running machine** |

The collapse floor is wide on purpose: ambient variation on a single machine was measured at
up to 1.68x across three runs, while algorithmic collapse (a regex reaching `validateEmail`,
an accidental O(n²) over 10,000 rows) costs 10x and up. Absolute milliseconds — `mean` and
`p99` — are printed on every run, so an absolute budget such as NFR-13's 50 ms is readable
directly rather than inferred.

## Recording the baseline

`pnpm bench:baseline` records **into the environment it runs in**, tagging the file
`platform-arch-nodeMAJOR-ci|local`. A workstation figure never judges a CI run, so absolute
entries recorded locally report as *not comparable* in CI and enforce nothing.

To record on the hardware the gate runs on, dispatch the nightly workflow with
**`record: true`**:

```bash
gh workflow run benchmark-nightly.yml -f record=true
```

It runs `pnpm bench:baseline` on the runner and uploads `baseline.json` as an artifact. The
job stays read-only by design — download the artifact and land it through a normal PR, so
the numbers are reviewed like any other change.

## Results

One report per measured scenario, from [`template.md`](template.md). Keep the index newest-first.

| Date | Scenario | Version | Headline result | Report |
|------|----------|---------|-----------------|--------|
| 2026-08-07 | `tablePipeline.view()` — 10k rows, 3 filters, 2-key sort (NFR-13) | v0.5.0 + 13.1 | 21.1 ms mean against a 50 ms budget (p99 30.3 ms) | [report](2026-08-07-table-pipeline-derivation.md) |
