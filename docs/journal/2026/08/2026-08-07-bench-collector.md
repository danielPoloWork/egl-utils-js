# 2026-08-07 — Every benchmark counted, and M13 closed (roadmap 13.3)

## What got done

Roadmap **13.3**, the verification blind spot 13.1 filed: `tools/bench-regression.mjs`
collected a benchmark group only if one of its entries began with `egl `, and a group
without one hit a bare `continue`.

- **Measured the hole before fixing it.** Ten benchmarks were being discarded on every CI
  benchmark job: the six in `no-baseline.bench.js` (`validateEmail`, `parseDuration`,
  `urlSearchParams`, `uuid`, both type guards) and the four in `table.bench.js`, including
  the NFR-13 derivation budget. The recorded baseline held **13 entries where it should
  have held 23**. `no-baseline.bench.js` documented itself as existing to feed that gate.
- **Extracted classification into `tools/bench-collect.mjs`** as a pure, side-effect-free
  function, so the rules can be unit-tested without running a benchmark —
  `bench-collect.test.js`, 13 cases, covering the multi-benchmark absolute group and each
  refusal. The old inline version could not be tested at all: the script runs a benchmark
  suite on import.
- **Made classification total.** Every benchmark is either classified or named in
  `problems`, and the gate refuses to proceed *or to record* while any problem stands. A
  naming mistake now fails the run instead of shrinking the gate — the structural fix, not
  a wider net.
- **Fixed a latent trap in the same change.** The baseline was taken as "any other
  benchmark in the group", so merely prefixing the absolute suites would have made
  `isEmpty` a pretend baseline library for `isObject` and gated a meaningless ratio. Ours
  is now the prefix; a baseline is the *absence* of it, never a position.
- **Added the absolute collapse floor**: 0.25 (4x slower fails) against the recorded
  figure, enforced only when its `environment` tag
  (`platform-arch-nodeMAJOR-ci|local`) matches the running machine.
- **Printed milliseconds** per absolute benchmark with significant digits preserved across
  six orders of magnitude, so NFR-13's 50 ms clause is readable on every run instead of
  inferred from a hz number.
- **Made CI recording a one-click job**: `gh workflow run benchmark-nightly.yml -f
  record=true` records on the runner and uploads `baseline.json` as an artifact. The job
  stays `contents: read`; the maintainer lands it through a PR.
- **Reported stale entries** — a recorded key nobody measured is the same failure mode
  from the other direction (a renamed benchmark taking its gate with it).
- Docs: ADR-0036, `docs/benchmarks/README.md` (the two gates + recording procedure), spec
  03 NFR-13 and its NFR-04 non-extension clause amended, CHANGELOG under *Changed*.

## The numbers that decided the floor

Three runs, one machine, unchanged code:

| Benchmark | Spread | Ratio |
|---|---|---|
| `validateEmail` | 304 k..510 k hz | **1.68x** |
| NFR-13 full derivation | 34..56 hz | **1.6x** |
| `parseDuration` | 308 k..432 k hz | 1.33x |
| `uniq` parity ratio, single pass | 0.655 against a 1.48..1.65 range | **2.4x** |

Ambient variation on one machine reaches 1.68x, and a single pass of even a
machine-cancelling *ratio* swung 2.4x — so a 2x absolute floor would have flaked.
Algorithmic collapse is a different population entirely (a regex in `validateEmail`, an
O(n²) over 10k rows: 10x and up). 0.25 sits in the empty band between them.

Both failure paths were verified by planting them, the discipline NFR-16 already requires
of the api-floor scanner: a 10x-inflated recorded figure fails with the collapse message,
and an unprefixed benchmark fails classification (fast — a naming problem skips the
remaining passes).

Recorded position for NFR-13: **19.0 ms mean, 27.6 ms p99** against the 50 ms budget,
consistent with 13.1's report (21.1 ms / 30.3 ms). An earlier single-file probe read
88 ms on the isolated two-key sort against 13.1's 38 ms; the full three-pass run put it at
40.2 ms, so that was ambient load, not a regression — itself a small lesson about
trusting a single measurement.

## Where the project stands

**M13 is complete and spec 03 is fully delivered** — coverage rows §1–§6 all ✅. Milestones
1–13 done, v0.5.0 shipped. The next step is cutting **v0.6.0**, then planning PR #0c
(spec 04, M14–M16: the Bootstrap 5 toolkit and its 24-component catalog).

Absolute enforcement is deliberately inert until the baseline is re-recorded on CI
hardware via the new dispatch input — visible in the gate output as *not comparable*,
never a false pass. Whether to record now or with v0.6.0 is the maintainer's call.

## How the next session resumes

1. Merge this PR (one PR at a time).
2. Cut **v0.6.0**: `release-version.yml` pushes `changeset-release/main` — branch off it,
   restore the Keep-a-Changelog skeleton `changeset version` destroys, write
   `docs/changelog/v0/v0.6.0.md` **and** `docs/releases/v0.6.0.md` with both index rows in
   the same commit.
3. Optionally dispatch `benchmark-nightly.yml -f record=true` and land the CI-recorded
   baseline so the collapse floor starts enforcing.
4. Then PR #0c: spec 04 + ROADMAP M14–M16.
