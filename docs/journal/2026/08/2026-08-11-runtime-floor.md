# 2026-08-11 — The 1.x runtime floor (17.2)

## What got done

**Node >= 22, Safari >= 16.4**, CI matrix **22 / 24 / 26** —
[ADR-0050](../../adr/0050-the-1x-runtime-floor.md). Applied in the four places the item names
plus two that had drifted, and the api-floor gate then dictated a code deletion.

| Where | Change |
|---|---|
| `engines.node` | `>=18` → `>=22` |
| `browserslist` | `safari >= 15.4` → `safari >= 16.4` |
| `SUPPORT_MATRIX` | `nodejs 18.0.0` / `safari 15.4` → `22.0.0` / `16.4` |
| CI matrix | 18/20/22 → 22/24/26 |
| Six single-job workflows | Node 20 — **itself EOL since April** — → Node 24 |
| `@types/node` | `^18` → `^22`; the rule that it tracks the *oldest* runtime survives |
| `.github/dependabot.yml` | five major-version ignores removed |

## The two decisions

**Node 22, not 24.** 24 is the Active LTS and the more aggressive read of "current". It also
drops a line Node itself still maintains, for no gain this library can name — nothing here
needs a Node 24 API. The rule I wrote down instead: **support the maintained lines, and make
the floor the oldest of them.** That picks 22 today and answers the question again next year
without re-litigating it.

**Safari 16.4, not 17.4.** 17.4 was tempting: it makes `AbortSignal.any` native and lets
`anySignal` go, ~200 B of reimplementation deleted. Rejected on the v0.1.0 review's own
precedent — facing exactly this trade it chose to *keep the stated promise* and write the
fallback rather than quietly shrink the matrix. Raising a browser floor by two further years
to delete tested code is the wrong side of that. What justifies moving Safari at all is
different and stronger: **at 15.4 the claim was untestable.** Playwright ships one recent
WebKit build, which is precisely what let the `AbortSignal.timeout` defect reach the 7.6
review. 16.4 narrows the gap between what is promised and what CI can verify.

## The gate did the work

Raising `SUPPORT_MATRIX` and running `check-api-floor` produced exactly the churn the roadmap
item predicted, and it was the useful kind:

- **`AbortSignal.timeout` reported as a stale guard.** Safari 16.0, Node 17.3 — both below the
  new floor. So `timeoutSignalFor` is deleted, along with the 60-line suite that reached it by
  proxying the static away. What replaced that suite is worth more than what it removed: two
  tests asserting the property the fallback existed to preserve (the static is what gets
  called; the operation's signal aborts with the platform's own `TimeoutError` reason, which is
  what `httpClient` inspects downstream).
- **`AbortSignal.any` stayed guarded — with its reason corrected.** The inventory said "kept
  because the Node 18 floor lacks it". That reason lapsed; the Safari one (17.4) did not. A
  guard whose stated reason has expired is the rot the inventory exists to catch, and it would
  have read as dead code to the next person.
- **The `#webcrypto` node fallback became vestigial** — `globalThis.crypto` landed in Node 19 —
  which is a packaging decision, not a floor one: collapsing the two-file shim also removes the
  `dist/node` build pair and the root `node` export condition, supersedes ADR-0008, and
  interacts with spec 05's byte-identical-exports clause. Filed as **17.14**, and it should
  land before M18 pins that map.

## First PR here to shrink a budget

Every previous size change in this project amended a clause upward. This one goes the other
way: root **−50 B**, and `httpClient`'s documented NFR-01 exception **back to its original
1.35 kB** — the figure ADR-0047 had to raise to 1.4 kB for the option-key check. The floor
raise paid that cost back with interest.

## Also worth noting

Six workflows were pinned to **Node 20, EOL since April 2026** — including `publish.yml` and
`release.yml`, i.e. the release path itself. Nothing failed, because nothing checks the CI
runtime against the support matrix; the floor raise is what made it visible. Now on Node 24.

And five dependabot ignores existed *only* because of the Node 18 floor — `eslint`,
`@eslint/js`, `vitest`, `@vitest/coverage-v8`, `jsdom`. Removed after re-verifying the reason,
which the file's own header demands. No dependency is upgraded here; that is Dependabot's job,
one PR at a time.

## Where the project stands

M17: 17.1, 17.2, 17.7, 17.8, 17.9 done; 17.3–17.6 and 17.10–17.14 open. Four changesets
pending. ADRs through 0050, next free 0051. Gates green: **2371 tests**, 100% lines / 99.38%
branches, all 98 size rows, publint, attw, agadoo, zero-deps, TypeDoc, api-floor, consistency
lint. One flake seen once and not reproduced (`throttle` rate-bound property test, timing).

## How the next session resumes

1. Wait for this PR to merge (one item per PR).
2. **17.11** next would be my suggestion over the review's ordering: it is the only remaining
   item with a security dimension (the `dompurify` peer range admits versions affected by
   GHSA-55q2-fjhq-7xh7), and it is small.
3. **17.14** should precede M18 for the reason recorded in the item, so it wants a slot before
   17.5 cuts the release.
