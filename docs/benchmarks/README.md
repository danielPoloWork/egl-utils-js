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

## Results

One report per measured scenario, from [`template.md`](template.md). Keep the index newest-first.

| Date | Scenario | Version | Headline result | Report |
|------|----------|---------|-----------------|--------|
| 2026-08-07 | `tablePipeline.view()` — 10k rows, 3 filters, 2-key sort (NFR-13) | v0.5.0 + 13.1 | 21.1 ms mean against a 50 ms budget (p99 30.3 ms) | [report](2026-08-07-table-pipeline-derivation.md) |
