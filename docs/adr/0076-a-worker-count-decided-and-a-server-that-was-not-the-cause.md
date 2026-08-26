# ADR-0076: A worker count decided, one budget instead of six, and the server that was not the cause

- **Status:** Accepted
- **Date:** 2026-08-26
- **Deciders:** Daniel Polo
- **Related:** ROADMAP 20.7 (filed by 20.1 rather than folded into it),
  [ADR-0071](0071-a-manager-not-three-globals-and-a-dismissal-is-an-answer.md) (20.1, whose
  verification run produced the measurement that filed 20.7),
  [spec 07](../specs/07_spec_application_ux.md) §6 and
  [spec 01](../specs/01_spec_utils.md) §6 (the browser suite's place in the test strategy),
  [ADR-0014](0014-nightly-regression-gate-design.md) (the precedent that a gate people learn
  to re-run is not a gate)

## Context

The Playwright suite is the project's only three-engine gate. It is `fullyParallel`, it
loads the built `dist/` over HTTP from a hand-written static server, and 20.1 measured it
failing **2 of 142 tests on `main` and 3 of 150 with 20.1 applied** — a different pair each
run, every one of them passing alone. That is contention, not a defect, and 20.1 filed it
here rather than folding a guess into a feature PR.

The guess 20.1 recorded was that the static server was the bottleneck: eight-to-ten parallel
workers each asking a minimal Node server for a 227 kB stylesheet and a 79 kB bundle, once
per test. It patched its own file — inlining both from `node_modules`, doubling its timeout
— and said so, in as many words, as a fix for one file rather than for the cause.

**The guess was wrong, and measuring it was the whole value of this item.** Four full-suite
runs, all on the same 20-core developer box, `--project=chromium`, 160 tests:

| Run | Workers | Result | Wall |
|---|---:|---|---|
| baseline | 10 (Playwright's default) | **4 failed** / 156 passed | 2m27 |
| baseline | 10 (Playwright's default) | **3 failed** / 157 passed | 2m26 |
| bounded | 4 | **160 passed** | 2m12 |
| bounded + cached server (this ADR) | 4 | **160 passed** | **1m44** |

Every failure was the same shape: `Test timeout of 30000ms exceeded while running
"beforeEach" hook`, on `page.goto(fixture)`, in whichever tests happened to be scheduled
first. And the server, hammered directly with 140 concurrent fixture loads:

| Condition | Wall | p50 | p95 |
|---|---:|---:|---:|
| idle machine | 1.7 s | 92 ms | 194 ms |
| during the **4-worker** suite run | 1.8 s | 97 ms | 204 ms |
| during the **10-worker** suite run | 8.8 s | 356 ms | **1441 ms** |

The server does collapse — but only in the run that was already failing, and to a p95 of
1.4 s against a 30 s budget. It is a **victim of the oversubscription, not its cause**: one
single-threaded Node process competing with ten Chromium instances for the same cores.

Two structural facts made this hard to see. Playwright's default worker count is *half the
machine's cores*, so the rule **scales the wrong way** — the more capable the machine, the
more concurrent engines, and a 20-core box gets ten. And the workaround had already spread:
by the time 20.7 ran, **six** `test.setTimeout(60_000)` calls sat across five spec files,
each written for the same reason, each protecting only itself. `dom-motion.spec.js`, added
by 20.6, did not have one — which is precisely why it was among the first to fail.

## Decision

The suite's concurrency and its time budget are **decided in `playwright.config.js`**, not
inherited from a default and not patched per file.

`workers` is `max(1, min(4, floor(cores / 2)))`: half the cores as before, but **capped at
four**, because past four concurrent engines the contention costs more than the parallelism
buys — measured, on this suite, as both flaky *and* slower. A 4-core CI runner still
resolves to 2 and a 2-core one to 1, so today's CI behaviour is unchanged; what changes is
that it can no longer drift upward when someone gives the job a bigger runner. `--workers=N`
still overrides it for a deliberate experiment.

`timeout` is `60_000` for the whole suite, and all six per-file `test.setTimeout(60_000)`
calls are deleted. With the workers bounded, the slowest test in the suite measures ~15 s,
so 60 s is four times the real high-water mark — wide enough that scheduling noise cannot
fail a healthy test, tight enough to still catch a hang instead of letting CI sit for its
full 30-minute job budget.

`retries` stays **0**, deliberately and now in writing.

Separately and secondarily, `tools/static-server.mjs` serves from a **validated in-memory
cache**: one `statSync` per request decides whether the cached bytes are still the file's
bytes, and only a changed `mtime` or `size` re-reads from disk. This is not the fix — the
measurements above say so — it is a server that wants less CPU, and therefore takes less of
it from the engines under test. Idle-machine effect: 1.8 s to 1.1 s wall, p50 97 ms to
32 ms; p95 does not move, the tail being connection setup rather than file I/O.

## Alternatives Considered

- **Serve the peer assets from memory and stop there** — the remedy the item named first,
  and the one the 20.1 comment predicted would work. Rejected as a *fix*: measured, the
  server was never the bottleneck, and the cache alone leaves ten engines fighting over
  twenty cores. Adopted as a secondary measure on its own smaller merits.
- **Inline Bootstrap into every spec that loads it by URL**, extending what 20.1 did to the
  seven remaining call sites in `smoke.spec.js`. Rejected: it treats the same wrong cause,
  and in `no-bundler-routes.spec.js` and `no-bundler-sanitize.spec.js` fetching the peer over
  HTTP **is the assertion** (spec 05 F85/F86 — "the way the README says a page does"), so
  inlining there would delete the proof rather than speed it up.
- **Keep the per-file `test.setTimeout` and add one to `dom-motion.spec.js`** — the smallest
  possible change. Rejected: it is the shape that produced this item. Six copies of a
  workaround is not a convention, and the seventh spec written next year will not have one
  either.
- **`retries: 1` in CI** — the reflex answer to a flaky suite, and it would have turned all
  three baseline runs green. Rejected on ADR-0014's grounds and the item's own: a red run
  people learn to re-run is worse than no gate at all, and a retry would have hidden the
  measurement that made this ADR possible.
- **`workers: 1`** — maximally deterministic. Rejected: the suite would take roughly four
  times as long for no measured stability gain over four, and a three-engine CI run is
  already the slowest job in the workflow.
- **A fixed `workers: 4` with no core-count floor** — simpler to read. Rejected: it
  oversubscribes a 2-core runner as badly as the default oversubscribes a 20-core box, which
  is the same mistake pointing the other way.

## Consequences

- The suite passes 160/160 locally where it failed 3-4 per run, and does so **faster**:
  2m12 from bounding the workers alone, 1m44 with the cached server on top, against 2m26
  for a baseline that was also red. Stability was not bought with wall clock — the two
  changes together took 42 s off it.
- **CI's behaviour is unchanged today** — `ubuntu-24.04` gives 4 cores, so the formula
  yields the 2 workers the default already produced. The exposure the item asked about is
  real but latent: nothing in the workflow pinned concurrency, so a larger runner would have
  reintroduced the flake silently, at the worst possible moment. It is now pinned.
- One budget replaces six, and the next spec added to this suite inherits it instead of
  needing to know it exists.
- The static server keeps a per-process cache, so a developer whose `reuseExistingServer`
  process outlives a rebuild is protected by the `mtime`/`size` check rather than by luck.
  The cost is one `statSync` per request and a few hundred kilobytes of resident memory in a
  test-only tool.
- **Known limitation:** four is a measurement on one machine, not a law. A box with slower
  cores may want fewer; the cap is written in one place, with the numbers that produced it,
  so the next person to disagree has something to disagree with.
- The three-engine wall clock rises where a machine has more than eight cores, since two
  engines no longer overlap as widely. The CI runner is not such a machine, so the job's
  30-minute budget is unaffected.

## References

- ROADMAP 20.7, and 20.1's measurement that filed it.
- `playwright.config.js` (the decision, with the table above inline), `tools/static-server.mjs`.
- Playwright's default worker rule: half the available cores.
- ADR-0014 — the nightly gate, and why a gate that is re-run until green is not a gate.
