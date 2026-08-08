---
id: BUG-0002
title: Every CI job fails at install — the lockfile was never updated for the bootstrap peer
status: fixed
severity: high
reporter: internal
discovered: 2026-08-08
affected-versions: none released — the defect is in the repository's install manifest, not in shipped code
fixed-in: v0.7.0
---

# BUG-0002: Every CI job fails at install — the lockfile was never updated for the `bootstrap` peer

## Summary

**All nine CI jobs** — the three `build` matrix cells, `lint`, `consistency`, `packaging`,
`supply-chain`, `benchmark` and `browser` — failed on `main` from roadmap 14.1 (PR #92)
until this record closed, every one of them at the very first step:

```
ERR_PNPM_OUTDATED_LOCKFILE  Cannot install with "frozen-lockfile"
because pnpm-lock.yaml is not up to date with <ROOT>/package.json
```

14.1 declared `bootstrap` as an **optional** peer dependency in `package.json` and did not
regenerate `pnpm-lock.yaml`. `pnpm install --frozen-lockfile`, which every job runs before
anything else, refuses a manifest the lockfile does not match. **No shipped code was
affected**: nothing about the library's behaviour, surface or budgets changed, and the same
gates all pass locally. What was lost was the *gate itself* — for two merges, CI proved
nothing.

## Environment

- **Affected versions:** none released — repository manifest only, present from 14.1 onward
- **Toolchain / platform:** every environment running `pnpm install --frozen-lockfile`
  (pnpm 10.34.5). Local development was unaffected, which is precisely why it went
  unnoticed.

## Reproduction

1. Check out `main` at `85e4050` (or any commit from `6a41d84` onward).
2. Run `pnpm install --frozen-lockfile`.
3. It exits 1 with `ERR_PNPM_OUTDATED_LOCKFILE`.

Deterministic, and reproducible on a clean checkout in one command.

## Root cause

Two distinct mistakes, one technical and one procedural.

**Technical.** A peer dependency is part of the install manifest, so adding one changes the
resolution the lockfile records. It has to be regenerated in the same commit.

**Procedural, and the more important of the two.** The 14.1 and 14.2 verification passes ran
each quality gate individually through `npx` — `npx vitest`, `npx eslint`, `npx size-limit`
— against a `node_modules` that was already installed and already correct. That exercises
every gate *except the one that failed*. The PR bodies then reported "Builds cleanly on the
full CI matrix" on the strength of those runs, which was an unfounded claim: the matrix had
not been run, and a local green tells you nothing about `--frozen-lockfile`.

A third, smaller trap surfaced during the fix: `pnpm install --lockfile-only` resolved the
optional peer into the root importer's `dependencies` (pnpm auto-installs peers by default),
which would have recorded `bootstrap` and `@popperjs/core` as runtime dependencies of the
workspace. Declaring `bootstrap` in `devDependencies` — exactly as `dompurify`, the other
optional peer, already is — makes the peer resolve from there instead. `package.json`
`dependencies` stays empty and NFR-06 is untouched; the devDependency is also what M16 needs
to test the real package against.

## Fix

- `bootstrap` added to `devDependencies` (`^5.3.8`), mirroring the `dompurify` precedent.
- `pnpm-lock.yaml` regenerated; `bootstrap` is recorded under `devDependencies`, and
  `importers['.'].dependencies` stays absent.
- Verified by running the command that was failing — `pnpm install --frozen-lockfile`,
  exit 0 — rather than by inspecting the diff.

## Prevention

`pnpm install --frozen-lockfile` is now the **first** command of the local gate sequence,
before any `npx` invocation, so a manifest change that the lockfile does not match fails on
the workstation instead of on `main`. The general rule the two PRs got wrong: a verification
checkbox may only be ticked for a command that was actually run. Where a gate cannot be run
locally, the honest report is to say so — as the 14.2 body did for the flaky browser suite —
not to infer it from adjacent evidence.
