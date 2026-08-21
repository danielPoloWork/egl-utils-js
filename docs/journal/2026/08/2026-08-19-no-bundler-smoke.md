# 2026-08-19 — The routes proved and priced, and M18 closes (18.5)

## What got done

- **`src/test/browser/no-bundler-esm.html`** and **`no-bundler-global.html`** — the README's
  two snippets made executable: deep ESM with no import map and no peer, and the artifact
  through a classic `<script src>` with no `type="module"` anywhere.
- **`src/test/browser/no-bundler-routes.spec.js`** — 12 assertions per engine across both
  routes (F86).
- **`tools/transfer-budgets.js`** + **`tools/check-transfer-budgets.mjs`**, wired into
  `check:package` as `check:transfer` — 11 routes, served bytes and request counts gated
  (F87).
- **ADR-0061**, amending spec 05 §6's F87 clause; README gains a measured route-cost table;
  ROADMAP 18.5 checked, **M18 complete**, spec 05 coverage rows all ✅, README milestone row
  ✅.

## Why F87 could not live where the spec put it

Spec 05 §6 placed the served-bytes figures in `.size-limit.json`. I tried to before deciding
against it, and the blocker is mechanical rather than aesthetic: **a deep-ESM route is a set
of files whose names are content hashes.** I appended one comment line to `errors.js`,
rebuilt, and **four of the nine chunks were renamed**; restoring the file brought the
original nine back, so the naming is deterministic — and deterministically unstable under
exactly the edits this project makes weekly. A row naming `chunk-47ELFAOV.js` would need
re-editing on most PRs that touch any source, and a gate that must be re-pinned constantly
is a gate people learn to update without reading.

So the budgets are keyed by **entry name** — stable public API — and the closure is resolved
from the real import graph at run time. That is deliberately ADR-0017's shape: a declared
inventory carrying the reasoning beside each number, and a verifier that trusts none of it.

## The second reason, which turned out to be the more interesting one

A size-limit row and a transfer row measure genuinely different things, and I had assumed
the gap would be small. It is not:

| Entry | size-limit (bundled) | served waterfall |
|---|---:|---:|
| `/index` | 6 068 B | **13 461 B** |
| `/bootstrap` | 20 290 B | **31 276 B** |

The rows model a *bundler* consumer: tree-shaken to the imports named, bundled into one
file, compressed once. A static page pays whole files, no tree-shaking, one compressed
response each. Quoting the bundled figure at a no-bundler consumer would have understated
their cost by half — so both accountings are kept, and the README now says which is which.

## What the accounting found

`/bootstrap` deep-ESM is **31 276 B over 7 requests**; the entire single-file artifact is
**31 605 B over 1** — within 1%. That is concrete route advice nobody could have given
before the numbers existed: **if you need `/bootstrap`, take the artifact.** The deep-ESM
route earns its keep at the other end of the table (`/errors` 1 074 B, `/net` 1 340 B). The
README carries the full table now, gated so it cannot drift into fiction.

## One assertion I am glad I did not hand-wave

F83 promises loading the artifact has no side effect beyond defining `egl`. The fixture
diffs the window's own property names across the load — but the naive version of that is
wrong in a way that would have passed anyway: two separate `window.__before` /
`window.__after` bindings mean the second is absent from the first snapshot and shows up as
a phantom new global. Both snapshots hang off one object created before either, so the probe
cancels out and the diff is exactly `['egl']`.

## A race worth recording

Three tests failed on the first run for one reason: the ESM fixture records its dynamic
imports on a promise, and only the test that inspected that promise was awaiting it. The
others navigated and read `window.__eglModules` before it existed, so they failed with
`undefined` rather than with anything about the route. The fix is a `loadEsmFixture()` helper
every test goes through — navigation and settle in one call, so the next test added cannot
reintroduce it.

## Verification

- **Browser:** chromium **12/12**, webkit **12/12**. Firefox cannot launch on this Windows
  host (`browserType.launch: spawn UNKNOWN`, before any test code runs) — the same
  host-specific failure recorded in 18.1 and 18.2; CI runs all three on Linux.
- **`check:package`** green end to end, now six assertions deep, the new one reporting all
  11 routes with zero drift from their declared figures.
- Gate provoked in both directions: a wrong request count reported
  *"net: 2 requests, declared 3 — the chunk graph changed"* with the file list; a lowered
  budget reported *"net: 1340 B served, budget 1000 B"*.
- Lint, format, api-floor (unchanged inventory, NFR-24), version sync and the consistency
  lint all clean. 2429 Node tests, 100% lines — untouched by this item.

## Where the project stands

**v1.0.0 released; M18 complete.** Specs 01–05 all delivered. ADRs through 0061, next free
0062. `.changeset/` holds two minors (18.2's artifact, 18.3's CDN fields) — nothing from
18.4 or 18.5, both of which ship no runtime change. Five Dependabot PRs open and untouched.

## How the next session resumes

1. Wait for this PR to merge.
2. **The next release is the obvious move**: two pending minors mean `changeset:version`
   proposes **1.1.0**, which is the version the README's no-bundler snippets already pin.
   Until it ships, those URLs point at a version the CDNs do not have — the one loose end
   M18 leaves, and it closes itself the moment the release lands.
3. After that, M19–M21 are the provisional waves (ADR-0046), each owing its own spec before
   implementation, in whatever order the owner picks — numbering fixed identity, not
   sequence.
