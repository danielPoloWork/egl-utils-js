# 2026-08-06 — pageSessionId on /storage (roadmap 9.5)

## What got done

- `pageSessionId` added to the `/storage` entry (spec 02 F39) — a v4 UUID under
  `sessionStorage` semantics, built on the existing wrapper contract and `uuid`.
- [ADR-0024](../../../adr/0024-page-session-id-scope-and-budget.md) fixes the scope (a
  correlation id, not a credential) and records the budget divergence it forced.
- 15 example tests plus two Playwright cases; `storage.js` back at 100% line and branch
  coverage, full suite 836 passing.

## Decisions taken

- **It is a correlation id, not a credential.** Unguessable (CSPRNG, ADR-0008) but
  unauthenticated and readable by any script on the page. An opaque per-tab string looks
  exactly like a session token, so the disclaimer sits in the JSDoc, the ADR, the README,
  and the changelog rather than being left to inference.
- **It reuses `uuid` rather than reimplementing entropy handling.** ADR-0008 centralizes
  that decision precisely so no module reinvents it; two copies of an entropy path is how
  one of them eventually grows a `Math.random` fallback "just for tests".
- **Degradation is silent and total.** Blocked storage falls back to memory (stable per
  realm, so a reload mints a new id); a corrupt stored value is replaced; a refused write
  is absorbed. A diagnostics helper must never be the reason a page breaks.
  `isPersistent()` is how a caller observes which mode is in force.
- **`sessionStorage`, not `localStorage`.** A browser-lifetime id correlates a person
  across sessions — a different tool with different privacy implications. A caller who
  wants that passes `localStorageWrapper` as `storage` and owns the choice explicitly.
- No module-level memoization: the store is the source of truth, and module-level mutable
  state is what the dual-package rule keeps out of this library.

## The budget this broke, and why it was the right break

Importing `uuid` made `/storage` cross the 2 kB NFR-01 clause. Measured:

| Scenario | Before | After |
|---|---|---|
| `/storage` full import | 1706 B | **2027 B** |
| the three original wrappers only | 1706 B | **1698 B** |
| `pageSessionId` alone | — | 888 B |

So the clause is breached by **27 B**, and only by the scenario importing all four
exports; a consumer of just the wrappers pays *8 B less* than before. The alternative —
reimplementing UUID generation inside `storage.js` to dodge the crypto chunk — would
duplicate a security-sensitive function to save 27 B on a scenario few consumers run.

Amended spec 01 NFR-01's `/storage` clause to 2.1 kB, following the divergence-note
pattern already established there for `httpClient`/ADR-0015. Both scenarios are now
permanent size-limit rows, so **the wrappers-only row is the standing guard**: if shaking
ever regresses and the cost starts reaching non-users, CI fails rather than someone
noticing later.

Side effect worth knowing: tsup now emits a shared `crypto` chunk, because the root and
`/storage` both import it. That is what stops the crypto code being emitted twice; all
packaging gates pass with it.

## Where the project stands

M9 is five of six done. Only **9.6 `createResource`** remains before v0.2.0. Root full
import is 5556 B against the frozen 6 kB ceiling — the crunch flagged in 9.4 arrives next
item, with roughly 440 B of headroom for an addition estimated at ~350 B.

## How the next session resumes

1. Wait for this PR to merge (one PR at a time).
2. Start roadmap **9.6** on `feat/create-resource`: the repository factory over an
   injected `httpClient`-compatible transport (spec 02 F38) — `list/get/create/update/
   patch/remove`, path segments and ids URL-encoded, per-call options passed through,
   `TypeError` when the client lacks a verb. The client is a **parameter, never an
   import**: that is what keeps it ~0.35 kB and out of a second ADR-0015 exception. It
   needs a Repository row in the patterns catalogue and an ADR. Watch the root row — this
   is the wave's last root addition and the ceiling is close.
3. Then M9 is complete: cut **v0.2.0** (changelog prose + release notes PR, maintainer
   merges the Version PR and publishes).
