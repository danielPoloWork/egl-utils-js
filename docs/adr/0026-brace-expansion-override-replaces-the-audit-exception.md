# ADR-0026: A range-scoped override replaces the `brace-expansion` audit exception

- **Status:** Accepted
- **Date:** 2026-08-06
- **Deciders:** Daniel Polo (maintainer), agent (senior project architect persona)
- **Related:** amends **§6** of
  [ADR-0016](0016-release-pipeline-and-supply-chain.md) (which remains Accepted; only its
  "it cannot be fixed here" finding is superseded), spec 01 NFR-06 (zero runtime
  dependencies), `pnpm audit --audit-level high` gate in
  [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)

## Context

The `supply-chain` CI job went red on `main` after the v0.2.0 release merge — not because
a pull request changed anything, but because the world did, exactly the failure mode
ADR-0016 predicted and accepted. A new **high** advisory,
[GHSA-rgw5-rvv9-x895](https://github.com/advisories/GHSA-rgw5-rvv9-x895)
(`brace-expansion`: DoS via unbounded intermediate arrays, bypassing the CVE-2026-14257
mitigation), affects `>=4.0.0 <5.0.9` and is patched in `5.0.9`. It was reached by one
dev-only path: `@vitest/coverage-v8 > test-exclude > minimatch@10 > brace-expansion@5.0.8`.

ADR-0016 §6 had already excepted an *earlier* `brace-expansion` advisory
(`GHSA-mh99-v99m-4gvg`) through `pnpm.auditConfig.ignoreGhsas`, and recorded a specific
reason why a fix was impossible rather than merely inconvenient: forcing v5 with a pnpm
override **broke the toolchain**, because v5 changed its export shape and `minimatch@9`
then failed with `brace_expansion_1.default is not a function`. The real fix, it said,
was upstream — eslint and vitest moving to `minimatch@10`.

Two things have changed since:

1. **The upstream move happened, partially.** `test-exclude@7` now resolves
   `minimatch@10`, which is the v5-compatible line — which is precisely why this project
   is now exposed to a **v5** advisory at all. Meanwhile `eslint` still brings
   `minimatch@3` (`brace-expansion@1.1.18`) and `glob@10` brings `minimatch@9`
   (`brace-expansion@2.1.4`).
2. **The maintenance lines were patched.** `1.1.18` and `2.1.4` are both above the fixed
   versions of the original advisory, so the tree's only remaining exposure was the v5
   instance.

Together these turn ADR-0016's blanket conclusion into a false one: a fix *is* available
here, provided it is aimed only at the v5 instance.

## Decision

**Lift only the vulnerable range, with a range-scoped pnpm override, and delete the audit
exception it makes obsolete.**

```json
"pnpm": {
  "auditConfig": { "ignoreGhsas": [] },
  "overrides": { "brace-expansion@>=4.0.0 <5.0.9": ">=5.0.9" }
}
```

The override **key carries a version range**, which is the whole point. ADR-0016's failed
attempt used an unscoped override, so v5 was forced onto `minimatch@9` — a consumer
written against the v1/v2 default-export shape. This key matches only the already-v5
instance and raises it within its own major line, so:

- `@vitest/coverage-v8 > test-exclude > minimatch@10` now resolves `brace-expansion@5.0.9`
  (verified: the lockfile records `brace-expansion: 5.0.9` for `minimatch@10.2.6`, and the
  installed symlink points at `brace-expansion@5.0.9`);
- `eslint > minimatch@3` keeps `1.1.18` and `glob@10 > minimatch@9` keeps `2.1.4`,
  untouched — the export-shape breakage ADR-0016 hit cannot occur.

**`ignoreGhsas` is emptied rather than extended.** With the list empty and the override in
place, `pnpm audit --audit-level high` exits 0 and no `brace-expansion` advisory appears in
the tree at any severity: the legacy `GHSA-mh99-v99m-4gvg` exception had become a stale
suppression, and a stale suppression is worse than no suppression because it silently
covers whatever that GHSA reports next. The empty array is kept (rather than deleting the
`auditConfig` block) to document that the mechanism exists and is deliberately unused.

**The gate is verified to be scoped, not silenced** — the same check ADR-0016 used:
at `--audit-level low` the audit still exits 1 on the two remaining dev-only advisories
(`postcss` moderate via `tsup`, `esbuild` low via `tsup`), so the `high` pass is a real
pass and not a blanket suppression.

## Alternatives Considered

- **Add `GHSA-rgw5-rvv9-x895` to `ignoreGhsas`** — one line, and the path ADR-0016 already
  paved. Rejected because the premise no longer holds: a patched version exists, is
  reachable, and installs cleanly. ADR-0016 deliberately made the escape hatch more
  effort than fixing the dependency; taking the hatch when a fix works would invert that.
- **An unscoped `"brace-expansion": ">=5.0.9"` override.** Rejected on recorded evidence:
  ADR-0016 documents that forcing v5 onto the v1/v2 consumers breaks the toolchain. The
  range-scoped key exists precisely to avoid re-learning that.
- **Bump `@vitest/coverage-v8` and hope the transitive resolves.** Rejected as
  indirection: the vulnerable package is three levels down, so the fix would depend on
  vitest's own dependency bump timing while CI stays red. The override is exact and can be
  removed the moment `test-exclude` ships a patched floor.
- **Lower the audit threshold to `critical`.** Rejected for the same reason ADR-0016
  rejected it: it would make the gate green by making it weaker, and would hide the next
  real high advisory.
- **Waiting for upstream.** Rejected because `main` is red *now*, and a red gate that
  everyone learns to ignore is a worse outcome than a precise pin.

## Consequences

- The `supply-chain` job is green again with **zero audit exceptions** — the posture
  ADR-0016 wanted and could not reach at the time.
- The override is a **temporary pin with an obvious removal condition**: once
  `test-exclude` (or whatever supplies `minimatch@10`) declares a floor at
  `brace-expansion >= 5.0.9`, the override becomes a no-op and should be deleted. Because
  the key is range-scoped, it also self-retires for any future instance that starts at
  `5.0.9` or above.
- One new obligation: `pnpm.overrides` is now part of this project's supply-chain surface,
  so a reviewer must read it as such. It is a single line, and NFR-06 still guarantees no
  dev dependency reaches a consumer (`files` publishes `dist` plus the two shim sources).
- Verified unaffected by the bump: the full suite (857 tests, 100% line and branch
  coverage — coverage itself runs through the bumped path), ESLint, Prettier, the
  consistency lint, and version lockstep.
- The remaining `postcss` (moderate) and `esbuild` (low) advisories, both via `tsup`, stay
  below the gate's threshold and are recorded here so they are known rather than
  rediscovered. Neither is shipped; both are build-time.

## References

- [ADR-0016 §6](0016-release-pipeline-and-supply-chain.md) — the supply-chain gate and the
  exception this ADR retires
- [GHSA-rgw5-rvv9-x895](https://github.com/advisories/GHSA-rgw5-rvv9-x895) — the advisory
- [pnpm `overrides`](https://pnpm.io/settings#overrides) — range-scoped selector syntax
