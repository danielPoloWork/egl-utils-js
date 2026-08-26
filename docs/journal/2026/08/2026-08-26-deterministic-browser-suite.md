# 2026-08-26 — A worker count decided, and a diagnosis disproved (20.7)

## What got done

- **`playwright.config.js`** now decides its own concurrency and time budget:
  `workers = max(1, min(4, floor(cores / 2)))` and `timeout: 60_000`, both with the
  measurements that produced them written inline. `retries: 0` gains a comment saying why it
  stays 0.
- **Six `test.setTimeout(60_000)` calls deleted** from five spec files. One suite budget
  replaces six per-file copies of the same workaround.
- **`tools/static-server.mjs`** serves from a validated in-memory cache — one `statSync` per
  request decides whether the cached bytes are still the file's bytes.
- **[ADR-0076](../../adr/0076-a-worker-count-decided-and-a-server-that-was-not-the-cause.md)**,
  ROADMAP 20.7 flipped, and the CI browser job commented so the next person to change the
  runner knows concurrency is pinned on purpose.
- Two drive-by corrections: the ADR index carried a duplicate row for ADR-0073, and the CI
  job had no note about any of this.

## The item's own diagnosis was wrong, and that was the point

20.7 was filed by 20.1 with a hypothesis attached: the static server is the bottleneck,
because every worker asks it for a 227 kB stylesheet and a 79 kB bundle per test. 20.1 had
already patched its own file on that theory — inlining both, doubling its timeout — and said
plainly that this was a fix for one file rather than for the cause.

Measuring it first is what the item was for, and the hypothesis did not survive. Hammering
the server with 140 concurrent fixture loads:

| Condition | Wall | p50 | p95 |
|---|---:|---:|---:|
| idle machine | 1.7 s | 92 ms | 194 ms |
| during the 4-worker suite run | 1.8 s | 97 ms | 204 ms |
| during the 10-worker suite run | 8.8 s | 356 ms | 1441 ms |

The server only collapses inside the run that was already failing, and even then to a p95 of
1.4 s against a 30 s budget. It is a **victim** of the contention: one single-threaded Node
process competing with ten Chromium instances for twenty cores.

The cause is Playwright's default worker count — *half the machine's cores*. That rule scales
the wrong way: the better the machine, the more concurrent engines it starts, so a 20-core
developer box gets ten, each driving real Bootstrap transitions against the real stylesheet.
Whichever tests are scheduled first exhaust their whole 30 s inside `beforeEach`, on
`page.goto(fixture)` — a different handful each run, every one passing alone.

| Run | Workers | Result | Wall |
|---|---:|---|---|
| baseline | 10 (default) | 4 failed / 156 passed | 2m27 |
| baseline | 10 (default) | 3 failed / 157 passed | 2m26 |
| bounded | 4 | 160 passed | 2m12 |
| bounded + cached server | 4 | 160 passed | **1m44** |
| bounded + cached server | 4 | 160 passed | **1m40** |

**Fewer workers is faster here.** That is the part worth remembering: this was not a trade of
speed for stability. Ten engines on twenty cores spent more time contending than working.

## The judgement calls

- **The memory cache still shipped**, but demoted to what the measurement supports: not the
  fix, just a server that wants less CPU and therefore takes less of it from the engines
  under test. It buys ~28 s of wall clock on top of the worker bound and moves p50 from
  97 ms to 32 ms; p95 does not move at all, the tail being connection setup rather than file
  I/O. Saying so is more useful than implying the cache did the work.
- **`retries: 1` was rejected**, though it would have turned all three red baseline runs
  green. That is exactly the objection: it would have hidden the measurement, and ADR-0014
  already records that a gate people re-run until it passes is not a gate.
- **Inlining Bootstrap everywhere was rejected** — it treats the same wrong cause, and in
  `no-bundler-routes.spec.js` and `no-bundler-sanitize.spec.js` fetching the peer over HTTP
  *is* the assertion (spec 05 F85/F86), so inlining would have deleted the proof.
- **The cap is a measurement, not a law.** Four came from one machine. It lives in one place
  with the numbers beside it, so the next person to disagree has something concrete to
  disagree with.

## What the CI answer turned out to be

The item asked whether the same shape can bite CI. Today, no: `ubuntu-24.04` gives 4 cores,
so the default already produced the 2 workers the new formula produces. But that safety was
**accidental** — nothing pinned it, and a job moved to a larger runner would have
reintroduced the flake silently, on someone else's PR. It is pinned now, and the workflow
says why.

## Where the project stands

v1.2.0 released. **M20 is complete** — 20.1–20.7 all checked. Six changesets sit unreleased
in `.changeset/` (the five 20.x features plus reduced-motion), so the next step is the
v1.3.0 cut. This PR adds none: it changes `playwright.config.js` and `tools/`, neither of
which ships (`files` is `dist`), so there is no user-visible change to record. ADRs through
0076, next free 0077.

## How the next session resumes

1. Wait for this PR to merge (one item per PR).
2. **M20 is done**, so the next move is the **v1.3.0 release cut**: the Version PR the six
   accumulated changesets will propose, plus the changelog prose and release notes under
   `docs/changelog/v1/` and `docs/releases/`. Note the lint's version-lockstep rule — the
   prose cannot land before the bump does.
3. M21 (the form engine) is the next capability wave and needs its spec (08) authored in its
   own planning PR first.
