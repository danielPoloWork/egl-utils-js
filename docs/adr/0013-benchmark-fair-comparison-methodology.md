# ADR-0013: Benchmark methodology — what counts as a fair comparison, and what we refuse to compare

- **Status:** Accepted
- **Date:** 2026-07-31
- **Deciders:** Daniel Polo (owner), agent (tech-lead persona)
- **Related:** spec §3 NFR-04, §6, ROADMAP 7.1 (this suite), ROADMAP 7.2 (the nightly gate)

## Context

NFR-04 states a parity requirement: *"retry/parallelLimit within 10% of p-retry/p-limit; data
functions within 10% of lodash equivalents or faster — vitest bench, pinned baselines, nightly
regression gate."*

Producing numbers is easy; producing numbers that **mean** what the requirement intends is not,
and a benchmark that measures the wrong thing is worse than none — it converts a false claim
into a green check. Three specific hazards apply here:

1. **The async combinators are dominated by waiting, not by code.** With default options, a
   `retry` benchmark spends hundreds of milliseconds in backoff and a concurrency benchmark
   spends its time in the tasks. Both libraries would score identically, and the "parity"
   result would be a measurement of `setTimeout`.
2. **Same-named functions are not the same function.** `lodash.merge` **mutates** its target
   and merges arrays element-wise; `deepMerge` returns a new object and replaces arrays.
   `p-limit` returns a limiter the caller must wire into `Promise.all(tasks.map(…))`;
   `parallelLimit` takes the array. `groupBy` returns a `Map`, `lodash.groupBy` a plain object.
   Comparing the *names* rather than the *usage* produces ratios that flatter whichever side is
   doing less work.
3. **Some of our functions have no baseline at all** (`validateEmail`, `parseDuration`,
   `urlSearchParams`, `uuid`). There is no parity claim available, and inventing an unlike
   comparison to publish a favourable number would be dishonest.

## Decision

**1. Neutralize the dimension not under measurement.** Every async benchmark sets delays to
zero on *both* sides (`{minDelay: 0, maxDelay: 0}` for ours; `{minTimeout: 0, maxTimeout: 0,
factor: 1, randomize: false}` for p-retry) and uses tasks that resolve immediately. What is
measured is **orchestration overhead** — the only part either library controls. The suite states
in-file that these figures say nothing about real-world retry latency, which is dominated by
the backoff the *caller* chose.

**2. Compare against the equivalent USAGE, not the equivalent name.**
- `p-limit`'s `Promise.all(tasks.map(task => limit(task)))` wrapper is **inside** the timed
  region: it is the code a user writes to achieve what one `parallelLimit` call achieves.
- `lodash.merge` is called as `merge({}, a, b)` — the non-mutating idiom — because crediting
  lodash for allocation it never performs would be the unfair direction.
- `uniq(array, iteratee)` is compared to `uniqBy`, not `uniq`, since that is the like-for-like
  operation.

**3. Where semantics cannot be equalized, disclose rather than hide — and do not quote the
number as a performance claim.** The merge comparison therefore exists twice: an **array-free**
input, which is the NFR-04 figure because the array-semantics divergence cannot arise there;
and an **array-heavy** input, kept because it is realistic but explicitly marked *not a parity
claim* — its two-orders-of-magnitude ratio is the cost of doing **different work** (we replace
a 40-element array, lodash deep-merges it element by element). Likewise disclosed inline:
`omit`'s wider feature surface in lodash (deep paths), `groupBy`'s `Map` return, and
`deepClone`'s native-`structuredClone` mechanism versus a JS walker.

**4. Separate parity suites from absolute suites.** Functions with no equivalent live in
`no-baseline.bench.js`, carry **no NFR-04 claim**, and exist to give the roadmap 7.2 regression
gate a baseline of our own.

**5. Inputs are deterministic and built once.** Fixtures come from a seeded PRNG at module
load, never from `Math.random` and never inside a timed region — otherwise allocation is
measured instead of the function, and the nightly gate would compare runs given different work.
Baselines are pinned **exactly** (`lodash 4.18.1`, `p-limit 6.2.0`, `p-retry 6.2.1`, no caret):
a drifting baseline makes a 10% comparison meaningless across runs.

**6. Not every comparison can be gated at 10%, and the suite says which.** Measured over
repeated runs, the two-transient-failures retry row swings roughly ±10% between runs (observed
1.00x, 1.03x, 1.04x, 1.06x, and once 1.12x in p-retry's favour) because it crosses timer
boundaries. **Its run-to-run variance is the same size as the threshold**, so it is
*indicative* — parity is real, but a 10% gate on this row would flake nightly. The
pure-overhead row (no timers) is stable and gate-able. Roadmap 7.2 must gate only on the
stable rows; this is a constraint on that item, recorded here so it is not rediscovered by a
flaky nightly build.

## Consequences

- The suite revealed a **real NFR-04 violation** that the requirement existed to catch: `uniq`
  and `groupBy` were 2.0–2.7× *slower* than lodash. Diagnosis found two accidental costs, both
  removed without any behaviour change: `Array.prototype.forEach` with a closure instead of an
  indexed loop, and — in `uniq` — routing every element through an identity function even when
  no iteratee was supplied. All 594 tests and 100% coverage held across the change, and the
  rows moved to 1.41–1.46× *faster*. This is the intended function of a performance NFR: not
  decoration, but a defect detector.
- Current measured position (single machine, indicative — the gate lands with 7.2):

  | Comparison | Result |
  |---|---|
  | `retry` immediate success vs `p-retry` | **5.2× faster** (stable, gate-able) |
  | `retry` 2 failures, zero backoff vs `p-retry` | **~parity** (±10% variance, indicative only) |
  | `parallelLimit` 100@4 vs `p-limit` + wrapper | **2.3× faster** |
  | `parallelLimit` 1000@16 vs `p-limit` + wrapper | **3.5× faster** |
  | `deepClone` vs `cloneDeep` | **1.2× faster** |
  | `deepMerge` vs `merge({}, a, b)`, array-free | **6.9× faster** |
  | `pick` / `omit` vs lodash | **4.5× / 2.0× faster** |
  | `groupBy` vs lodash | **1.5× faster** |
  | `uniq` / `uniq(fn)` vs `uniq` / `uniqBy` | **1.5× / 1.4× faster** |

- NFR-04 holds on every comparison that supports a claim; nothing is quoted where it does not.
- The in-file comments are load-bearing. A future edit that "simplifies" a benchmark by
  dropping p-limit's wrapper, restoring lodash's mutating call, or reintroducing a real delay
  would silently convert this suite into decoration. The reasons live next to the code for
  exactly that reason.

## Alternatives considered

- **Benchmark with realistic delays and real backoff** — closer to production, but it measures
  the caller's chosen schedule, not either library's code, so the two would be
  indistinguishable and the NFR unverifiable. Rejected; the limitation of zero-delay
  measurement is documented instead.
- **Compare `deepMerge` to lodash's mutating `merge(target, source)`** — the obvious reading of
  "the lodash equivalent", but it charges us for allocation lodash skips. Rejected in favour of
  the non-mutating idiom.
- **Exclude the array-heavy merge case entirely** — cleaner, but array-bearing input is what
  callers actually pass, and dropping it would lose a regression signal. Kept, labelled, and
  excluded from parity claims.
- **Publish a single headline "faster than lodash" number** — marketable and misleading; the
  per-comparison table with its disclosures is the honest form.
- **Gate every row at 10% now** — would make the timer-bound row a nightly flake generator.
  Deferred to 7.2 with the stability distinction recorded above.
