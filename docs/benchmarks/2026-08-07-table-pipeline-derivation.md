# Benchmark Report: tablePipeline derivation (NFR-13)

- **Date:** 2026-08-07
- **Version / commit:** v0.5.0 + roadmap 13.1 (branch `feat/table-pipeline`)
- **Environment:** 12th Gen Intel Core i7-12700 (20 logical cores), 32 GB RAM,
  Windows 11 (10.0.26200), Node v24.15.0, vitest 3.2.7 bench harness, release build
  (`pnpm build` → `dist/esm`). **Developer workstation, not the CI runner** — see
  *Interpretation*.
- **Command:** `pnpm bench` (this file: `npx vitest bench --run src/bench/javascript/it/d4np/utils/table.bench.js`)

## Scenario

Spec 03 NFR-13 sets an absolute budget on the pipeline's read model: **one `view()` over
10,000 rows with 3 active filters and a 2-key sort must complete in ≤ 50 ms.** This is what
a user feels when they type in a filter box over a large table, so the budget is the
requirement, not a proxy for it.

The fixture (`TABLE_ROWS`, seeded and pinned in `src/bench/.../fixtures.js`) is 10,000 rows
of mixed types with ~8% missing values, so the empties-last branch runs on every sort. The
measured pipeline carries three filters that each exercise a different grammar path
(`!=archived`, `>100`, substring) and a two-key sort combining collated text with a numeric
column. The memo is invalidated by a page flip before each `view()`, so every iteration
times a real derivation rather than a cache hit.

The memoization half of NFR-13 is **not** benchmarked: it is asserted by object identity in
`table-pipeline.property.test.js`, where it cannot flake.

## Results

| Metric | Value | Spread |
|--------|-------|--------|
| **Full derivation (the NFR-13 budget)** | **21.1 ms mean** | min 16.6 / p75 27.0 / p99 30.3, rme ±7.0%, 48 samples |
| One filter over 10k rows | 1.65 ms mean | min 1.34 / p99 3.63, rme ±1.9% |
| Two-key sort over 10k rows | 38.1 ms mean | min 36.6 / p99 47.7, rme ±2.2% |
| Global search over 10k rows | 2.92 ms mean | min 2.67 / p99 4.18, rme ±1.1% |

Measured before and after the decorate-sort-undecorate change made in the same item:

| Case | Before | After | Change |
|------|--------|-------|--------|
| Full derivation | 45.8 ms (p99 84.3, rme ±12.0%) | **21.1 ms** (p99 30.3, rme ±7.0%) | 2.2× faster |
| Two-key sort, 10k rows | 116.6 ms (rme ±25.8%) | **38.1 ms** (rme ±2.2%) | 3.1× faster |

## Interpretation

**The budget holds with 58% headroom** (21.1 ms against 50 ms), and even the p99 (30.3 ms)
is inside it. That margin is the point of recording this: the first implementation measured
45.8 ms — technically passing, but with p99 at 84 ms and ±12% run-to-run spread, it would
have failed on any runner slower than this workstation. GitHub-hosted runners generally are.

The fix was not micro-optimization. Reading each sort key **once per row** instead of once
per comparison removed ~86,000 value extractions from a 10,000-row two-key sort, and with
them the variance: rme on the sort case fell from ±25.8% to ±2.2%, which is the signature of
work removed rather than work rescheduled. The same change closes a correctness-adjacent
trap — a column with a `getValue` callback previously ran the *caller's* function on every
comparison.

What remains is dominated by `Intl.Collator.compare`, called O(n log n) times on the
collated text key. That is the cost of correct locale-aware ordering and is not reducible
without changing the semantics ADR-0022 fixed; the isolated sort figure (38.1 ms) is
essentially that cost. It is also why the composed case is *cheaper* than the isolated sort:
the three filters cut the row set before the collator ever sees it.

**Caveats.** These are workstation numbers on a warm cache; treat the ratio between the
before/after columns as the durable result and the absolute figures as an upper-bound
sanity check on a fast machine. Benchmarks in one process interfere — the search case
measured 11.7 ms in the first run and 2.9 ms in the second purely because the sort case
preceding it allocated less the second time. **No parity claim is made** against any
third-party library: no pinned baseline exists whose filtering, collation, and
empties-last ordering mean the same thing as ours (ADR-0013's refuse-to-compare clause), so
this scenario is recorded with `enforced: false` and read as a millisecond figure against
the spec clause.

## Reproduce

```bash
pnpm install --frozen-lockfile && pnpm build && npx vitest bench --run src/bench/javascript/it/d4np/utils/table.bench.js
```
