# 2026-08-11 — The sanitizer's peer range (17.11)

## What got done

`peerDependencies.dompurify` is **`^3.4.13`**, not `^3`; the CI audit gate is
**`--audit-level moderate`**, not `high`; and the reasoning behind both is written down —
[ADR-0051](../../adr/0051-the-sanitizer-s-peer-range.md), `SECURITY.md`, and a standing risk in
the threat model.

| Change | Detail |
|---|---|
| Peer range | `^3` → **`^3.4.13`** — the first release without GHSA-55q2-fjhq-7xh7 |
| devDependency + lockfile | 3.4.12 (the last vulnerable version) → **3.4.13** |
| Audit gate | `--audit-level high` → **`moderate`**, in CI, `publish.yml` and the script |
| The two dev-only advisories it surfaces | **fixed** with pnpm overrides — postcss → 8.5.26, esbuild → 0.28.1 |
| `pnpm.auditConfig.ignoreGhsas` | stays **empty** |

## The decision worth carrying, which is not the number

**A peer range is a compatibility statement, not a security mechanism.** That sentence did most
of the work here, because it settles what the floor is *for*:

- raising a peer floor is breaking, and this project will not ship a major per advisory —
- so the floor's job is to exclude what is **already known bad at the moment 1.0 freezes it**,
  a one-time act;
- and an advisory published afterwards is the consumer's to patch, which they *can*, because
  they own the dependency. That is what a peer dependency is.

Without that framing the obvious alternatives both look reasonable and are both wrong: pinning
exactly (`3.4.13`) forbids the consumer from taking DOMPurify's own patches without waiting for
us, and chasing each future advisory through the range is a treadmill paid in major versions
that would still be slower than the consumer's own `npm audit`.

## Why the gate moved, on narrower grounds than "moderates matter"

The review asked whether `high` should stand. It should not — but the reason is specific:
**a DOMPurify advisory is the one finding in this tree that can require a change to this
library's own code.** If a bypass involves a configuration surface `sanitizeHtml` sets — its
pinned `IN_PLACE: false`, `RETURN_DOM: false`, the allowlist — the fix is ours, not the
consumer's. A gate that cannot see it is the wrong gate. "All moderate advisories are
important" would not have justified it; this does.

The two dev-only advisories that the lower threshold surfaces are **fixed rather than
excepted**, on ADR-0026's precedent: an override removes the vulnerable code from the tree, an
`ignoreGhsas` entry removes the *report*. So this is the first time in the project's history
with both a sub-`high` threshold and zero suppressions. It will go red more often, for
toolchain advisories we do not ship — accepted, because each one then gets a decision instead
of a threshold nobody revisits.

The esbuild override crosses a build tool's own dependency range (tsup's), so it was verified
rather than assumed: build, 2372 tests and all 98 size rows unchanged on 0.28.1.

## Honest about severity

`sanitizeHtml` was never exposed by GHSA-55q2-fjhq-7xh7 — it concerns DOMPurify's `IN_PLACE`
mode and this code pins `IN_PLACE: false`. Saying so plainly matters: the finding is about what
the package *claims* and what the gate can *see*, not about a reachable bug. Overstating it
would have been easy and would have made the ADR less useful.

## One flake, measured rather than waved at

`pnpm coverage` failed once locally on `sanitize.property.test.js` — timed out at 20 s. In
isolation with coverage that same test takes **2.06 s**, so it is worker-pool contention, which
is the exact phenomenon `vitest.config.js` already documents (it raised the timeout from 5 s to
20 s for this reason). The suite has grown to 2372 tests with three new jsdom-environment files
this milestone, so the 10× margin is thinner than it was. CI has been green on `pnpm coverage`
across the last five PRs, so nothing is changed here — but if that ever flakes in CI, the fix is
the timeout, not the test.

## Where the project stands

M17: 17.1, 17.2, 17.7, 17.8, 17.9, 17.11 done; 17.3–17.6, 17.10, 17.12–17.14 open. Five
changesets pending. ADRs through 0051, next free 0052. Gates green: 2371 tests, 100% lines /
99.38% branches, all 98 size rows, publint, attw, agadoo, zero-deps, TypeDoc, api-floor,
**audit clean at moderate with no exceptions**, consistency lint.

## How the next session resumes

1. Wait for this PR to merge (one item per PR).
2. **17.10** and **17.12** are the two remaining small ones (`withUrlParams`'s entry;
   the root error re-exports and spec 01 §5's stale enumeration) — either is a short PR.
3. **17.14** (collapse the `#webcrypto` shim) still wants a slot before M18 pins the exports
   map byte-identical, and **17.4** / **17.6** are the two decisions the roadmap records as the
   owner's.
