# ADR-0050: The 1.x runtime floor — Node 22, Safari 16.4

- **Status:** Accepted
- **Date:** 2026-08-11
- **Deciders:** Daniel Polo
- **Related:** ROADMAP 17.2; spec 01 §1.1 and §3 NFR-07 amended here;
  [ADR-0017](0017-platform-api-floor-gate.md) (the inventory this floor governs),
  [ADR-0004](0004-signal-first-cancellation-contract.md) (`anySignal`, whose Node reason
  lapses here and whose Safari reason does not),
  [ADR-0008](0008-one-webcrypto-surface-conditional-exports.md) (the `#webcrypto` shim whose
  Node-18 fallback the floor makes vestigial — collapsing it is roadmap 17.14),
  [ADR-0015](0015-final-size-budgets-and-the-httpclient-exception.md) (the budgets this
  shrinks), and the
  [v0.1.0 readiness review](../releases/v0.1.0-readiness-review.md) §1.1/§3.7 — the Safari
  defect and the verification blind spot that motivate the browser half

## Context

A 1.x line is a promise kept for years, and the floor is the part of it that cannot be
loosened afterwards without a major.

**Node.** The declared floor is `>= 18`, set when 18 was the Active LTS. Node 18 left
maintenance in **April 2025** and Node 20 in **April 2026**. Today the maintained lines are
22 (Maintenance LTS until April 2027), 24 (Active LTS) and 26 (Current, LTS from October
2026). A 1.0 shipped now against `>= 18` would promise support for two runtimes nobody
patches, for the life of the line — and the CI matrix would keep spending three cells
proving it.

The floor also has teeth beyond a `engines` field. It is the input to the **api-floor gate**
(ADR-0017): every platform API this library touches is declared with its BCD floor, and an
API newer than the matrix must name the fallback covering the gap. Two fallbacks exist for
exactly that reason, and both were written against the old floor.

**Browsers.** `safari >= 15.4` (March 2022) is a different problem. The v0.1.0 review found
`AbortSignal.timeout` (Safari 16.0) shipped against it — two public functions broken on a
browser the spec promised — and, worse, found *why nothing caught it*: Playwright ships one
recent WebKit build, so the oldest browser the claim covers is the one CI can never run
(§3.7). A four-and-a-half-year-wide claim that no gate can verify is a weaker promise than a
narrower one that it can.

## Decision

**Node >= 22.0.0. Safari >= 16.4.** CI matrix **22 / 24 / 26** — oldest maintained LTS,
Active LTS, Current — replacing 18 / 20 / 22.

Applied in the four places the floor actually lives, plus the two that had drifted:

| Where | Change |
|---|---|
| `package.json` `engines.node` | `>=18` → `>=22` |
| `package.json` `browserslist` | `safari >= 15.4` → `safari >= 16.4` |
| `SUPPORT_MATRIX` (`tools/api-floor-inventory.js`) | `nodejs 18.0.0` / `safari 15.4` → `22.0.0` / `16.4` |
| CI matrix | three cells, 22 / 24 / 26 |
| Every single-job workflow | Node 20 (itself EOL) → Node 24, the Active LTS |
| `@types/node` | `^18` → `^22` — the rule that it tracks the *oldest* supported runtime survives; the version it points at moved |

### Why Node 22 and not 24

24 is the Active LTS and would be the more aggressive read of "current". It would also drop a
line Node itself still maintains, for no gain this library can name: nothing here needs a
Node 24 API. **Support the maintained lines; make the floor the oldest of them.** That rule
picks 22 today and explains itself the next time the question comes up.

### Why Safari 16.4, and not 16.0 or 17.4

16.0 is the minimum that makes `AbortSignal.timeout` native, which is the concrete defect on
record. 16.4 is the version the wider ecosystem treats as the modern baseline and costs
nothing extra here. 17.4 was tempting for one reason — it would also make `AbortSignal.any`
native and let `anySignal` go — and rejected for a better one: **the v0.1.0 review's own
precedent.** Faced with the same trade it chose to keep the stated promise and write the
fallback rather than "quietly shrink the matrix", and raising a browser floor by two further
years to delete ~200 B of tested code is the wrong side of that trade. `anySignal` stays.

### What the gate then demanded

Raising the matrix made one guard stale, and the checker said so:

- **`AbortSignal.timeout` is now unguarded.** Safari added it in 16.0 and Node in 17.3, both
  below the floor, so `timeoutSignalFor` — the hand-rolled `AbortController` + `setTimeout`
  fallback the 7.6 review added — is **deleted**, along with the suite that exercised it by
  stubbing the static away. `timeout` calls the platform static directly. The test kept in its
  place asserts the property the fallback existed to preserve: the operation's signal aborts
  with the platform's own `TimeoutError` reason, which is what downstream `httpClient` code
  inspects.
- **`AbortSignal.any` stays guarded**, with its reason corrected. The inventory said "kept
  because the Node 18 floor lacks it"; that reason lapsed and the Safari one (17.4) did not.
  A guard whose stated reason has expired is exactly the rot this inventory exists to catch.
- **The `#webcrypto` node shim's fallback is now vestigial.** `globalThis.crypto` landed in
  Node 19, so `?? webcrypto` from `node:crypto` covers only runtimes below the floor. Kept
  deliberately — it costs a `??` and makes the package work on an unsupported runtime rather
  than crash — and collapsing the two-file shim (with the `dist/node` build and the root
  `node` export condition it exists for) is filed as **17.14**, because that is a packaging
  decision that supersedes ADR-0008 and interacts with spec 05's byte-identical-exports
  clause. A floor PR is the wrong place for it.

### The dependency ignores the floor was holding shut

`.github/dependabot.yml` blocked five majors whose *only* objection was the Node 18 floor:
`eslint`, `@eslint/js` (need Node >= 20.19), `vitest`, `@vitest/coverage-v8` (>= 20.12) and
`jsdom` (>= 20). Those rules are **removed** — re-verified, not merely deleted: the reason was
the floor, and the floor moved. `typescript` stays pinned (TS 7 breaks tsup's `.d.ts`
pipeline, unrelated), and `p-limit`/`p-retry`/`lodash` stay pinned exactly for the NFR-04
baselines, with their now-lapsed floor sentence removed. No dependency is upgraded here; that
is Dependabot's job, one PR at a time.

## Alternatives Considered

- **Keep `>= 18` and ship 1.0.** Rejected: it is the one decision in M17 with a hard expiry —
  after 1.0 it costs a major — and it would hold the toolchain at versions five majors behind
  for the life of the line.
- **Floor at Node 24 (Active LTS).** Rejected: drops a line Node still maintains, buys nothing
  this library uses. See above.
- **Safari 17.4, deleting both fallbacks.** Rejected: the byte saving is real and small, the
  excluded users are not, and it contradicts the precedent set when the same trade was faced
  in 7.6.
- **Leave the Safari figure alone, since the item's motivation is Node.** Rejected: a claim CI
  cannot verify gets weaker the wider it is, and the review already showed what that costs.
  The floor is one promise; both halves are frozen by the same 1.0.
- **Matrix of 22 / 24 only.** Rejected: testing Current is how a library finds out about the
  next LTS before its consumers do, and 26 becomes LTS two months from now.

## Consequences

- **Breaking**, by construction and on purpose: consumers on Node 18 or 20, or Safari 15.x,
  must upgrade. `engines` states it, so `npm install` warns rather than failing mysteriously.
- The library gets **smaller**: deleting `timeoutSignalFor` takes ~90 B off the root entry and
  every import that composes `timeout` (`retry`, `httpClient`). Size rows re-baselined
  **downward**, which is a first for this project.
- One fewer branch nothing in the matrix could reach, and one fewer test file section
  simulating a runtime we no longer support.
- The toolchain is unblocked: five major-version ignores removed.
- Every workflow now runs a maintained Node. Before this, six jobs pinned Node 20 — EOL since
  April.
- What stays: `anySignal` (Safari 17.4), the `#webcrypto` shim (17.14), and the Chrome/Firefox
  "last 2 evergreen" clause, which no API in this library approaches.

## References

- `tools/api-floor-inventory.js` — `SUPPORT_MATRIX`, and the two guards this re-judged.
- [v0.1.0 readiness review](../releases/v0.1.0-readiness-review.md) §1.1 (the Safari defect),
  §3.7 (why no gate caught it).
- Spec 01 §1.1, §3 NFR-07, §6.
