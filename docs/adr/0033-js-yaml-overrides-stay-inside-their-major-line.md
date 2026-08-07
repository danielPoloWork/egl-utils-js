# ADR-0033: A patched js-yaml on both major lines — and why the replacement range is pinned, not open

- **Status:** Accepted
- **Date:** 2026-08-07
- **Deciders:** Daniel Polo (maintainer), agent (senior project architect persona)
- **Related:** [ADR-0026](0026-brace-expansion-override-replaces-the-audit-exception.md) (the
  range-scoped override mechanism this reuses),
  [ADR-0016](0016-release-pipeline-and-supply-chain.md) (the supply-chain gate, and the
  unscoped-override failure both ADRs exist to avoid); advisory
  [GHSA-5p4m-2wfm-xmqj](https://github.com/advisories/GHSA-5p4m-2wfm-xmqj) / CVE-2026-59870

## Context

The first CI run on `main` after the M12 merges failed one job: `pnpm audit --audit-level
high` reported **two high advisories**, both GHSA-5p4m-2wfm-xmqj — quadratic CPU consumption
in js-yaml's `!!omap` resolution. The tree carried the vulnerability twice, on two different
major lines, both reached only through `@changesets/cli`:

- `js-yaml@3.15.0` via `@manypkg/get-packages > read-yaml-file` (patched in 3.15.1)
- `js-yaml@4.3.0` via `@changesets/read` (patched in 4.3.1)

Exposure is narrow: `@changesets/cli` is a devDependency, the parsed YAML is this
repository's own changeset files and lockfile, and the failure mode is CPU burn on a
maliciously shaped document. Nothing ships to consumers — the published package has zero
runtime dependencies (NFR-06). But the gate is not graded on exploitability, and a red
supply-chain job on `main` immediately before cutting a release is exactly the signal the
gate exists to produce.

## Decision

**Lift each vulnerable instance within its own major line, with two range-scoped overrides
whose replacement range is pinned to the patch line:**

```json
"overrides": {
  "brace-expansion@>=4.0.0 <5.0.9": ">=5.0.9",
  "js-yaml@>=3.0.0 <3.15.1": "~3.15.1",
  "js-yaml@>=4.0.0 <4.3.1": "~4.3.1"
}
```

Two properties matter, and the second was learned the hard way in this change.

**The key carries a version range** — the ADR-0026 mechanism. Each key matches exactly one
of the two vulnerable instances, so neither consumer is handed a version from the other's
major line.

**The replacement is `~`, not `>=`.** The first attempt reused ADR-0026's shape literally
and wrote `">=3.15.1"`. An open replacement range lets the resolver pick the newest
satisfying version, and it did: `js-yaml@5.2.3` was installed in place of a 3.x instance — a
two-major jump onto `read-yaml-file@1.1.0`, which is written against the 3.x API. That is
ADR-0016's original failure reproduced under a scoped key, and it is silent: the install
succeeds and the breakage waits for a code path to run. `~3.15.1` and `~4.3.1` permit only
the patch line, which is the smallest lift that clears the advisory. Verified in the
lockfile: `js-yaml@3.15.1` and `js-yaml@4.3.1`, one each, and `pnpm changeset status` still
reads the pending changesets — the very tool these versions serve, exercised before the
release that depends on it.

**`ignoreGhsas` stays empty.** As in ADR-0026: with the advisory actually resolved there is
nothing to suppress, and a suppression that outlives its advisory silently covers whatever
that GHSA reports next.

## Alternatives Considered

- **Suppress via `auditConfig.ignoreGhsas`** — rejected. The advisory is real, the fix is a
  patch bump, and ADR-0026 retired the last standing suppression precisely because stale
  suppressions accumulate authority they never earned.
- **Upgrade `@changesets/cli`** — the advisories are transitive, so this depends on upstream
  republishing with bumped ranges; the tool is already current (2.31.1). Rejected as a wait,
  not a fix. Dependabot will still raise the upgrade when it lands, and the overrides become
  inert rather than wrong.
- **A single unscoped `"js-yaml": "~4.3.1"` override** — rejected: it would force the 4.x
  patch onto the 3.x consumer, the same class of breakage as the `>=` mistake above.
- **Lower the gate to `--audit-level critical`** — rejected outright. Moving the threshold to
  make a finding disappear converts a gate into decoration.
- **Ship v0.5.0 with the job red and fix afterwards** — rejected: "tests next PR" is the
  shortcut AGENTS.md §10 forbids, and a release is the worst moment to carry a known-red
  supply-chain signal.

## Consequences

- `pnpm audit --audit-level high` exits 0 again; two findings remain below the threshold
  (1 low, 1 moderate), unchanged by this decision and unrelated to this advisory.
- The overrides block now has three entries and will keep growing until upstreams catch up.
  Each entry is a range pair that becomes inert once the dependency moves past it — worth a
  periodic sweep to delete the ones that no longer match anything, since an override that
  matches nothing is indistinguishable from one that matters.
- **The rule this adds to the ADR-0026 mechanism: scope the key *and* pin the replacement.**
  A scoped key alone still allows an arbitrary jump; the pair is what makes the lift
  minimal and reviewable.

## References

- [GHSA-5p4m-2wfm-xmqj](https://github.com/advisories/GHSA-5p4m-2wfm-xmqj) — the advisory
- [ADR-0026](0026-brace-expansion-override-replaces-the-audit-exception.md) — the mechanism
- [ADR-0016](0016-release-pipeline-and-supply-chain.md) — the supply-chain gate
- [pnpm docs: `pnpm.overrides`](https://pnpm.io/settings#overrides) — key and replacement
  semantics
