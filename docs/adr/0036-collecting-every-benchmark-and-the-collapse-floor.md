# ADR-0036: Collect every benchmark, and gate the absolute ones on a collapse floor

- **Status:** Accepted
- **Date:** 2026-08-07
- **Deciders:** Daniel Polo (maintainer), senior project architect (agent)
- **Related:** [ADR-0013](0013-benchmark-fairness-and-the-refusal-to-compare.md), [ADR-0014](0014-the-nfr04-gate-is-a-floor-not-a-diff.md), [ADR-0034](0034-one-owner-one-derivation-and-the-pipeline-budget.md), ROADMAP 13.3, spec 03 §3 (NFR-13), spec 01 §3 (NFR-04)

## Context

Roadmap 13.1 filed 13.3 on finding that `tools/bench-regression.mjs` only collected a
benchmark group containing an `egl `-prefixed entry. A group without one hit a bare
`continue`. Consequences, all verified before this change:

- `no-baseline.bench.js` (6 benchmarks: `validateEmail`, `parseDuration`,
  `urlSearchParams`, `uuid`, and two type guards) named its benchmarks without the
  prefix, so **every one was discarded** — while the file's own header documented it as
  existing "to give the nightly regression gate a baseline of our own".
- `table.bench.js` (4 benchmarks, including the NFR-13 derivation budget) was discarded
  the same way, so the figure spec 03 NFR-13 commits to was measured on every CI
  benchmark job and then thrown away.
- The recorded baseline held **13 entries where it should have held 23**. A regression in
  `validateEmail`'s linear cost (the ADR-0005 guarantee) or in the pipeline's derivation
  could not have been caught by anything.

The dead giveaway was inside the tool: its own "no baseline library — absolute throughput
is machine-dependent" branch was reachable by exactly one group, `parallelLimit settle
mode`, which had the prefix and no sibling. The mechanism for absolute entries existed;
almost nothing could reach it.

Two further facts shaped the fix. First, a **latent trap**: the baseline was taken as
"any other benchmark in the group", so simply prefixing the absolute suites would have
made the second of two of our own benchmarks a pretend baseline library — `isEmpty`
gating a meaningless ratio against `isObject`. Second, **absolute figures do not cancel
machine speed** the way a same-run ratio does (ADR-0014), so they cannot be gated the way
parity is.

## Decision

**1. Classification is total, and a benchmark it cannot place fails the run.**
Classification moves to `tools/bench-collect.mjs` as a pure function over the report.
Every benchmark is either classified or named in `problems`, and the gate refuses to
proceed — or to record — while any problem stands. Silence was the defect; the fix is
structural, not a wider net.

- one ours + one baseline → **parity** entry, keyed by the `describe` title;
- ours only → **absolute** entries, keyed `'<title> > <benchmark>'`, one per benchmark;
- anything else (no ours; two ours beside a baseline; two baselines) → a problem.

Ours is identified by the `egl ` prefix, and a baseline by the **absence** of it — never
by position. This closes the trap above. Being a pure function, the rules are proved in
`bench-collect.test.js` without running a benchmark, including the multi-benchmark
absolute group and each refusal.

**2. Absolute benchmarks are keyed per benchmark, not per group.** `type guards` holds two
unrelated measurements and the pipeline-stage suite three; keying by title would keep one
and drop the rest — the original defect in miniature.

**3. Absolute benchmarks are gated by a collapse floor of 0.25 (4x slower fails),
enforced only when the recorded figure carries the same environment tag
(`platform-arch-nodeMAJOR-ci|local`) as the running machine.** Otherwise the entry is
reported as not comparable and nothing is enforced. Measured evidence for the width, all
on one machine:

| Benchmark | 3-run spread | Ratio |
|---|---|---|
| `validateEmail` | 503 k..515 k hz (and 304 k..510 k while recording) | up to **1.68x** |
| NFR-13 full derivation | 34..56 hz | up to **1.6x** |
| `parseDuration` | 308 k..432 k hz | **1.33x** |
| `uniq` parity ratio, single pass | 0.655 observed against a 1.48..1.65 range | **2.4x** |

Ambient variation on one machine reaches 1.68x, and a single pass of even a
machine-cancelling *ratio* swung 2.4x. A shared CI runner adds its neighbours on top.
Algorithmic collapse is a different population: a regex reaching `validateEmail`, or an
accidental O(n²) over 10,000 rows, costs 10x and up. 0.25 sits in the empty band between
them — a 2x floor would have flaked on the numbers above, and a looser one would miss the
collapse. Both failure paths were verified by planting them: a 10x-inflated recorded
figure and an unprefixed benchmark each exit non-zero (the NFR-16 discipline).

**4. Milliseconds are printed on every run.** `mean` and `p99` are reported per absolute
benchmark with significant digits preserved across six orders of magnitude, so NFR-13's
"≤ 50 ms" clause is readable directly (currently 19.0 ms mean, 27.6 ms p99) instead of
being inferred from a hz figure.

**5. Recording on CI hardware is a documented one-click job.** The nightly workflow gains
a `record` dispatch input that runs `pnpm bench:baseline` and uploads the file as an
artifact. The job stays `contents: read`; the maintainer lands the figures through a
normal PR. Until a CI-recorded file exists, absolute entries report as not comparable —
visible and honest, never a false pass.

**6. Recorded entries not observed in a run are reported as stale.** A benchmark renamed
or deleted otherwise takes its gate with it, silently — the same failure mode from the
other direction.

## Alternatives Considered

- **Rename the benchmarks and change nothing else.** Rejected: it would have armed the
  pretend-baseline trap (isEmpty vs isObject) and left the silent-drop behaviour in place
  for the next naming mistake. The item's own wording offered "fix the collector (or the
  naming convention)"; only doing both is safe.
- **Assert NFR-13's 50 ms budget directly as a hard gate.** Rejected: the clause says "on
  the CI runner", but the observed 1.6x ambient swing on the derivation figure means a
  hard assertion at 50 ms against a 19 ms measurement would fail for reasons unrelated to
  the code as soon as a runner is loaded. The budget is verified at recording time,
  published in `docs/benchmarks/`, and printed on every run; the floor protects against
  collapse. Stated as a limitation rather than hidden.
- **A tight absolute drift gate (fail beyond ±10–25%).** Rejected for exactly the reason
  ADR-0014 rejected diffing parity ratios: the measured spread is larger than the
  tolerance, so the gate would fail constantly on unchanged code.
- **Enforce absolute floors regardless of environment.** Rejected: it would compare a
  workstation figure to a CI figure and call the difference a regression. The tag makes
  non-comparability explicit instead of averaging it away.
- **Let CI commit the recorded baseline.** Rejected: it needs `contents: write` on a
  workflow that runs benchmarks, and it would land unreviewed numbers. An artifact plus a
  PR keeps both the permission surface and the review gate.
- **Keep classification inline in `bench-regression.mjs`.** Rejected: the script executes
  a benchmark suite on import, so nothing in it can be unit-tested. The guarantee that
  every benchmark is classified would have stayed a comment.

## Consequences

- The gate now sees **23 entries instead of 13**; 10 previously-discarded benchmarks are
  collected, reported, and recorded.
- A naming mistake can no longer shrink the gate: it fails the run, fast (classification
  problems skip the remaining passes).
- Absolute enforcement is inert until the baseline is re-recorded on CI hardware via the
  new dispatch input. This is deliberate and visible in the gate output; the roadmap item
  is closed by the mechanism plus the documented procedure, and the maintainer decides
  when to record.
- `baseline.json` gains a second entry shape (`hz`/`meanMs`/`p99Ms`/`environment`)
  alongside parity's `ratio`, and a top-level `absoluteCollapseFloor` and `environment`.
  Its `$comment` explains both, since the file is read by humans.
- Every future benchmark must carry the `egl ` prefix. That is now enforced rather than
  conventional, and stated in both absolute suites' headers.
- Spec 03 NFR-13 and its NFR-04 non-extension clause are amended in the same PR: the
  nightly gate gains an absolute floor, which is not a parity claim against a third party
  but does grow what the gate enforces.

## References

- `tools/bench-collect.mjs`, `tools/bench-regression.mjs`
- `src/test/javascript/it/d4np/utils/bench-collect.test.js`
- `src/bench/javascript/it/d4np/utils/no-baseline.bench.js`, `table.bench.js`
- `docs/benchmarks/README.md` (recording procedure), `docs/benchmarks/baseline.json`
- `.github/workflows/benchmark-nightly.yml` (the `record` dispatch input)
